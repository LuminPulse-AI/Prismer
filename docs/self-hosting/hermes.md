# Hermes + Prismer Self-Host

Use this guide to connect a self-hosted Hermes agent to a self-hosted Prismer workspace via the Workspace MCP surface added in Phase 1.

This path is **adapter-first**: Hermes runs as its own process and reaches Prismer through MCP. The Prismer side is the system of record for workspaces, assets, OCR datasets, and UI state. See `docs/plans/2026-04-23-hermes-integration-design.md` for the full architecture.

## Prerequisites

Before starting, you should already have:

- A Prismer self-host install running on a reachable host (see [README](README.md))
- At least one workspace created via the Prismer UI
- An MCP token minted from `Workspace Settings -> MCP` for that workspace — see [Workspace MCP](mcp.md) for the create step

Keep the **plaintext token** handy. Prismer never displays it again after you click "I've copied it".

## Install Hermes

Hermes is published by Nous Research and lives outside this repo. Follow the upstream docs:

- Product: <https://hermes-agent.nousresearch.com>
- MCP integration: <https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp>
- OpenClaw migration path (informational): <https://hermes-agent.nousresearch.com/docs/guides/migrate-from-openclaw>
- Tool runtime model: <https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime>

Install it however the upstream docs recommend (binary, container, or platform package). The rest of this guide assumes you can run a Hermes session and load an MCP server configuration into it.

## Point Hermes at the Prismer Workspace MCP

Prismer exposes one MCP endpoint per workspace, scoped by URL and authenticated with a bearer token. The endpoint speaks **MCP over Streamable HTTP** (the `@modelcontextprotocol/sdk` `StreamableHTTPClientTransport` shape).

| Setting | Value |
|---|---|
| Server name (your choice) | `prismer-workspace` |
| URL | `http://<prismer-host>:3000/api/mcp/workspace/<workspaceId>` |
| Transport | Streamable HTTP |
| Auth header | `Authorization: Bearer pmsk_<plaintext>` |

Replace `<prismer-host>` with the host the Prismer Next.js app is bound to. For a single-machine self-host this is usually `localhost`. The `<workspaceId>` is the cuid shown in the workspace URL bar.

Where this configuration lives depends on the Hermes flavor — its docs cover both per-session MCP config and global MCP config. Look for a field that accepts a URL plus arbitrary HTTP headers; that is the same surface Claude Desktop and Cursor use for Prismer.

## Verify the Connection

Inside a Hermes session, ask the agent to call each of the three Phase 1 tools and watch the Prismer browser tab.

| Tool | Suggested prompt | What you should see in the browser |
|---|---|---|
| `switch_component` | "Switch the workspace to the notes editor." | Tabs in the right panel switch to the AI editor |
| `update_notes` | "Replace my workspace notes with: Hermes was here." | The AI editor shows the new content |
| `load_pdf` (asset path) | "Open asset id `<existing-id>` in the PDF reader." | The right panel switches to the PDF reader and renders the document |
| `load_pdf` (URL path) | "Open <https://arxiv.org/pdf/2106.09685.pdf> in the PDF reader." | Prismer downloads, persists as an asset, and opens the PDF |

If any of those calls returns a JSON-RPC error code instead of an `ok: true` payload, see Troubleshooting below.

## Sign-Off Checklist

When validating Phase 1 with Hermes specifically, run the [Workspace MCP smoke checklist](mcp.md#phase-1-sign-off-checklist) using Hermes as the MCP client. The expectations are identical — only the client changes.

If Hermes also caches MCP tool descriptors aggressively, force-reload the session after revoking a token so the revocation path in step 9 of the checklist is exercised.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Hermes shows the MCP server as connected but lists zero tools | Token rejected; Hermes silently failed `initialize` | Re-check the bearer token; confirm the workspaceId in the URL matches the workspace that minted the token |
| `MISSING_BEARER_TOKEN` (401) | `Authorization` header not forwarded | Check Hermes MCP config — some clients require an explicit `headers` field instead of an `auth` shortcut |
| `WORKSPACE_MISMATCH` (403) | Token belongs to a different workspace | Re-mint from the right workspace's settings panel |
| `REVOKED_TOKEN` (401) after a UI revoke | Hermes cached descriptors using the old token | Restart the Hermes session |
| `URL_INVALID` from `load_pdf` | Target URL resolves to a private/blocked IP | Use a public PDF URL or use the `assetId` mode for local content |
| `URL_NOT_PDF` from `load_pdf` | Remote server returned HTML/redirected to a login page | Confirm the URL really serves `application/pdf` and the magic bytes are `%PDF` |
| `COMPONENT_DISABLED` from `switch_component` | The target component is in the `DISABLED_COMPONENTS` set in this build | Use one of the enabled components (`pdf-reader`, `latex-editor`, `ai-editor`) until the disabled list shrinks |

For deeper protocol-level debugging, run the L1 Playwright specs against the same Prismer instance:

```bash
cd web
npx playwright test --project=layer1 --grep @layer1
```

The specs cover the same three tools plus the four auth failure modes; matching their output narrows whether a failure is on the Hermes side or on the Prismer side.

## Out Of Scope For This Pass

- Hermes is **not yet** a selectable in-process runtime in Prismer. The frontend still talks to one `AgentInstance` per workspace, and that AgentInstance is the OpenClaw container path. Hermes here is an *external* MCP client driving Prismer, not a Prismer runtime.
- In-process Hermes integration (`HermesAgentService`, runtime selection in `staticAgentConfig`) is Phase 3 of the Hermes design doc and depends on this Phase 1 smoke landing first.
- The other 23 OpenClaw workspace tools (`jupyter_execute`, `latex_project_compile`, `data_load`, etc.) are not on the MCP surface yet. Track B of the design doc covers expanding the tool set.
