import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpTokens');

const TOKEN_PREFIX = 'pmsk_';
const RANDOM_BYTES = 32;
const PREFIX_VISIBLE_LEN = 8;

export interface CreateTokenInput {
  workspaceId: string;
  name: string;
  createdBy: string;
  expiresAt?: Date;
}

export interface CreatedToken {
  id: string;
  prefix: string;
  name: string;
  plaintext: string;
}

export interface TokenSummary {
  id: string;
  prefix: string;
  name: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface TokenContext {
  tokenId: string;
  workspaceId: string;
  prefix: string;
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function generatePlaintext(): { plaintext: string; prefix: string } {
  const random = randomBytes(RANDOM_BYTES).toString('base64url');
  const plaintext = TOKEN_PREFIX + random;
  const prefix = TOKEN_PREFIX + random.slice(0, PREFIX_VISIBLE_LEN);
  return { plaintext, prefix };
}

export async function createMcpToken(input: CreateTokenInput): Promise<CreatedToken> {
  const { plaintext, prefix } = generatePlaintext();
  const tokenHash = hashToken(plaintext);

  const row = await prisma.workspaceMcpToken.create({
    data: {
      workspaceId: input.workspaceId,
      tokenHash,
      prefix,
      name: input.name,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    },
  });

  log.info('MCP token created', {
    workspaceId: input.workspaceId,
    tokenId: row.id,
    prefix,
  });

  return { id: row.id, prefix, name: row.name, plaintext };
}

export async function listMcpTokens(workspaceId: string): Promise<TokenSummary[]> {
  const rows = await prisma.workspaceMcpToken.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      prefix: true,
      name: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function revokeMcpToken(workspaceId: string, tokenId: string): Promise<void> {
  await prisma.workspaceMcpToken.updateMany({
    where: { id: tokenId, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  log.info('MCP token revoked', { workspaceId, tokenId });
}

export class TokenWorkspaceMismatchError extends Error {
  override name = 'TokenWorkspaceMismatchError' as const;
  constructor(message: string) {
    super(message);
  }
}

export async function validateMcpToken(
  plaintext: string,
  workspaceId: string
): Promise<TokenContext> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    throw new Error('Invalid token format');
  }

  const tokenHash = hashToken(plaintext);
  const row = await prisma.workspaceMcpToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      workspaceId: true,
      prefix: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!row) {
    throw new Error('Token not found');
  }
  if (row.revokedAt) {
    throw new Error('Token revoked');
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new Error('Token expired');
  }
  if (row.workspaceId !== workspaceId) {
    throw new TokenWorkspaceMismatchError('Token does not match workspace');
  }

  // Fire-and-forget lastUsedAt update — failures are non-fatal.
  prisma.workspaceMcpToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => log.warn('Failed to update lastUsedAt', { tokenId: row.id, err: String(err) }));

  return { tokenId: row.id, workspaceId: row.workspaceId, prefix: row.prefix };
}
