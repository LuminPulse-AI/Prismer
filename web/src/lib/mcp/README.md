# Workspace MCP Internals

`/api/mcp/workspace/[id]` is a stateless Streamable HTTP MCP endpoint backed by the official TypeScript SDK.

Main modules:

| Path | Role |
|---|---|
| `auth.ts` | Bearer token validation and dev localhost bypass |
| `tokens.ts` | `pmsk_` token generation, hashing, listing, and revocation |
| `server.ts` | MCP server factory |
| `ssrf.ts` | Public URL validation and protected PDF downloading |
| `tools/` | Workspace tool implementations |

Tools enqueue the existing `/api/agents/[id]/directive` endpoint. They do not wait for browser acknowledgement; the workspace UI applies directives through the existing SSE stream.

To add a tool:

1. Add a file under `tools/`.
2. Define a zod input shape that leaves unknown fields stripped by default.
3. Register it in `tools/index.ts`.
4. Return JSON through `toolSuccess()` or structured errors through `McpToolError`.
5. Add focused tests under `__tests__/`.
