import type { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { hashMcpToken, getMcpTokenPrefix } from './tokens';

const log = createLogger('MCPAuth');

export interface McpAuthContext {
  workspaceId: string;
  tokenId: string | null;
  tokenPrefix: string;
  authDisabled: boolean;
}

export class McpAuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'McpAuthError';
  }
}

export async function validateMcpRequest(
  request: NextRequest,
  workspaceId: string
): Promise<McpAuthContext> {
  if (isDevAuthDisabled(request)) {
    return {
      workspaceId,
      tokenId: null,
      tokenPrefix: 'dev-local',
      authDisabled: true,
    };
  }

  const token = extractBearerToken(request);
  if (!token) {
    log.warn('MCP request missing bearer token', { workspaceId });
    throw new McpAuthError(401, 'MISSING_BEARER_TOKEN', 'Missing bearer token');
  }

  const tokenHash = hashMcpToken(token);
  const record = await prisma.workspaceMcpToken.findUnique({
    where: { tokenHash },
  });

  if (!record) {
    log.warn('MCP request used unknown token', {
      workspaceId,
      prefix: safeTokenPrefix(token),
    });
    throw new McpAuthError(401, 'INVALID_TOKEN', 'Invalid MCP token');
  }

  if (record.revokedAt) {
    log.warn('MCP request used revoked token', {
      workspaceId,
      prefix: record.prefix,
    });
    throw new McpAuthError(401, 'REVOKED_TOKEN', 'MCP token has been revoked');
  }

  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
    log.warn('MCP request used expired token', {
      workspaceId,
      prefix: record.prefix,
    });
    throw new McpAuthError(401, 'EXPIRED_TOKEN', 'MCP token has expired');
  }

  if (record.workspaceId !== workspaceId) {
    log.warn('MCP token workspace mismatch', {
      workspaceId,
      tokenWorkspaceId: record.workspaceId,
      prefix: record.prefix,
    });
    throw new McpAuthError(403, 'WORKSPACE_MISMATCH', 'MCP token is not valid for this workspace');
  }

  void prisma.workspaceMcpToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  }).catch((error: unknown) => {
    log.warn('Failed to update MCP token lastUsedAt', {
      workspaceId,
      prefix: record.prefix,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return {
    workspaceId,
    tokenId: record.id,
    tokenPrefix: record.prefix,
    authDisabled: false,
  };
}

function extractBearerToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  if (!auth) return null;

  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match?.[1]?.trim() || null;
}

function safeTokenPrefix(token: string): string {
  if (token.startsWith('pmsk_') && token.length >= 13) {
    return getMcpTokenPrefix(token);
  }
  return 'unknown';
}

function isDevAuthDisabled(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.MCP_AUTH_MODE === 'disabled' &&
    isLoopbackRequest(request)
  );
}

function isLoopbackRequest(request: NextRequest): boolean {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const forwarded = request.headers.get('forwarded');
  const forwardedHost = forwarded?.match(/for="?([^;,"]+)/i)?.[1];
  const remoteAddress = forwardedFor || realIp || forwardedHost || '';
  const normalized = remoteAddress.replace(/^\[|\]$/g, '').replace(/^::ffff:/, '');

  return normalized === '127.0.0.1' || normalized === '::1';
}
