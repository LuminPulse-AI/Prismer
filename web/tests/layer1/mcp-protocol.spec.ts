import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface MintedToken {
  workspaceId: string;
  workspaceName: string;
  tokenId: string;
  plaintext: string;
}

async function createWorkspace(
  request: APIRequestContext,
  name: string
): Promise<string> {
  const response = await request.post('/api/workspace', {
    data: { name },
  });
  expect(response.ok(), `create workspace ${name}`).toBeTruthy();
  const body = await response.json();
  expect(body.success).toBe(true);
  return body.data.id as string;
}

async function mintToken(
  request: APIRequestContext,
  workspaceId: string,
  label: string
): Promise<{ id: string; plaintext: string }> {
  const response = await request.post(
    `/api/workspace/${workspaceId}/mcp-tokens`,
    { data: { name: label } }
  );
  expect(response.ok(), `mint token ${label}`).toBeTruthy();
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.plaintext).toMatch(/^pmsk_/);
  return { id: body.data.id as string, plaintext: body.data.plaintext as string };
}

async function revokeToken(
  request: APIRequestContext,
  workspaceId: string,
  tokenId: string
): Promise<void> {
  const response = await request.delete(
    `/api/workspace/${workspaceId}/mcp-tokens/${tokenId}`
  );
  expect(response.ok(), `revoke token ${tokenId}`).toBeTruthy();
}

async function setupWorkspaceWithToken(
  request: APIRequestContext,
  name: string
): Promise<MintedToken> {
  const workspaceId = await createWorkspace(request, name);
  const token = await mintToken(request, workspaceId, `${name} token`);
  return {
    workspaceId,
    workspaceName: name,
    tokenId: token.id,
    plaintext: token.plaintext,
  };
}

function buildMcpUrl(baseURL: string, workspaceId: string): URL {
  return new URL(`/api/mcp/workspace/${workspaceId}`, baseURL);
}

async function connectClient(
  baseURL: string,
  workspaceId: string,
  bearerToken: string | null
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(buildMcpUrl(baseURL, workspaceId), {
    requestInit: bearerToken
      ? { headers: { Authorization: `Bearer ${bearerToken}` } }
      : undefined,
  });
  const client = new Client({ name: 'prismer-l1-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

test.describe('@layer1 MCP protocol surface', () => {
  test('lists the three Phase 1 tools with valid bearer', async ({ request, baseURL }) => {
    const { workspaceId, plaintext } = await setupWorkspaceWithToken(request, 'mcp-protocol-list');

    const client = await connectClient(baseURL!, workspaceId, plaintext);
    try {
      const result = await client.listTools();
      const names = result.tools.map((tool) => tool.name).sort();
      expect(names).toEqual(['load_pdf', 'switch_component', 'update_notes']);
    } finally {
      await client.close();
    }
  });

  test('rejects requests with no bearer header', async ({ request, baseURL }) => {
    const workspaceId = await createWorkspace(request, 'mcp-protocol-noauth');

    const response = await request.post(buildMcpUrl(baseURL!, workspaceId).toString(), {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error?.code).toBe('MISSING_BEARER_TOKEN');
  });

  test('rejects a token issued for a different workspace', async ({ request, baseURL }) => {
    const tokenA = await setupWorkspaceWithToken(request, 'mcp-protocol-cross-a');
    const workspaceB = await createWorkspace(request, 'mcp-protocol-cross-b');

    const response = await request.post(buildMcpUrl(baseURL!, workspaceB).toString(), {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${tokenA.plaintext}`,
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error?.code).toBe('WORKSPACE_MISMATCH');
  });

  test('rejects a revoked token', async ({ request, baseURL }) => {
    const { workspaceId, tokenId, plaintext } = await setupWorkspaceWithToken(
      request,
      'mcp-protocol-revoked'
    );
    await revokeToken(request, workspaceId, tokenId);

    const response = await request.post(buildMcpUrl(baseURL!, workspaceId).toString(), {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${plaintext}`,
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error?.code).toBe('REVOKED_TOKEN');
  });

  test('rejects an unknown bearer token', async ({ request, baseURL }) => {
    const workspaceId = await createWorkspace(request, 'mcp-protocol-unknown');

    const response = await request.post(buildMcpUrl(baseURL!, workspaceId).toString(), {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer pmsk_definitely-not-a-real-token',
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error?.code).toBe('INVALID_TOKEN');
  });
});
