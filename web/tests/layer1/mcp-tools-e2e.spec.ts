import { test, expect, type APIRequestContext } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

interface DirectiveEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

interface WorkspaceContext {
  workspaceId: string;
  agentId: string;
  plaintext: string;
}

async function createWorkspaceWithAgent(
  request: APIRequestContext,
  name: string
): Promise<{ workspaceId: string; agentId: string }> {
  const createResponse = await request.post('/api/workspace', { data: { name } });
  expect(createResponse.ok(), `create workspace ${name}`).toBeTruthy();
  const createBody = await createResponse.json();
  const workspaceId = createBody.data.id as string;

  const ensureResponse = await request.post(`/api/workspace/${workspaceId}/agent/ensure`, {
    data: {},
  });
  expect(ensureResponse.ok(), `ensure agent for ${workspaceId}`).toBeTruthy();
  const ensureBody = await ensureResponse.json();
  const agentId = ensureBody?.data?.id as string | undefined;
  expect(agentId, 'agent id from ensure response').toBeTruthy();

  return { workspaceId, agentId: agentId as string };
}

async function mintToken(
  request: APIRequestContext,
  workspaceId: string,
  label: string
): Promise<string> {
  const response = await request.post(`/api/workspace/${workspaceId}/mcp-tokens`, {
    data: { name: label },
  });
  expect(response.ok(), `mint token ${label}`).toBeTruthy();
  const body = await response.json();
  return body.data.plaintext as string;
}

async function setupWorkspaceContext(
  request: APIRequestContext,
  name: string
): Promise<WorkspaceContext> {
  const { workspaceId, agentId } = await createWorkspaceWithAgent(request, name);
  const plaintext = await mintToken(request, workspaceId, `${name} token`);
  return { workspaceId, agentId, plaintext };
}

async function connectMcpClient(
  baseURL: string,
  workspaceId: string,
  bearer: string
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`/api/mcp/workspace/${workspaceId}`, baseURL),
    { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }
  );
  const client = new Client({ name: 'prismer-l1-tools-test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}

interface SseWatcher {
  next: (matcher: (event: DirectiveEvent) => boolean, timeoutMs?: number) => Promise<DirectiveEvent>;
  close: () => void;
}

function openDirectiveStream(baseURL: string, agentId: string): SseWatcher {
  const controller = new AbortController();
  const pending: DirectiveEvent[] = [];
  const waiters: Array<{
    matcher: (event: DirectiveEvent) => boolean;
    resolve: (event: DirectiveEvent) => void;
    reject: (err: Error) => void;
  }> = [];
  let buffer = '';
  let closed = false;

  function drainWaiters(event: DirectiveEvent): boolean {
    for (let i = 0; i < waiters.length; i++) {
      const waiter = waiters[i];
      if (waiter.matcher(event)) {
        waiters.splice(i, 1);
        waiter.resolve(event);
        return true;
      }
    }
    return false;
  }

  function dispatch(event: DirectiveEvent): void {
    if (drainWaiters(event)) return;
    pending.push(event);
  }

  function processBuffer(): void {
    while (true) {
      const sep = buffer.indexOf('\n\n');
      if (sep === -1) return;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) continue;
      try {
        const parsed = JSON.parse(dataLines.join('\n')) as DirectiveEvent;
        dispatch(parsed);
      } catch {
        // Skip malformed payloads — heartbeat lines are filtered above.
      }
    }
  }

  const reader = fetch(new URL(`/api/agents/${agentId}/directive/stream`, baseURL), {
    signal: controller.signal,
    headers: { Accept: 'text/event-stream' },
  }).then(async (response) => {
    if (!response.body) {
      throw new Error('SSE response has no body');
    }
    const decoder = new TextDecoder();
    const stream = response.body;
    for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      processBuffer();
    }
  }).catch((err) => {
    if (closed) return;
    for (const waiter of waiters.splice(0)) {
      waiter.reject(err instanceof Error ? err : new Error(String(err)));
    }
  });

  return {
    next(matcher, timeoutMs = 10_000) {
      const queuedIndex = pending.findIndex(matcher);
      if (queuedIndex >= 0) {
        const [event] = pending.splice(queuedIndex, 1);
        return Promise.resolve(event);
      }
      return new Promise<DirectiveEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = waiters.findIndex((w) => w.resolve === wrappedResolve);
          if (idx >= 0) waiters.splice(idx, 1);
          reject(new Error(`Timed out waiting for directive after ${timeoutMs} ms`));
        }, timeoutMs);
        const wrappedResolve = (event: DirectiveEvent) => {
          clearTimeout(timer);
          resolve(event);
        };
        const wrappedReject = (err: Error) => {
          clearTimeout(timer);
          reject(err);
        };
        waiters.push({ matcher, resolve: wrappedResolve, reject: wrappedReject });
      });
    },
    close() {
      closed = true;
      try {
        controller.abort();
      } catch {
        // already aborted
      }
      void reader;
    },
  };
}

