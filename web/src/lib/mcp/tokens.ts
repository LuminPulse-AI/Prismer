import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/prisma';

const TOKEN_PREFIX = 'pmsk_';
const TOKEN_RANDOM_BYTES = 32;
const PREFIX_RANDOM_CHARS = 8;

export interface WorkspaceMcpTokenListItem {
  id: string;
  prefix: string;
  name: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface CreatedWorkspaceMcpToken extends WorkspaceMcpTokenListItem {
  plaintext: string;
}

export function hashMcpToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function generateMcpTokenPlaintext(): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_RANDOM_BYTES).toString('base64url')}`;
}

export function getMcpTokenPrefix(plaintext: string): string {
  return plaintext.slice(0, TOKEN_PREFIX.length + PREFIX_RANDOM_CHARS);
}

function normalizeTokenName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error('Token name is required');
  }
  return normalized.slice(0, 80);
}

export async function createWorkspaceMcpToken(input: {
  workspaceId: string;
  name: string;
  createdBy: string;
}): Promise<CreatedWorkspaceMcpToken> {
  const plaintext = generateMcpTokenPlaintext();
  const token = await prisma.workspaceMcpToken.create({
    data: {
      workspaceId: input.workspaceId,
      tokenHash: hashMcpToken(plaintext),
      prefix: getMcpTokenPrefix(plaintext),
      name: normalizeTokenName(input.name),
      createdBy: input.createdBy,
    },
  });

  await markWorkspaceMcpEnabled(input.workspaceId);

  return {
    id: token.id,
    prefix: token.prefix,
    name: token.name,
    plaintext,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt,
  };
}

export async function listWorkspaceMcpTokens(
  workspaceId: string
): Promise<WorkspaceMcpTokenListItem[]> {
  const tokens = await prisma.workspaceMcpToken.findMany({
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

  return tokens;
}

export async function revokeWorkspaceMcpToken(input: {
  workspaceId: string;
  tokenId: string;
}): Promise<void> {
  await prisma.workspaceMcpToken.updateMany({
    where: {
      id: input.tokenId,
      workspaceId: input.workspaceId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function markWorkspaceMcpEnabled(workspaceId: string): Promise<void> {
  const agent = await prisma.agentInstance.findUnique({
    where: { workspaceId },
    select: { id: true, metadata: true },
  });

  if (!agent) return;

  let metadata: Record<string, unknown> = {};
  if (agent.metadata) {
    try {
      const parsed = JSON.parse(agent.metadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch {
      metadata = {};
    }
  }

  if (metadata.mcpEnabled === true) return;

  await prisma.agentInstance.update({
    where: { id: agent.id },
    data: {
      metadata: JSON.stringify({ ...metadata, mcpEnabled: true }),
    },
  });
}
