# Workspace MCP

Prismer exposes a workspace-scoped MCP endpoint so external MCP clients can drive the same UI directive path as the OpenClaw workspace plugin.

Endpoint:

```text
http://localhost:3000/api/mcp/workspace/<workspaceId>
```

Create tokens from `Workspace Settings -> MCP`, or call:

```bash
curl -X POST http://localhost:3000/api/workspace/<workspaceId>/mcp-tokens \
  -H 'Content-Type: application/json' \
  -d '{"name":"local-client"}'
```

The create response returns `plaintext` once. Use it as:

```text
Authorization: Bearer pmsk_...
```

Initial tools:

| Tool | Behavior |
|---|---|
| `switch_component` | Switches to an enabled workspace component |
| `update_notes` | Replaces the notes editor content and persists the note asset |
| `load_pdf` | Opens a PDF by existing asset id or by downloading a public PDF URL |

`load_pdf` rejects localhost, private-network, link-local, and metadata-service URLs before downloading. URL downloads are capped by `MCP_MAX_PDF_SIZE_MB`.

Environment:

```bash
MCP_AUTH_MODE=enabled
MCP_MAX_PDF_SIZE_MB=100
MCP_MAX_NOTES_SIZE_KB=1024
MCP_FETCH_TIMEOUT_MS=30000
MCP_REDIRECT_LIMIT=3
```

Development-only auth bypass is available only when `NODE_ENV=development`, `MCP_AUTH_MODE=disabled`, and the request comes from loopback.

## Connecting external MCP clients

The endpoint speaks MCP over Streamable HTTP. Most clients only need the URL plus the bearer token.

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "prismer-workspace": {
      "url": "http://localhost:3000/api/mcp/workspace/<workspaceId>",
      "headers": {
        "Authorization": "Bearer pmsk_<your-token>"
      }
    }
  }
}
```

Restart Claude Desktop. The three tools appear under the Prismer server in the tool picker.

### Cursor

Cursor → Settings → MCP → "Add new server". Use the same URL and add `Authorization: Bearer pmsk_<your-token>` to the header list. Cursor reloads automatically.

### Codex / generic MCP client

Any client that takes Streamable HTTP plus custom headers works. Sample `mcp.json` fragment:

```json
{
  "name": "prismer-workspace",
  "transport": "streamable-http",
  "url": "http://localhost:3000/api/mcp/workspace/<workspaceId>",
  "headers": { "Authorization": "Bearer pmsk_<your-token>" }
}
```

## Phase 1 sign-off checklist

Before declaring the Workspace MCP surface ready to demo, walk through this checklist against a running self-host install. Tick each row only when the workspace UI visibly responds to the agent tool call.

| Step | What to do | Expected UI update |
|---|---|---|
| 1 | Start the workspace UI and open a workspace |  |
| 2 | Generate a token from `Workspace Settings -> MCP`; copy the plaintext once | new token row appears with prefix `pmsk_…` |
| 3 | Hook Claude Desktop / Cursor / Codex up using the config above |  |
| 4 | Ask the agent to call `switch_component` with `ai-editor` | window switches to the notes editor |
| 5 | Ask the agent to call `update_notes` with a short paragraph | notes editor shows the new content; settings `MCP` tab shows `lastUsedAt` updated |
| 6 | Ask the agent to call `switch_component` with a disabled component (e.g. `three-viewer`) | tool returns `COMPONENT_DISABLED`; UI does not switch |
| 7 | Ask the agent to call `load_pdf` against an existing asset id | window switches to the PDF reader and renders the document |
| 8 | Ask the agent to call `load_pdf` with a public arXiv PDF URL | SSRF guard passes, PDF downloads, asset is registered, reader opens it |
| 9 | Revoke the token from settings and replay step 4 | tool call fails with `REVOKED_TOKEN` (401) |
| 10 | Run `npx playwright test --project=layer1 --grep @layer1` | both `mcp-protocol` and `mcp-tools-e2e` specs are green |

Failures on rows 4 to 8 usually mean the agent runtime is alive but the workspace browser tab is not subscribed to the directive stream — reopen the workspace and retry.

Failures on row 9 indicate caching of the revoked token in the client; restarting the MCP client clears it.

Failures on row 10 with `MCP_AUTH_MODE` unset are expected to still pass — the test seeds real tokens regardless.