async function readToolResultPayload(
  callResult: Awaited<ReturnType<Client['callTool']>>
): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
  const content = (callResult.content ?? []) as Array<{ type: string; text?: string }>;
  const first = content.find((part) => part.type === 'text');
  expect(first?.text, 'tool result must include text payload').toBeTruthy();
  const payload = JSON.parse(first!.text as string) as Record<string, unknown>;
  return { ok: callResult.isError !== true, payload };
}

test.describe('@layer1 MCP tools enqueue directives end-to-end', () => {
  test('switch_component enqueues SWITCH_COMPONENT directive', async ({ request, baseURL }) => {
    const ctx = await setupWorkspaceContext(request, 'mcp-tools-switch');
    const watcher = openDirectiveStream(baseURL!, ctx.agentId);
    const client = await connectMcpClient(baseURL!, ctx.workspaceId, ctx.plaintext);

    try {
      const result = await client.callTool({
        name: 'switch_component',
        arguments: { component: 'ai-editor' },
      });
      const { ok, payload } = await readToolResultPayload(result);
      expect(ok, JSON.stringify(payload)).toBe(true);
      expect(payload).toMatchObject({ ok: true, current: 'ai-editor' });

      const directive = await watcher.next(
        (event) => event.type === 'SWITCH_COMPONENT' && event.payload?.component === 'ai-editor'
      );
      expect(directive.payload.component).toBe('ai-editor');
    } finally {
      watcher.close();
      await client.close();
    }
  });

  test('switch_component rejects disabled components server-side', async ({ request, baseURL }) => {
    const ctx = await setupWorkspaceContext(request, 'mcp-tools-disabled');
    const client = await connectMcpClient(baseURL!, ctx.workspaceId, ctx.plaintext);

    try {
      const result = await client.callTool({
        name: 'switch_component',
        arguments: { component: 'three-viewer' },
      });
      const { ok, payload } = await readToolResultPayload(result);
      expect(ok).toBe(false);
      expect(payload.code).toBe('COMPONENT_DISABLED');
    } finally {
      await client.close();
    }
  });

  test('update_notes enqueues UPDATE_NOTES directive and persists asset', async ({ request, baseURL }) => {
    const ctx = await setupWorkspaceContext(request, 'mcp-tools-notes');
    const watcher = openDirectiveStream(baseURL!, ctx.agentId);
    const client = await connectMcpClient(baseURL!, ctx.workspaceId, ctx.plaintext);

    const content = `L1 note ${Date.now()}`;

    try {
      const result = await client.callTool({
        name: 'update_notes',
        arguments: { content },
      });
      const { ok, payload } = await readToolResultPayload(result);
      expect(ok, JSON.stringify(payload)).toBe(true);
      expect(payload).toMatchObject({ ok: true, length: content.length });
      expect(typeof payload.assetId).toBe('number');

      const directive = await watcher.next(
        (event) => event.type === 'UPDATE_NOTES' && event.payload?.content === content
      );
      expect(directive.payload.content).toBe(content);
    } finally {
      watcher.close();
      await client.close();
    }
  });

  test('load_pdf rejects missing and conflicting source parameters', async ({ request, baseURL }) => {
    const ctx = await setupWorkspaceContext(request, 'mcp-tools-load-pdf');
    const client = await connectMcpClient(baseURL!, ctx.workspaceId, ctx.plaintext);

    try {
      const missing = await client.callTool({ name: 'load_pdf', arguments: {} });
      const missingResult = await readToolResultPayload(missing);
      expect(missingResult.ok).toBe(false);
      expect(missingResult.payload.code).toBe('MISSING_SOURCE');

      const both = await client.callTool({
        name: 'load_pdf',
        arguments: { assetId: 1, url: 'https://example.com/a.pdf' },
      });
      const bothResult = await readToolResultPayload(both);
      expect(bothResult.ok).toBe(false);
      expect(bothResult.payload.code).toBe('BOTH_SOURCES');

      const missingAsset = await client.callTool({
        name: 'load_pdf',
        arguments: { assetId: 999_999_999 },
      });
      const missingAssetResult = await readToolResultPayload(missingAsset);
      expect(missingAssetResult.ok).toBe(false);
      expect(missingAssetResult.payload.code).toBe('ASSET_NOT_FOUND');
    } finally {
      await client.close();
    }
  });
});
