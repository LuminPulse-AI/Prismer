import type { NextRequest } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@/lib/mcp/server';
import { authenticateMcpRequest, McpAuthError } from '@/lib/mcp/auth';
import { createLogger } from '@/lib/logger';
import type { TokenContext } from '@/lib/mcp/tokens';

const log = createLogger('McpRoute');

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function handle(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id: workspaceId } = await params;
  const start = Date.now();

  let token: TokenContext;
  try {
    token = await authenticateMcpRequest(req, workspaceId);
  } catch (err) {
    if (err instanceof McpAuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('Auth error', { workspaceId, err: String(err) });
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // SDK 1.29 ships WebStandardStreamableHTTPServerTransport which speaks Web
  // Standard Request/Response directly — no Node ↔ Web adapter required.
  const server = createMcpServer({ workspaceId, token });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  let response: Response;
  try {
    await server.connect(transport);
    response = await transport.handleRequest(req);
  } catch (err) {
    log.error('Transport error', { workspaceId, tokenPrefix: token.prefix, err: String(err) });
    response = new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Internal error' }, id: null }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  log.info('MCP request handled', {
    workspaceId,
    tokenPrefix: token.prefix,
    method: req.method,
    durationMs: Date.now() - start,
    status: response.status,
  });
  return response;
}

export const POST = handle;
export const GET = handle;
