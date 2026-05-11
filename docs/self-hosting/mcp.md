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
