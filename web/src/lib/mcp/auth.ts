import { TokenWorkspaceMismatchError, validateMcpToken, type TokenContext } from '@/lib/mcp/tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpAuth');

export class McpAuthError extends Error {
  override name = 'McpAuthError' as const;
  constructor(
    public status: 401 | 403,
    message: string
  ) {
    super(message);
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// SECURITY: dev-fallback consumes the first entry of x-forwarded-for. Production
// reverse proxies typically append, so the first entry IS the original client.
// In `next dev` without an upstream proxy, a remote client COULD spoof
// `X-Forwarded-For: 127.0.0.1` to satisfy isLoopback(). Therefore, when running
// with MCP_AUTH_MODE=disabled, the listener MUST be bound to 127.0.0.1 only
// (e.g. `next dev -H 127.0.0.1`). Self-host docs should call this out.
function isLoopback(req: Request): boolean {
  const xff = req.headers.get('x-forwarded-for');
  const candidate = (xff?.split(',')[0]?.trim() ?? '').toLowerCase();
  return LOOPBACK.has(candidate);
}

function devFallbackEnabled(req: Request): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.MCP_AUTH_MODE === 'disabled' &&
    isLoopback(req)
  );
}

export async function authenticateMcpRequest(
  req: Request,
  workspaceId: string
): Promise<TokenContext> {
  if (devFallbackEnabled(req)) {
    log.warn('Auth bypassed via dev fallback', { workspaceId });
    return { tokenId: 'dev', workspaceId, prefix: 'dev' };
  }

  const header = req.headers.get('authorization');
  if (!header) {
    throw new McpAuthError(401, 'Missing Authorization header');
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new McpAuthError(401, 'Malformed Authorization header');
  }
  const plaintext = match[1].trim();

  try {
    const ctx = await validateMcpToken(plaintext, workspaceId);
    return ctx;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof TokenWorkspaceMismatchError ? 403 : 401;
    log.warn('Auth rejected', { workspaceId, reason: msg, status });
    // External-facing message is generic to avoid info-leak; details are in logs only.
    throw new McpAuthError(status, status === 403 ? 'Forbidden' : 'Unauthorized');
  }
}
