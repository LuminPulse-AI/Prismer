/**
 * Jupyter Server Proxy
 *
 * Proxies all Jupyter Server requests to resolve CORS issues.
 *
 * Usage:
 * - Frontend requests: /api/jupyter/{path}
 * - Proxied to: JUPYTER_SERVER_URL/{path}
 *
 * Dynamic container support:
 * - Query parameter ?port=XXXX specifies the container-mapped Jupyter port
 * - Without a port parameter, uses the JUPYTER_SERVER_URL environment variable or queries the database
 */

import { NextRequest, NextResponse } from 'next/server';

// Get default Jupyter Server configuration from environment variables
const DEFAULT_JUPYTER_URL = process.env.JUPYTER_SERVER_URL || 'http://localhost:8888';
const JUPYTER_TOKEN = process.env.JUPYTER_TOKEN || '';

/**
 * Resolve the target Jupyter Server URL
 * Priority: query param port > env var > default
 */
function resolveJupyterUrl(request: NextRequest): string {
  const port = request.nextUrl.searchParams.get('port');
  if (port && /^\d+$/.test(port)) {
    return `http://localhost:${port}`;
  }
  return DEFAULT_JUPYTER_URL;
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
  method: string
): Promise<NextResponse> {
  const jupyterUrl = resolveJupyterUrl(request);
  const targetPath = path.join('/');

  // Build query string without our custom 'port' param
  const url = new URL(request.url);
  url.searchParams.delete('port');
  const queryString = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
  const targetUrl = `${jupyterUrl}/${targetPath}${queryString}`;

  try {
    // Build request headers
    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    };

    // Add token authentication
    if (JUPYTER_TOKEN) {
      headers['Authorization'] = `token ${JUPYTER_TOKEN}`;
    }

    // Forward the original request's authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Prepare request body
    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await request.text();
      } catch {
        // No request body
      }
    }

    // Send proxied request
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    // Get response data
    const contentType = response.headers.get('Content-Type') || '';
    let responseBody: string | ArrayBuffer;

    if (contentType.includes('application/json')) {
      responseBody = await response.text();
    } else {
      responseBody = await response.arrayBuffer();
    }

    // Build response
    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('[Jupyter Proxy] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to connect to Jupyter Server',
        details: error instanceof Error ? error.message : 'Unknown error',
        targetUrl,
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'DELETE');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'PATCH');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
