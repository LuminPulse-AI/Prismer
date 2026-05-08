import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/mcp/tokens', async () => {
  const actual = await vi.importActual<typeof import('@/lib/mcp/tokens')>('@/lib/mcp/tokens');
  return {
    ...actual,
    validateMcpToken: vi.fn(),
  };
});

import { TokenWorkspaceMismatchError, validateMcpToken } from '@/lib/mcp/tokens';
import { authenticateMcpRequest } from '@/lib/mcp/auth';

const mockedValidate = validateMcpToken as ReturnType<typeof vi.fn>;

function makeRequest(opts: { authorization?: string; remoteAddr?: string }): Request {
  const headers = new Headers();
  if (opts.authorization) headers.set('authorization', opts.authorization);
  if (opts.remoteAddr) headers.set('x-forwarded-for', opts.remoteAddr);
  return new Request('http://localhost/api/mcp/workspace/ws1', { headers });
}

describe('authenticateMcpRequest', () => {
  beforeEach(() => {
    mockedValidate.mockReset();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects request with no Authorization header (401)', async () => {
    await expect(authenticateMcpRequest(makeRequest({}), 'ws1')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects malformed Authorization header (401)', async () => {
    await expect(authenticateMcpRequest(makeRequest({ authorization: 'NotBearer xyz' }), 'ws1'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('rejects when token validation fails (401)', async () => {
    mockedValidate.mockRejectedValueOnce(new Error('Token revoked'));
    await expect(authenticateMcpRequest(makeRequest({ authorization: 'Bearer pmsk_xxx' }), 'ws1'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('rejects when token belongs to different workspace (403)', async () => {
    mockedValidate.mockRejectedValueOnce(new TokenWorkspaceMismatchError('Token does not match workspace'));
    await expect(authenticateMcpRequest(makeRequest({ authorization: 'Bearer pmsk_xxx' }), 'ws1'))
      .rejects.toMatchObject({ status: 403 });
  });

  it('passes valid token and returns context', async () => {
    mockedValidate.mockResolvedValueOnce({
      tokenId: 't1',
      workspaceId: 'ws1',
      prefix: 'pmsk_abcd1234',
    });
    const ctx = await authenticateMcpRequest(makeRequest({ authorization: 'Bearer pmsk_xxx' }), 'ws1');
    expect(ctx).toEqual({ tokenId: 't1', workspaceId: 'ws1', prefix: 'pmsk_abcd1234' });
  });

  it('dev fallback: skips when MCP_AUTH_MODE=disabled AND NODE_ENV=development AND remote is localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');
    const ctx = await authenticateMcpRequest(makeRequest({ remoteAddr: '127.0.0.1' }), 'ws1');
    expect(ctx).toMatchObject({ workspaceId: 'ws1', prefix: 'dev' });
    expect(mockedValidate).not.toHaveBeenCalled();
  });

  it('dev fallback: rejects when remote is non-loopback', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');
    await expect(authenticateMcpRequest(makeRequest({ remoteAddr: '192.168.1.5' }), 'ws1'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('dev fallback: rejects when NODE_ENV=production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');
    await expect(authenticateMcpRequest(makeRequest({ remoteAddr: '127.0.0.1' }), 'ws1'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('dev fallback: rejects when MCP_AUTH_MODE!=disabled', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'enabled');
    await expect(authenticateMcpRequest(makeRequest({ remoteAddr: '127.0.0.1' }), 'ws1'))
      .rejects.toMatchObject({ status: 401 });
  });
});
