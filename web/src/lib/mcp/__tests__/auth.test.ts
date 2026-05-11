import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashMcpToken } from '../tokens';

const prismaMock = vi.hoisted(() => ({
  workspaceMcpToken: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/mcp/workspace/ws-1', { headers });
}

describe('validateMcpRequest', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects requests without bearer tokens', async () => {
    const { validateMcpRequest, McpAuthError } = await import('../auth');

    await expect(validateMcpRequest(makeRequest(), 'ws-1')).rejects.toBeInstanceOf(McpAuthError);
    await expect(validateMcpRequest(makeRequest(), 'ws-1')).rejects.toMatchObject({ status: 401 });
  });

  it('accepts valid bearer tokens for the path workspace', async () => {
    const { validateMcpRequest } = await import('../auth');
    const token = 'pmsk_abcdefghijklmnopqrstuvwxyzABCDEFG';
    prismaMock.workspaceMcpToken.findUnique.mockResolvedValue({
      id: 'token-1',
      workspaceId: 'ws-1',
      tokenHash: hashMcpToken(token),
      prefix: 'pmsk_abcdefgh',
      revokedAt: null,
      expiresAt: null,
    });
    prismaMock.workspaceMcpToken.update.mockResolvedValue({});

    await expect(validateMcpRequest(makeRequest({
      authorization: `Bearer ${token}`,
    }), 'ws-1')).resolves.toMatchObject({
      workspaceId: 'ws-1',
      tokenId: 'token-1',
      tokenPrefix: 'pmsk_abcdefgh',
      authDisabled: false,
    });
  });

  it('rejects cross-workspace token replay', async () => {
    const { validateMcpRequest } = await import('../auth');
    const token = 'pmsk_abcdefghijklmnopqrstuvwxyzABCDEFG';
    prismaMock.workspaceMcpToken.findUnique.mockResolvedValue({
      id: 'token-1',
      workspaceId: 'ws-2',
      tokenHash: hashMcpToken(token),
      prefix: 'pmsk_abcdefgh',
      revokedAt: null,
      expiresAt: null,
    });

    await expect(validateMcpRequest(makeRequest({
      authorization: `Bearer ${token}`,
    }), 'ws-1')).rejects.toMatchObject({ status: 403 });
  });

  it('allows explicit localhost dev fallback only when all conditions match', async () => {
    const { validateMcpRequest } = await import('../auth');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');

    await expect(validateMcpRequest(makeRequest({
      'x-forwarded-for': '127.0.0.1',
    }), 'ws-1')).resolves.toMatchObject({
      tokenPrefix: 'dev-local',
      authDisabled: true,
    });

    expect(prismaMock.workspaceMcpToken.findUnique).not.toHaveBeenCalled();
  });
});
