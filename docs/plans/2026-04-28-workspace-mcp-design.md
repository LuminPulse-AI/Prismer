# Workspace MCP Design (Phase 1: switch_component / update_notes / load_pdf)

**Status:** Spec, awaiting implementation plan
**Author:** brainstorming session 2026-04-28
**Supersedes:** N/A
**Related:**
- `docs/plans/2026-04-23-hermes-integration-design.md` (Phase 2 of that doc; note: that doc references `sdk/mcp` which was removed in commit `5575451`)
- `docs/plans/2026-04-23-post-merge-next-steps.md` (track #4 Hermes path)

## Goal

Add a Model Context Protocol (MCP) surface to Prismer so any MCP-capable agent runtime — Hermes, Claude Desktop, Cursor, Codex, future custom agents — can drive the Prismer workspace UI without going through the OpenClaw container path.

This is the **first slice**: three tools that cover the most-common workspace control flows.

| Tool | Purpose |
|---|---|
| `switch_component` | Switch the WindowViewer's active editor component |
| `update_notes` | Write/append the workspace notes document |
| `load_pdf` | Open a PDF in the pdf-reader (from existing asset or remote URL) |

OpenClaw's existing path (`/api/v2/im/bridge` + container-side plugin) is **not changed** by this work. Both paths coexist.

## Non-Goals

Explicitly out of scope for this spec, deferred to follow-up specs:

- The other 23 OpenClaw workspace tools (`jupyter_execute`, `latex_project_compile`, `data_load`, etc.)
- Cursor-style inline diff / patch mode for `update_notes` (the schema reserves the field; behavior is later)
- Research workflow phase state machine (Survey / Feasibility / Baseline / etc.)
- Intelligent data-import / chart-rendering skills
- A `HermesAgentService` runtime adapter (Phase 3 of the Hermes integration doc)
- Retiring or thinning `/api/v2/im/bridge`
- Frontend UI changes to surface "which runtime drives this agent"
- Rate limiting, IP allowlists, enterprise audit export
- MCP token import/export for batch distribution

## Locked Decisions (from brainstorming)

| # | Decision |
|---|---|
| Q1 | MCP server is a **Next.js HTTP route** at `/api/mcp/workspace/[id]/...` using Streamable HTTP transport (MCP 2025-03 standard) |
| Q2 | **Path-scoped per workspace** — workspaceId is in the URL, not a header or tool argument |
| Q3 | **Per-workspace bearer token** in `Authorization: Bearer <token>` |
| Q4 | `update_notes` supports `replace` and `append` modes; reserves `patch` and `baseVersion` fields for a future spec |
| Q5 | `load_pdf` supports `assetId` XOR `url`; URL fetches go through SSRF/MIME/size defenses |
| Q6 | `switch_component` is a pure switch (no payload); rejects with `NO_DATA` when the target component has no underlying data |

## 1. Architecture

### 1.1 SDK

`@modelcontextprotocol/sdk` (official TypeScript SDK). Use `Server` + `StreamableHTTPServerTransport`.

### 1.2 File layout

```
web/src/
├── app/api/mcp/workspace/[id]/
│   └── route.ts                    # MCP HTTP endpoint (POST = client→server, GET = SSE stream)
├── app/api/workspace/[id]/mcp-tokens/
│   ├── route.ts                    # POST (create), GET (list)
│   └── [tokenId]/route.ts          # DELETE (revoke)
├── lib/mcp/
│   ├── server.ts                   # MCP Server factory; one instance per request
│   ├── auth.ts                     # bearer token validation + workspaceId binding
│   ├── tokens.ts                   # token generation/revocation/lookup (DB I/O)
│   ├── errors.ts                   # error code constants + JSON-RPC ↔ tool-result mapping
│   └── tools/
│       ├── index.ts                # tool registration
│       ├── switch_component.ts
│       ├── update_notes.ts
│       └── load_pdf.ts
├── lib/mcp/__tests__/              # vitest unit tests (see §6.1)
└── lib/directive/
    ├── queue.ts                    # existing, unchanged
    ├── enqueue.ts                  # NEW: dispatchDirective() — single enqueue entry point
    └── fileSyncTriggers.ts         # NEW: extracted from /api/agents/[id]/directive/route.ts
```

### 1.3 Coexistence with OpenClaw

OpenClaw continues to push directives via the existing flow:

```
OpenClaw container plugin → POST /api/agents/[id]/directive → dispatchDirective()
```

MCP tools push directives via:

```
MCP client → /api/mcp/workspace/[id]/ → tool handler → dispatchDirective()
```

Both call the same `dispatchDirective` function, so file-sync triggers and queue semantics stay identical. The frontend reducer never sees which side originated a directive.

### 1.4 Data flow (worked example: `update_notes`)

```
External agent (Hermes / Claude Desktop / Cursor)
   │  HTTP POST /api/mcp/workspace/<id>/  (MCP JSON-RPC)
   ▼
route.ts ── auth.ts (validates bearer → confirms workspaceId match)
   │
   ▼
tools/update_notes.ts
   │  ├─ zod-validates input
   │  ├─ writes prisma.workspaceNote (upsert)
   │  └─ dispatchDirective(agentId, { type: 'UPDATE_NOTES', payload: {...} })
   │       └─ directiveQueue.enqueue + fileSyncTriggers (no-op for notes)
   ▼
Frontend (existing useDirectiveStream hook over SSE)
   └─ reducer updates workspace notes editor
```

## 2. Auth and Token Management

### 2.1 DB schema

New table:

```prisma
model WorkspaceMcpToken {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   WorkspaceSession @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tokenHash   String   @unique           // SHA-256(raw token); plaintext never stored
  prefix      String                     // "pmsk_" + first 8 chars of random portion, e.g. "pmsk_3f9a2b4c"; for UI display only
  name        String                     // user-supplied label, e.g. "Claude Desktop on MacBook"
  lastUsedAt  DateTime?
  expiresAt   DateTime?                  // optional expiry; null = never expires
  revokedAt   DateTime?
  createdBy   String                     // userId
  createdAt   DateTime @default(now())

  @@index([workspaceId])
  @@index([tokenHash])
}
```

`expiresAt` is in schema but **not exposed in the UI** for this spec — all tokens are non-expiring + revocable. Future spec can add expiry without migration.

`AgentInstance` gains one column:

```prisma
runtime String @default("openclaw")   // 'openclaw' | 'mcp' | 'demo'
```

`@default("openclaw")` keeps existing rows untouched. SQLite + MySQL both support default values on `ALTER TABLE`.

### 2.2 Token format

`pmsk_<32 random bytes base64url>`

- `pmsk` = "Prismer MCP Secret Key"
- 32 bytes = 256 bits of entropy
- Plaintext returned **once** at create time, never again
- DB stores `sha256(plaintext)` as `tokenHash`
- `prefix` field stores `pmsk_` + first 8 chars of the random portion (13 chars total, e.g. `pmsk_3f9a2b4c`), used solely for UI display in the token list

### 2.3 Validation flow (`lib/mcp/auth.ts`)

1. Extract `Authorization: Bearer <token>` header
2. Compute `sha256(token)` → look up `WorkspaceMcpToken` by `tokenHash`
3. Reject if:
   - record missing
   - `revokedAt` not null
   - `expiresAt` not null and `< now()`
   - `record.workspaceId !== <workspaceId from URL path>` (this is the key cross-workspace defense — same hash but wrong workspace = 403)
4. Pass: fire-and-forget `update lastUsedAt` (do not await)
5. Fail: return 401 (or 403 for workspace mismatch); log `{ ip, prefix, reason }` — never log full token

### 2.4 Dev fallback

Auth is skipped only when **all three** conditions hold:

1. `process.env.NODE_ENV === 'development'`
2. `process.env.MCP_AUTH_MODE === 'disabled'`
3. Request remote address is `127.0.0.1` or `::1`

Production builds dead-code-eliminate this branch. The combined check makes accidental `.env` copy-to-prod harmless.

### 2.5 Token CRUD API

All three endpoints require an authenticated user (NextAuth session) **and** that user must own or collaborate on the workspace, enforced via the same helper used by `/api/workspace/[id]/notes`.

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/workspace/[id]/mcp-tokens` | Body: `{ name: string }` (required). Generates token, stores hash, returns `{ id, prefix, name, plaintext }`. **Plaintext field is the only chance to copy the token.** |
| `GET` | `/api/workspace/[id]/mcp-tokens` | Returns `[{ id, prefix, name, lastUsedAt, revokedAt, createdAt }]`. No hash, no plaintext. |
| `DELETE` | `/api/workspace/[id]/mcp-tokens/[tokenId]` | Sets `revokedAt = now()`. Idempotent. |

### 2.6 UI (workspace settings)

Minimum scope for this spec:

- Add a "MCP Access" section to the workspace settings panel.
- Fields: token list (prefix + name + last used + status) and a "Generate Token" button.
- "Generate Token" opens a dialog requiring a `name`; on submit, displays the **plaintext token in a one-time modal** with a Copy button and an "I've copied it" confirmation that must be clicked to dismiss.
- Each token row has a "Revoke" action.
- Display the MCP endpoint URL (`https://<host>/api/mcp/workspace/<id>/`) as plain text alongside the token list. **No per-client config templates** in this spec — users paste URL + token manually into Claude Desktop / Cursor / Codex / Hermes config.

### 2.7 Audit logging

Every MCP request logs one structured line via `createLogger('MCP')`:

```
{ workspaceId, tokenPrefix, tool, durationMs, status, errorCode? }
```

`tokenPrefix` (not the hash, not the plaintext) is sufficient to correlate with the token list. Rate limiting is **not** in scope; a TODO comment marks the future hook.

## 3. Tool Specifications

### 3.1 Common error model

All tool errors fall into one of three categories:

| Category | MCP form | Use |
|---|---|---|
| Schema / parameter errors | JSON-RPC error response, `code: -32602` | zod validation failures, type mismatches, missing required fields |
| Business / runtime errors | Tool result with `isError: true` and one text content item containing JSON `{ "code": "<CODE>", "message": "<human msg>" }` | All listed error codes per tool below |
| Unexpected exceptions | Tool result with `isError: true` and `{ "code": "INTERNAL_ERROR", "message": "<sanitized>" }` | Catch-all; full stack logged server-side, **not** sent to client |

### 3.2 `switch_component`

```ts
input: {
  component: 'pdf-reader' | 'latex-editor' | 'jupyter-notebook' |
             'code-playground' | 'ai-editor' | 'ag-grid' |
             'bento-gallery' | 'three-viewer'
}

output: { ok: true, current: string }

errors:
  - UNKNOWN_COMPONENT  (zod, returns -32602)
  - NO_DATA            (target component has no underlying data)
```

#### NO_DATA judgment table

| Component | Required data |
|---|---|
| `pdf-reader` | A `ComponentState` row exists for this workspace + type with `payload.pdfAssetId` set |
| `latex-editor` | At least one `WorkspaceFile` row with `path` starting with `latex/` |
| `jupyter-notebook` | At least one `WorkspaceFile` row with `path` starting with `notebooks/` |
| `ag-grid` | A `ComponentState` row exists with `payload.dataKey` set |
| `code-playground`, `ai-editor`, `bento-gallery`, `three-viewer` | No data requirement; always allowed |

#### Behavior

1. zod-validate `component`
2. Check NO_DATA per table; reject if violated
3. `dispatchDirective(agentId, { type: 'SWITCH_COMPONENT', payload: { component } })`
4. Return `{ ok: true, current: component }`

### 3.3 `update_notes`

```ts
input: {
  content: string,                                    // required
  mode?: 'replace' | 'append',                        // default 'replace'
  patch?: never,                                      // RESERVED, see §3.3.3
  baseVersion?: never,                                // RESERVED, see §3.3.3
}

output: { ok: true, version: string, length: number }

errors:
  - EMPTY_CONTENT  (mode='replace' and content.length === 0)
  - TOO_LARGE      (content > 1 MB)
```

#### Behavior

1. zod-validate. Presence of `patch` or `baseVersion` returns `-32602` with message: *"reserved field; not implemented in current spec"*
2. Enforce 1 MB cap (`MCP_MAX_NOTES_SIZE_KB`)
3. `prisma.workspaceNote.upsert({ workspaceId })`:
   - `mode === 'replace'`: overwrite `content`
   - `mode === 'append'`: append `\n\n` + `content`
4. Compute `version = sha256(finalContent).slice(0, 12)`
5. `dispatchDirective(agentId, { type: 'UPDATE_NOTES', payload: { content: finalContent, mode, version } })`
6. Return `{ ok: true, version, length: finalContent.length }`

#### Concurrency

This spec does **not** implement concurrency control. Two clients running `replace` simultaneously: last write wins. The returned `version` field is for future patch-mode use; clients in this spec should ignore it. This must be documented in the user-facing self-host docs.

#### Reserved fields

`patch` and `baseVersion` are present in the input schema as forbidden. This locks the schema shape so a future spec implementing patch mode can add behavior without breaking existing clients that send these fields by mistake (they'd get a clear error).

### 3.4 `load_pdf`

```ts
input: {
  assetId?: string,    // one of these two is required
  url?: string,        // http/https only
  page?: number,       // optional, 1-based, default 1
}

output: {
  ok: true,
  assetId: string,     // even if input was a URL, output is the resolved/created assetId
  title: string,
  totalPages: number,
  currentPage: number,
}

errors:
  - MISSING_SOURCE      (neither assetId nor url provided)
  - BOTH_SOURCES        (both assetId and url provided)
  - ASSET_NOT_FOUND     (assetId provided but no DB record)
  - ASSET_FORBIDDEN     (asset exists but does not belong to workspace owner)
  - URL_INVALID         (non-http(s), or SSRF blocklist hit)
  - URL_FETCH_FAILED    (download failed, timeout, redirect over limit)
  - URL_NOT_PDF         (Content-Type not application/pdf, or magic bytes mismatch)
  - URL_TOO_LARGE       (>100 MB)
  - INVALID_PAGE        (page < 1 or page > totalPages)
```

#### SSRF defense (must be implemented exactly)

Reject URLs whose hostname resolves (via `dns.lookup`) to any of:

- `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
- `::1`, `fc00::/7`, `fe80::/10`
- Literal `metadata.google.internal`, `169.254.169.254`

Reject scheme other than `http:` and `https:` (no `file:`, `gopher:`, `ftp:`, `data:`).

Reject hostname strings: `localhost`, anything ending in `.local`.

Limit redirects to `MCP_REDIRECT_LIMIT` (default 3). Re-validate destination against the blocklist on **every** redirect.

To prevent DNS rebinding: resolve the hostname once via `dns.lookup`, then dial the resolved IP directly with the original `Host` header. Do not trust the second resolution.

If a community SSRF library (e.g. `ssrf-req-filter`) is available and audited, use it as cross-validation; otherwise hand-roll per the rules above with a table-driven test (see §6.1).

#### URL flow

1. Validate scheme + SSRF rules
2. Compute `urlHash = sha256(url)`; check `Asset` table for an existing record where `metadata.sourceUrlHash === urlHash` → on hit, reuse `assetId` and skip download
3. On miss: HEAD request (best-effort, some servers reject HEAD; fall back to streaming GET with size guard)
4. Streaming GET. Abort if cumulative bytes exceed `MCP_MAX_PDF_SIZE_MB` (default 100). Timeout per `MCP_FETCH_TIMEOUT_MS` (default 30s).
5. Verify magic bytes: first 4 bytes of body must equal `%PDF`. Servers may misreport Content-Type, so this is the authoritative check.
6. Persist via `storeLocalAssetBuffer` + `assetService.create({ assetType: 'paper', source: 'url', metadata: { sourceUrlHash, sourceUrl: url } })`
7. Continue with the resolved `assetId` as if input had been `assetId`

#### `assetId` flow

1. `prisma.asset.findUnique({ id: assetId })`; reject if missing → `ASSET_NOT_FOUND`
2. Verify `asset.userId === workspace.userId` → reject if mismatch → `ASSET_FORBIDDEN`
3. Read `totalPages`. **Implementation constraint:** reuse the PDF parsing library already imported by the OCR pipeline (most likely `pdfjs-dist`). Do not add a new dependency. If `pdfjs-dist` cannot run in the Next.js server runtime, fall back to `pdf-parse` (already pure-JS).
4. Validate `page` (default 1, must be in `[1, totalPages]`) → reject if invalid → `INVALID_PAGE`
5. `dispatchDirective(agentId, { type: 'LOAD_PDF', payload: { assetId, page, switchTo: 'pdf-reader' } })` — single directive carries the implicit component switch
6. Return `{ ok: true, assetId, title: asset.title, totalPages, currentPage: page }`

#### Implicit component switch

`load_pdf` always implies switching to `pdf-reader`. Loading a PDF without showing it is meaningless. This contrasts with `switch_component`, which is for jumping between **already-loaded** components. The two tools have orthogonal purposes:

- `load_pdf`: "I have a new PDF; show it."
- `switch_component`: "Show the previously-loaded PDF I had open."

## 4. Frontend Directive Integration

### 4.1 Directive types

| Type | Status | Action this spec |
|---|---|---|
| `SWITCH_COMPONENT` | Already in use by OpenClaw plugin | Reuse, no schema change |
| `LOAD_PDF` | Partially used | Spec the payload as `{ assetId, page, switchTo? }`; frontend reducer adds `switchTo` handling |
| `UPDATE_NOTES` | Already in use | Reuse, payload extended with optional `mode` and `version` (back-compatible: missing fields default to `replace` and ignored) |

No new directive types are introduced.

### 4.2 `dispatchDirective` extraction

`web/src/lib/directive/enqueue.ts`:

```ts
export async function dispatchDirective(
  agentId: string,
  directive: { type: string; payload: Record<string, unknown> },
  opts?: { skipFileSync?: boolean }
): Promise<{ id: string }>
```

Behavior:

1. Stamp `id = dir-<ts>-<rand>` and `timestamp = Date.now()`
2. `directiveQueue.enqueue(agentId, directive)`
3. Unless `opts.skipFileSync`, run `fileSyncTriggers[type]?.(directive.payload)` (extracted from the existing route file)
4. Return `{ id }`

The existing `/api/agents/[id]/directive/route.ts` is rewritten to call `dispatchDirective`. Behavior must be byte-identical for OpenClaw — verified by the existing L1/L2/L3 e2e suite.

### 4.3 `agentId` resolution from `workspaceId`

MCP tools have `workspaceId` from the URL but the directive queue keys on `agentId`. Resolution:

1. `prisma.agentInstance.findFirst({ workspaceId, status: { in: ['running', 'starting', 'idle'] } })`
2. On miss: call `ensureAgentForWorkspace(workspaceId)` (extracted as a service from the existing `/api/workspace/[id]/agent/ensure` route logic). This must:
   - Create a new `AgentInstance` row with `runtime: 'mcp'`
   - **Skip** all container orchestration (no Docker, no gateway warmup)
   - Return the new `agentId`
3. Use that `agentId` for `dispatchDirective`

### 4.4 `runtime` field semantics

`AgentInstance.runtime`:

- `'openclaw'` (default): existing behavior; container-backed
- `'mcp'`: virtual agent; no container; only used as a directive sink for external runtimes
- `'demo'`: existing demo flow controller (currently implicit; this spec makes it explicit)

API behaviors per runtime:

| Endpoint | `openclaw` | `mcp` | `demo` |
|---|---|---|---|
| `POST /api/agents/[id]/start` | start container | 400 `{ error: 'mcp runtime is externally managed' }` | unchanged |
| `POST /api/agents/[id]/stop` | stop container | 204 (no-op) | unchanged |
| `GET /api/agents/[id]/health` | container health | `{ runtime: 'mcp', status: 'external' }` | unchanged |
| `GET /api/agents/[id]/logs` | container logs | 200 `{ logs: [], note: 'external runtime' }` | unchanged |
| `POST /api/agents/[id]/directive` | enqueue (existing OpenClaw plugin path) | enqueue (MCP path also valid here, though MCP tools normally call `dispatchDirective` directly) | enqueue |
| SSE `/api/agents/[id]/directive/stream` | stream | stream | stream |

Frontend does **not** branch on `runtime`. Server-side branches are confined to the agent CRUD endpoints listed above.

### 4.5 Sync engine relationship

`SyncMatrixEngine` and `defaultMatrix` are **not modified**. The chain is:

```
MCP tool → dispatchDirective → directiveQueue → SSE → frontend reducer
                                                   ↓
                                              componentState updated
                                                   ↓
                                       SyncMatrixEngine syncs to DB and other clients
```

This is identical to the OpenClaw flow.

### 4.6 IM bridge relationship

`/api/v2/im/bridge/[workspaceId]` is **not modified**. OpenClaw continues to use it. MCP clients do not touch it.

### 4.7 Async boundary

MCP tools enqueue directives and return immediately. They do **not** wait for frontend acknowledgement. If a directive fails to render frontend-side (e.g. PDF parsing crashes in the browser), the user sees a toast; the MCP client has already received `{ ok: true }`. This boundary is documented in the user-facing self-host docs.

## 5. Configuration

### 5.1 Environment variables

Added to `.env.example`:

```bash
# MCP server
MCP_AUTH_MODE=enabled              # 'enabled' (default) | 'disabled' (dev only)
MCP_MAX_PDF_SIZE_MB=100             # load_pdf URL download cap
MCP_MAX_NOTES_SIZE_KB=1024          # update_notes content cap
MCP_FETCH_TIMEOUT_MS=30000          # URL download timeout
MCP_REDIRECT_LIMIT=3                # URL download redirect limit
```

### 5.2 Prisma migration

Single migration:

- `CREATE TABLE WorkspaceMcpToken` (full shape per §2.1)
- `ALTER TABLE AgentInstance ADD COLUMN runtime VARCHAR DEFAULT 'openclaw' NOT NULL`

Both supported on SQLite (dev) and MySQL (prod). Default value protects existing rows.

### 5.3 Next.js configuration

- `/api/mcp/workspace/[id]/` must be `dynamic = 'force-dynamic'` (no ISR / static export)
- Response streaming required for MCP SSE; ensure the route does not buffer (set `Cache-Control: no-cache, no-transform`)

### 5.4 Docker

No changes. MCP server runs in the existing Next.js process. Container compose files are untouched.

## 6. Testing

### 6.1 Unit tests (vitest, `web/src/lib/mcp/__tests__/`)

Coverage target: **80%+ on new code**.

| File | Cases (minimum) |
|---|---|
| `auth.test.ts` | bearer present/absent; valid/invalid hash; revoked token; expired token; cross-workspace token (same hash, wrong path); dev fallback all-three-AND positive and each negation |
| `tokens.test.ts` | create returns plaintext once; DB stores only hash; prefix is `pmsk_` + first 8 random chars; `name` required; revoke is idempotent |
| `tools/switch_component.test.ts` | each of 8 components × NO_DATA pass/fail; unknown component → -32602; directive enqueued with correct payload |
| `tools/update_notes.test.ts` | replace overwrites; append concatenates with `\n\n`; empty replace rejected; >1MB rejected; reserved field rejected with -32602; version is sha256(content).slice(0,12); directive enqueued |
| `tools/load_pdf.test.ts` | assetId+url mutual exclusion; SSRF table (≥10 cases covering each CIDR + literal); magic bytes pass/fail; URL hash dedup hit reuses assetId; page bounds; redirect limit |
| `dispatchDirective.test.ts` | enqueues to queue; runs file-sync triggers; `skipFileSync` opt-out; ensures agent for workspace if missing; created agent has `runtime: 'mcp'` |

### 6.2 Layer 1 e2e (`tests/layer1/`, Playwright)

Two new specs:

- `mcp-protocol.spec.ts`: connect via `@modelcontextprotocol/sdk` client to a real local Next.js, test `initialize` → `list_tools` → `call_tool`; auth-pass and auth-fail flows.
- `mcp-tools-e2e.spec.ts`: call each of three tools once; assert `directiveQueue` contains the expected directive (poll the SSE stream).

### 6.3 Layer 2 / Layer 3

Not extended. Frontend rendering of `SWITCH_COMPONENT` / `UPDATE_NOTES` / `LOAD_PDF` directives is already covered by existing L2/L3 specs; MCP introduces no new render path.

### 6.4 Manual smoke (must pass before land)

1. Configure Claude Desktop with the local MCP endpoint and a real token. Successfully `call_tool` each of the three tools and verify the workspace UI updates.
2. Configure one additional MCP client (Cursor or Codex) and repeat. Confirms protocol portability.
3. Existing L1/L2/L3 e2e suite passes — regression protection for the `dispatchDirective` extraction.

## 7. Documentation

| File | Content | When |
|---|---|---|
| `docs/plans/2026-04-28-workspace-mcp-design.md` | This spec | Now |
| `docs/self-hosting/mcp.md` | Self-host user guide: token creation, client config snippets, troubleshooting | Implementation phase |
| `web/src/lib/mcp/README.md` | Internal dev guide: directory layout, how to add a tool, error codes, directive queue relationship | Implementation phase |
| `docs/SCHEME.md` | Add `WorkspaceMcpToken` table and `AgentInstance.runtime` field | Implementation phase |
| `docs/ARCH.md` | Agent System section: add MCP path alongside OpenClaw path | Implementation phase |

## 8. Rollout Order

Each phase has one PR; PR cannot land until its acceptance check passes.

| Phase | Work | Acceptance |
|---|---|---|
| 0 | Prisma migration; env loading | `db:push` clean on dev SQLite; existing tests still pass |
| 1 | Auth + token CRUD endpoints; settings UI | Unit tests for `auth.ts` and `tokens.ts` green; manual: create + revoke + list |
| 2 | MCP server skeleton (initialize / list_tools, empty tool set) | `mcp-protocol.spec.ts` green |
| 3 | Extract `dispatchDirective` and `fileSyncTriggers`; rewrite OpenClaw HTTP route to use it | All existing L1/L2/L3 e2e green (regression gate) |
| 4 | Tool implementations: `switch_component`, then `update_notes`, then `load_pdf` | Unit tests + L1 `mcp-tools-e2e.spec.ts` green |
| 5 | Virtual agent ensure: `ensureAgentForWorkspace`, runtime branching in agent CRUD endpoints | Unit tests for service; manual: MCP call against a workspace with no agent succeeds |
| 6 | Documentation + manual smoke (Claude Desktop, one other client) | Smoke checklist signed off |

## 9. Risks and Trade-offs

| Risk | Mitigation |
|---|---|
| `dispatchDirective` extraction subtly changes OpenClaw behavior | Phase 3 is gated on the full L1/L2/L3 regression suite passing; PR cannot land otherwise |
| Virtual agent + `runtime` field touches every agent CRUD endpoint | Phase 5 centralizes the branch logic; explicit table in §4.4 documents every endpoint's behavior per runtime |
| SSRF defense gaps | Table-driven test with at least 10 cases covering each CIDR/literal; cross-validate with a community SSRF library if one is audited |
| `pdfjs-dist` may not run in Next.js server runtime | Phase 4 verifies on a real `next build`; fallback to `pdf-parse` is explicitly allowed (still no new dependency, since it would already be transitively available in the OCR path) |
| MCP client compatibility (different clients, different protocol minor versions) | Pin `@modelcontextprotocol/sdk` version; manual smoke against two clients before land |
| Frontend may receive a `LOAD_PDF` directive whose `assetId` is not yet in its local cache | Existing OpenClaw flow already handles this case (lazy fetch by id); reuse the same hook |

## 10. Future Work (referenced by this spec, not implemented here)

- **Patch mode for `update_notes` / `update_latex`**: implement `patch` and `baseVersion` fields. Requires frontend diff-viewer + accept/reject UI. Connects to product improvement #3 (Cursor-style co-authoring).
- **Remaining workspace tools as MCP**: `jupyter_execute`, `latex_project`, `latex_project_compile`, `data_load`, `navigate_pdf`, `get_workspace_state`, etc. Each gets its own short spec sliced from the OpenClaw plugin.
- **`HermesAgentService`**: Hermes integration design Phase 3, after this MCP surface stabilizes.
- **Research workflow phase model**: Survey / Feasibility / Baseline / Experiment / Writing / Rebuttal as first-class state on `WorkspaceSession`. Independent spec; touches `Task`, `Timeline`, prompt templates.
- **Intelligent data → chart skill**: differentiation feature for paper writing. Independent spec.
- **Per-client MCP config templates** (Claude Desktop, Cursor, Codex, Hermes JSON snippets): polish for the settings UI.
- **MCP rate limit / IP allowlist**: hardening spec, not needed for first cut.
- **Bridge thinning**: post-merge plan #3, only after multiple workspace tools are MCP-native and Hermes adapter exists.
