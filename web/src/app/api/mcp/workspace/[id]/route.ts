import { NextRequest, NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createLogger } from '@/lib/logger';
import { validateMcpRequest, McpAuthError } from '@/lib/mcp/auth';
import { createWorkspaceMcpServer } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

const log = createLogger('MCPRoute');

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  return handleMcpRequest(request, params);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  return handleMcpRequest(request, params);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return handleMcpRequest(request, params);
}

async function handleMcpRequest(
  request: NextRequest,
  params: Promise<{ id: string }>
): Promise<Response> {
  const { id: workspaceId } = await params;

  try {
    const auth = await validateMcpRequest(request, workspaceId);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createWorkspaceMcpServer({
      workspaceId,
      baseUrl: request.nextUrl.origin,
      tokenPrefix: auth.tokenPrefix,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control', 'no-cache, no-transform');
    return response;
  } catch (error) {
    if (error instanceof McpAuthError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }

    log.error('MCP route failed', {
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
