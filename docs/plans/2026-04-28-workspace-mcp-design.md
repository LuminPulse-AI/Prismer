# Workspace MCP Design — Phase 1 (switch_component / update_notes / load_pdf)

**Status:** Spec v2, Phase 1 implementation started
**Author:** brainstorming session 2026-04-28
**History:**
- v1 (commit `0c84060`) — superseded after independent codex review found 17 mismatches against the actual codebase
- v2 (this file) — fixes all 17 findings; verified against `web/prisma/schema.prisma`, `docker/plugin/prismer-workspace/src/tools.ts`, `web/src/app/workspace/hooks/useDirectiveStream.ts`, `web/src/app/workspace/stores/syncActions.ts`, `web/src/types/workspace.ts`, `web/src/lib/agent/{types,AgentServiceFactory}.ts`

**Related:**
- `docs/plans/2026-04-23-hermes-integration-design.md` (Phase 2 of that doc; note: it references `sdk/mcp` which was removed in commit `5575451`)
- `docs/plans/2026-04-23-post-merge-next-steps.md` (track #4 Hermes path)

## Goal

Add a Model Context Protocol (MCP) surface to Prismer so any MCP-capable agent runtime — Hermes, Claude Desktop, Cursor, Codex, future custom agents — can drive the Prismer workspace UI without going through the OpenClaw container path.

This is the **first slice**: three tools that cover the most-common workspace control flows.

| Tool | Purpose |
|---|---|
| `switch_component` | Switch the WindowViewer's active editor component |
| `update_notes` | Replace the workspace notes content (uses existing `note` Asset model) |
| `load_pdf` | Open a PDF in the pdf-reader (from existing asset id or remote URL) |

OpenClaw's existing path (`/api/v2/im/bridge` + container-side plugin) is **not changed**. Both paths coexist and can drive the same workspace.

## What Changed Between v1 and v2

The v1 spec made several structural assumptions that the codebase contradicts. v2 fixes each. Critical corrections:

| v1 assumption | Reality | v2 resolution |
|---|---|---|
| Two `AgentInstance` rows per workspace (one for OpenClaw, one virtual MCP) | `AgentInstance.workspaceId @unique` enforces 1:1 | Reuse the existing AgentInstance row; no virtual agent; no new runtime concept |
| `AgentInstance.runtime` enum extension | `AgentService` interface hardcodes `'demo' \| 'openclaw'`; factory throws on unknown | Drop the runtime field entirely; MCP doesn't go through `AgentService` |
| `ComponentState.payload.pdfAssetId`, `payload.dataKey` | Actual table is `WorkspaceComponentState.state` (opaque JSON string); pdf-reader uses `documentId` | Drop NO_DATA pre-checks; rely on frontend's existing empty-state rendering |
| New directive type `LOAD_PDF { assetId, page, switchTo }` | Existing wire protocol is `PDF_LOAD_DOCUMENT { source, page }`, mapped to `load_document { documentId }` | Reuse `PDF_LOAD_DOCUMENT`; auto-switch is already handled by `syncActions.ts:160` |
| `prisma.workspaceNote.upsert` | No `WorkspaceNote` model; notes persist as `Asset` rows with `assetType: 'note'` | Extract `notesService.upsertWorkspaceNote()` from existing `/api/workspace/[id]/notes/route.ts`; reuse |
| `assetId: string` | `Asset.id` is `Int` | `assetId: number` everywhere |
| `asset.userId === workspace.userId` | `Asset.userId: Int`, `WorkspaceSession.ownerId: String` — different identity systems | Compare `asset.userId === getRemoteUserId()` (current self-host single-user model) |
| Workspace ACL helper "owner or collaborator" exists | No such helper; current routes use `getRemoteUserId()` defaulting to `1` | Add a new minimal helper `requireWorkspaceAccess()` based on `WorkspaceSession.ownerId` and `WorkspaceParticipant`; use everywhere |
| Reject reserved `patch`/`baseVersion` fields | Forward-incompatible | Strip unknown fields silently; reserve names in narrative only |
| OCR pipeline already imports `pdfjs-dist` | OCR uses Volcengine; no server-side PDF parser in current deps | Add `pdf-parse` as a new dep; document the addition |
| All 8 components are valid switch targets | 5 components are in `DISABLED_COMPONENTS` set; switch silently ignores them | Server-side reject `COMPONENT_DISABLED` for the 5 disabled types; read the same constant |
| DNS rebinding mitigation: "dial IP with original Host header" | Conflicts with TLS SNI / cert validation on HTTPS | Use a custom `lookup` callback in `https.request` that validates each resolved IP against the blocklist; do not bypass SNI |
| `dispatchDirective` extraction is a Phase 3 prerequisite | MCP can call existing `/api/agents/[id]/directive` HTTP route directly, exactly like the plugin does | Remove the extraction from the critical path; mark it as an optional cleanup follow-up |

## Non-Goals

Explicitly out of scope, deferred to follow-up specs:

- The other 23 OpenClaw workspace tools (`jupyter_execute`, `latex_project_compile`, `data_load`, etc.)
- `update_notes` `append` mode (this slice only supports `replace`, matching the existing plugin)
- Cursor-style inline diff / patch mode for `update_notes` (the field name is reserved in narrative; behavior is later)
- Research workflow phase state machine (Survey / Feasibility / Baseline / etc.)
- Intelligent data-import / chart-rendering skills
- A `HermesAgentService` runtime adapter (Phase 3 of the Hermes integration doc)
- Retiring or thinning `/api/v2/im/bridge`
- Multi-user workspace ACL (this spec adds a minimal helper but inherits the current self-host single-user model)
- Rate limiting, IP allowlists, enterprise audit export
- MCP token import/export for batch distribution
- Re-enabling the 5 currently-disabled components in `DISABLED_COMPONENTS`

## Locked Decisions

| # | Decision |
|---|---|
| Q1 | MCP server is a **Next.js HTTP route** at `/api/mcp/workspace/[id]/...` using Streamable HTTP transport |
| Q2 | **Path-scoped per workspace** — workspaceId is in the URL |
| Q3 | **Per-workspace bearer token** in `Authorization: Bearer <token>` |
| Q4 | `update_notes` only supports `replace` in this slice; `mode: 'append'` and patch are explicit non-goals |
| Q5 | `load_pdf` supports `assetId` (number) XOR `url` (string); URL fetches go through SSRF/MIME/size defenses |
| Q6 | `switch_component` rejects disabled components server-side; otherwise enqueues unconditionally (no NO_DATA pre-check) |

## 1. Architecture

### 1.1 SDK and transport

`@modelcontextprotocol/sdk` (official TypeScript SDK). Use `Server` + `StreamableHTTPServerTransport`. Pin to a known-stable version in `package.json`.

### 1.2 File layout

```
web/src/
├── app/api/mcp/workspace/[id]/
│   └── route.ts                    # MCP HTTP endpoint (POST = JSON-RPC, GET = SSE stream)
├── app/api/workspace/[id]/mcp-tokens/
│   ├── route.ts                    # POST (create), GET (list)
│   └── [tokenId]/route.ts          # DELETE (revoke)
├── lib/mcp/
│   ├── server.ts                   # MCP Server factory; one instance per request
│   ├── auth.ts                     # bearer token validation + workspaceId binding
│   ├── tokens.ts                   # token generation/revocation/lookup (DB I/O)
│   ├── errors.ts                   # error codes + JSON-RPC ↔ tool-result mapping
│   ├── ssrf.ts                     # SSRF blocklist + validating DNS lookup
│   ├── workspaceAccess.ts          # requireWorkspaceAccess helper (used by all workspace endpoints)
│   └── tools/
│       ├── index.ts                # tool registration
│       ├── switch_component.ts
│       ├── update_notes.ts
│       └── load_pdf.ts
├── lib/services/
│   ├── notes.service.ts            # NEW: extracted from /api/workspace/[id]/notes/route.ts
│   └── workspace-access.service.ts # NEW: requireWorkspaceAccess implementation
└── lib/mcp/__tests__/              # vitest unit tests
```

### 1.3 Coexistence with OpenClaw

Both paths share the same `AgentInstance` row, the same `directiveQueue`, and the same SSE stream:

```
OpenClaw container plugin → POST /api/agents/[id]/directive → directiveQueue.enqueue
MCP tool                  → POST /api/agents/[id]/directive → directiveQueue.enqueue   (same HTTP endpoint, internal call)
```

MCP tools call the existing HTTP endpoint as the OpenClaw plugin does. No protocol change. No new directive types.

### 1.4 Why no virtual agent / no runtime field

The v1 plan to add `AgentInstance.runtime = 'mcp'` and create separate rows fails on `@unique workspaceId`. v2 sidesteps the problem entirely:

- A workspace has at most one `AgentInstance`. If it exists, MCP reuses it. If it does not, MCP calls the existing `ensureAgentForWorkspace(workspaceId)` flow (extracted from `/api/workspace/[id]/agent/ensure/route.ts`).
- The agent row's `status` and `containerId` reflect OpenClaw lifecycle. MCP does not read or modify them.
- Whether the agent is `running` (OpenClaw container up) or `stopped` (no container) is irrelevant for MCP — directives still flow because the queue and SSE stream are keyed only on `agentId`.
- Optionally, `AgentInstance.metadata` JSON gains a `mcpEnabled: true` flag the first time an MCP token is created for the workspace. This is observability only; nothing branches on it.

### 1.5 Data flow (worked example: `update_notes`)

```
External agent (Hermes / Claude Desktop / Cursor)
   │  HTTP POST /api/mcp/workspace/<id>/  (MCP JSON-RPC)
   ▼
route.ts ── auth.ts (validates bearer; confirms tokenHash → workspaceId match)
   │
   ▼
tools/update_notes.ts
   │  ├─ zod-validates input
   │  ├─ resolves agentId via ensureAgentForWorkspace(workspaceId)
   │  ├─ calls notesService.upsertWorkspaceNote(workspaceId, content)
   │  │     └─ creates or updates the note Asset (existing logic)
   │  └─ POSTs to /api/agents/[agentId]/directive with { type: 'UPDATE_NOTES', payload: { content } }
   │       └─ enqueues; existing FILE_SYNC_TRIGGERS run as today (no-op for notes)
   ▼
Frontend (existing useDirectiveStream + syncActions)
   └─ ai-editor receives 'update_content' for target='ai-editor', updates UI
```

## 2. Auth and Token Management

### 2.1 DB schema

One new table, no `AgentInstance` migration:

```prisma
model WorkspaceMcpToken {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   WorkspaceSession @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tokenHash   String   @unique           // SHA-256(plaintext)
  prefix      String                     // "pmsk_" + first 8 chars of random portion (13 chars total)
  name        String                     // user-supplied label
  lastUsedAt  DateTime?
  expiresAt   DateTime?                  // optional; not exposed in UI this slice
  revokedAt   DateTime?
  createdBy   String                     // userId
  createdAt   DateTime @default(now())

  @@index([workspaceId])
  @@index([tokenHash])
}
```

### 2.2 Token format

`pmsk_<32 random bytes base64url>` (43 chars after the `pmsk_` prefix → 48 chars total). Plaintext returned **once** at create. DB stores `sha256(plaintext)`. `prefix` field is `pmsk_` + first 8 random chars (13 chars total) for UI listing.

### 2.3 Validation flow (`lib/mcp/auth.ts`)

1. Extract `Authorization: Bearer <token>`
2. Compute `sha256(token)` → look up `WorkspaceMcpToken` by `tokenHash`
3. Reject if record missing, `revokedAt` not null, or `expiresAt < now()`
4. Reject if `record.workspaceId !== <workspaceId from URL path>`. With `tokenHash @unique` this is defense-in-depth — same hash cannot belong to two records, but it blocks a token leaked across workspaces from being replayed against the wrong path.
5. Pass: fire-and-forget `update lastUsedAt`
6. Fail: 401 (missing / bad token) or 403 (workspace mismatch). Log `{ ip, prefix, reason }`. Never log full token.

### 2.4 Dev fallback

Auth is skipped only when **all three** conditions hold:

1. `process.env.NODE_ENV === 'development'`
2. `process.env.MCP_AUTH_MODE === 'disabled'`
3. Request remote address is `127.0.0.1` or `::1`

Production builds dead-code-eliminate this branch.

### 2.5 Workspace access helper (`lib/services/workspace-access.service.ts`)

This helper does not exist today. Spec adds:

```ts
export interface WorkspaceAccessContext {
  workspaceId: string;
  userId: string;       // NextAuth User.id (string cuid)
  asOwner: boolean;     // true if userId === workspace.ownerId
}

export async function requireWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccessContext>;
// Throws WorkspaceAccessError(404 if workspace not found, 403 if user is neither owner nor participant)
```

Logic:

1. Fetch `WorkspaceSession` by id; throw 404 if missing
2. If `workspace.ownerId === userId`, return `{ asOwner: true }`
3. Else: check `WorkspaceParticipant` for `(workspaceId, userId)` row; if present, return `{ asOwner: false }`
4. Else: throw 403

In current self-host single-user mode, all workspaces are owned by the implicit user — calls trivially pass. The helper is implemented now so multi-user can be added later without ratcheting.

### 2.6 Token CRUD API

All three endpoints require an authenticated NextAuth session **and** `requireWorkspaceAccess(workspaceId, session.user.id)` to pass.

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/api/workspace/[id]/mcp-tokens` | Body: `{ name: string }`. Returns `{ id, prefix, name, plaintext }`. Plaintext is the only chance to copy. |
| `GET` | `/api/workspace/[id]/mcp-tokens` | Returns `[{ id, prefix, name, lastUsedAt, revokedAt, createdAt }]`. |
| `DELETE` | `/api/workspace/[id]/mcp-tokens/[tokenId]` | Sets `revokedAt = now()`. Idempotent. |

### 2.7 UI

- Workspace settings panel gains an "MCP Access" section.
- Fields: token list (prefix + name + lastUsed + status); "Generate Token" button.
- "Generate Token" opens a dialog requiring `name`. On submit, plaintext token is shown in a one-time modal with a Copy button + "I've copied it" confirm-to-dismiss.
- Endpoint URL shown alongside as plain text; no per-client config templates this slice.

### 2.8 Audit logging

Every MCP request logs `{ workspaceId, tokenPrefix, tool, durationMs, status, errorCode? }` via `createLogger('MCP')`. Rate limiting is out of scope.

## 3. Tool Specifications

### 3.1 Common error model

| Category | MCP form | Use |
|---|---|---|
| Schema / parameter errors | JSON-RPC `-32602` | zod validation failures, type mismatches, missing required fields |
| Business / runtime errors | Tool result with `isError: true` and one text content item containing JSON `{ "code": "<CODE>", "message": "<human msg>" }` | All listed error codes per tool |
| Unexpected exceptions | `isError: true` + `{ "code": "INTERNAL_ERROR", "message": "<sanitized>" }` | Catch-all; full stack logged server-side, not sent to client |

Unknown / extra fields in tool inputs are **silently dropped** (zod `.passthrough(false).strict(false)` semantics, validated in tests). This is forward-compatibility: future fields like `patch`/`baseVersion` will not break clients that send them today.

### 3.2 `switch_component`

```ts
input: {
  component: 'pdf-reader' | 'latex-editor' | 'jupyter-notebook' |
             'code-playground' | 'ai-editor' | 'ag-grid' |
             'bento-gallery' | 'three-viewer'
}

output: { ok: true, current: string }

errors:
  - UNKNOWN_COMPONENT      (zod, returns -32602)
  - COMPONENT_DISABLED     (target is in DISABLED_COMPONENTS set)
```

#### Behavior

1. zod-validate `component` ∈ 8-enum
2. Read `DISABLED_COMPONENTS` from `web/src/types/workspace.ts` (export already exists). If target is in the set → reject with `COMPONENT_DISABLED` and a message listing currently-disabled types.
3. Resolve `agentId` (see §4.2)
4. POST to `/api/agents/[agentId]/directive` with `{ type: 'SWITCH_COMPONENT', payload: { component } }`
5. Return `{ ok: true, current: component }` on HTTP 200, else surface as `INTERNAL_ERROR`

**No NO_DATA pre-check.** v1 proposed inspecting `WorkspaceComponentState.state` to reject switching to empty components. Two reasons to drop it:

- The state table is debounced 3s after frontend updates (`componentStateBridge.ts:71`). DB lookup races the UI; false negatives are likely.
- Frontend already renders an empty state for components with no data. Agent calling `switch_component` to an empty component is a UX issue, not a correctness issue.

### 3.3 `update_notes`

```ts
input: {
  content: string,                                    // required, replace mode only
  // future: mode?: 'replace' | 'append' (RESERVED in narrative; not in schema)
  // future: patch?, baseVersion? (RESERVED in narrative; not in schema)
}

output: { ok: true, assetId: number, length: number }

errors:
  - EMPTY_CONTENT  (content is empty string)
  - TOO_LARGE      (content > 1 MB)
```

#### Behavior

1. zod-validate (`content` string, length > 0, ≤ 1 MB per `MCP_MAX_NOTES_SIZE_KB`). Unknown fields stripped silently.
2. Resolve `agentId` (see §4.2)
3. Call `notesService.upsertWorkspaceNote(workspaceId, content)`. This service is extracted verbatim from the existing `PUT /api/workspace/[id]/notes/route.ts`:
   - Looks up workspace; reads `settings.collectionId` and `settings.notesAssetId` (if any)
   - If `notesAssetId` set, calls `assetService.update(notesAssetId, getRemoteUserId(), { content })`
   - Else creates a new `Asset` with `assetType: 'note'`, `noteType: 'summary'`, `metadata.sourceId = workspace:<id>`; updates `workspace.settings.notesAssetId`
   - Adds the asset to the workspace collection if `settings.collectionId` is set
4. POST to `/api/agents/[agentId]/directive` with `{ type: 'UPDATE_NOTES', payload: { content } }` (matches existing plugin shape verbatim)
5. Return `{ ok: true, assetId: <resolved id>, length: content.length }`

#### Concurrency

Last-write-wins. No version control in this slice. `mode: 'append'` and patch are non-goals; document in the user-facing self-host docs.

### 3.4 `load_pdf`

```ts
input: {
  assetId?: number,    // exactly one of these must be present
  url?: string,        // http/https only
  page?: number,       // optional, 1-based, default 1
}

output: {
  ok: true,
  assetId: number,
  source: string,      // the source string passed to the frontend pdf-reader
  totalPages: number,
  currentPage: number,
}

errors:
  - MISSING_SOURCE      (neither assetId nor url given)
  - BOTH_SOURCES        (both given)
  - ASSET_NOT_FOUND     (assetId given but no DB record)
  - ASSET_FORBIDDEN     (asset.userId !== getRemoteUserId())
  - URL_INVALID         (non-http(s), or SSRF blocklist hit)
  - URL_FETCH_FAILED    (download failed, timeout, redirect over limit)
  - URL_NOT_PDF         (Content-Type not application/pdf, or magic bytes mismatch)
  - URL_TOO_LARGE       (>100 MB)
  - INVALID_PAGE        (page < 1 or page > totalPages)
```

#### SSRF defense (`lib/mcp/ssrf.ts`)

Reject URLs whose hostname resolves (via `dns.resolve4` and `dns.resolve6` — both, all addresses, not just one `dns.lookup`) to any of:

- `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
- `::1`, `fc00::/7`, `fe80::/10`
- Literal `metadata.google.internal`, `169.254.169.254`

Reject schemes other than `http:` and `https:`.
Reject hostnames `localhost` or anything ending in `.local`.

#### DNS rebinding mitigation (HTTPS-aware)

The naïve "dial IP with original Host header" approach breaks TLS SNI / cert validation on HTTPS, which is worse than the SSRF risk it tries to mitigate. Instead, use Node.js's per-request `lookup` callback in `https.request`:

```ts
import { lookup } from 'dns/promises';

async function validatingLookup(hostname: string, _opts: unknown, cb: Function) {
  const all = await Promise.all([
    resolve4(hostname).catch(() => []),
    resolve6(hostname).catch(() => []),
  ]);
  const addresses = all.flat();
  for (const addr of addresses) {
    if (isBlocked(addr)) {
      return cb(new Error(`SSRF: ${addr} is blocked`));
    }
  }
  // Pick the first allowed address; pass through to the connection layer
  // SNI and cert validation continue to use the original hostname
  const chosen = addresses[0];
  cb(null, chosen, chosen.includes(':') ? 6 : 4);
}

const resp = await fetch(url, { /* node-undici uses dispatcher; for native fetch use a custom Agent */ });
```

For the `fetch` API, equivalent control is via a custom `undici.Agent` with a `connect.lookup` option. The implementation must:

1. Resolve all A and AAAA addresses
2. Validate every address against the blocklist; if any is blocked, abort
3. Dial the first allowed address; SNI + cert validation use the hostname normally
4. On every redirect, re-resolve and re-validate (`MCP_REDIRECT_LIMIT`, default 3)

Standard TLS hostname validation is **not weakened**.

#### URL flow

1. Validate scheme + SSRF rules
2. Compute `urlHash = sha256(url)`; check `Asset` for existing `metadata.sourceUrlHash === urlHash` → on hit, reuse `assetId` and skip download
3. Streaming GET via the validating undici Agent. Abort if cumulative bytes > `MCP_MAX_PDF_SIZE_MB` (default 100). Timeout `MCP_FETCH_TIMEOUT_MS` (default 30s).
4. Verify magic bytes: first 4 bytes must equal `%PDF`. Servers may misreport Content-Type; magic bytes are authoritative.
5. Persist via `storeLocalAssetBuffer` + `assetService.create({ userId: getRemoteUserId(), assetType: 'paper', source: 'url', metadata: { sourceUrlHash, sourceUrl: url } })`
6. Continue with the resolved `assetId`

#### `assetId` flow

1. `prisma.asset.findUnique({ where: { id: assetId } })` — note `assetId` is a number
2. Reject if missing → `ASSET_NOT_FOUND`
3. Verify `asset.userId === getRemoteUserId()` → reject if mismatch → `ASSET_FORBIDDEN`. (Multi-user ACL is non-goal; the current self-host model has implicit single user.)
4. Determine `totalPages` via server-side `pdf-parse`. **Implementation note:** add `pdf-parse` as a new dependency in `web/package.json`. The OCR pipeline uses Volcengine, not a local parser; v1's claim of "reuse OCR pipeline's parser" was wrong.
5. Validate `page` (default 1, must be in `[1, totalPages]`) → reject if invalid → `INVALID_PAGE`
6. Compute `source` string compatible with the frontend pdf-reader. The OpenClaw plugin currently passes whatever source the agent supplied; the frontend's `useDirectiveStream` maps `payload.source → documentId`, and `syncActions.ts:154` reads `data.documentId` to update component state. For MCP, `source` is the API path the frontend already uses to fetch a PDF by asset id: `/api/v2/assets/<assetId>/file`.
7. POST to `/api/agents/[agentId]/directive` with `{ type: 'PDF_LOAD_DOCUMENT', payload: { source, page } }` (matches existing plugin verbatim)
8. Return `{ ok: true, assetId, source, totalPages, currentPage: page }`

#### Implicit component switch

`PDF_LOAD_DOCUMENT` does not directly carry a switch directive on the wire, but `syncActions.ts:160` automatically calls `setActiveComponent('pdf-reader')` when handling `load_document`. The OpenClaw plugin still emits a separate `SWITCH_COMPONENT` for safety; v2 follows the same pattern: `load_pdf` MCP tool emits `SWITCH_COMPONENT` first, then `PDF_LOAD_DOCUMENT`. Two HTTP POSTs in sequence.

## 4. Frontend Directive Integration

### 4.1 Existing directive types reused (no schema changes)

| Wire type (plugin) | Frontend `useDirectiveStream` mapping | Status this spec |
|---|---|---|
| `SWITCH_COMPONENT` { component } | → `switch_component` { target: component } | Reused as-is |
| `UPDATE_NOTES` { content } | → CustomEvent `agent:directive:UPDATE_NOTES` | Reused as-is |
| `PDF_LOAD_DOCUMENT` { source, page } | → `load_document` { documentId: source, page } | Reused as-is |

**No new directive types are introduced.** No frontend reducer changes.

### 4.2 `agentId` resolution

MCP tools have `workspaceId` from the URL path. The directive HTTP endpoint (and the queue) keys on `agentId`. Resolution path:

1. `prisma.agentInstance.findUnique({ where: { workspaceId } })` — note this works because `workspaceId` is unique
2. On miss: call `ensureAgentForWorkspace(workspaceId)`, extracted from the existing `/api/workspace/[id]/agent/ensure/route.ts`. This creates an `AgentInstance` row with `status: 'stopped'`, no container, and default name/avatar.
3. Use `agentInstance.id` as `agentId` for the directive POST
4. Optionally update `agentInstance.metadata.mcpEnabled = true` on first MCP token use (observability only)

### 4.3 No `dispatchDirective` extraction (removed from critical path)

v1 proposed extracting a shared `dispatchDirective()` function from `/api/agents/[id]/directive/route.ts` so both MCP and OpenClaw paths could call it in-process. Codex correctly noted this is unnecessary risk.

v2 has MCP tools call the existing `/api/agents/[id]/directive` HTTP endpoint via `fetch` (or direct Next.js `internal-fetch`), exactly as the OpenClaw plugin does. No refactor.

If observability later demands fewer in-process HTTP hops, a follow-up cleanup spec can extract the shared function. It is not on this critical path.

### 4.4 Sync engine and bridge unchanged

`SyncMatrixEngine` / `defaultMatrix` / `componentStateBridge` are not modified.
`/api/v2/im/bridge/[workspaceId]` is not modified. OpenClaw continues to use it. MCP does not touch it.

### 4.5 Async boundary

MCP tools enqueue directives and return immediately. They do not wait for frontend acknowledgement. Clarified in user-facing self-host docs.

## 5. Configuration

### 5.1 Environment variables

Added to `web/.env.example`:

```bash
# MCP server
MCP_AUTH_MODE=enabled              # 'enabled' (default) | 'disabled' (dev only)
MCP_MAX_PDF_SIZE_MB=100             # load_pdf URL download cap
MCP_MAX_NOTES_SIZE_KB=1024          # update_notes content cap
MCP_FETCH_TIMEOUT_MS=30000          # URL download timeout
MCP_REDIRECT_LIMIT=3                # URL download redirect limit
```

### 5.2 Prisma migration

One migration:

- `CREATE TABLE WorkspaceMcpToken` (full shape per §2.1)

**No `AgentInstance` migration.** v1's `runtime` column is gone.

### 5.3 New dependencies

Added to `web/package.json`:

- `@modelcontextprotocol/sdk` — MCP server SDK
- `pdf-parse` — server-side PDF page count extraction (no `pdfjs-dist`)

Optionally:
- `undici` is already a transitive dep of Next.js; the validating Agent uses it directly. No new top-level dep.

### 5.4 Next.js configuration

- `/api/mcp/workspace/[id]/` is `dynamic = 'force-dynamic'`
- Response streaming: `Cache-Control: no-cache, no-transform`

### 5.5 Docker

No changes.

## 6. Testing

### 6.1 Unit tests (vitest, `web/src/lib/mcp/__tests__/`)

Coverage target: **80%+ on new code**.

| File | Cases (minimum) |
|---|---|
| `auth.test.ts` | bearer present/absent; valid/invalid hash; revoked token; expired token; cross-workspace token mismatch; dev fallback all-three-AND positive and each negation |
| `tokens.test.ts` | create returns plaintext once; DB stores only hash; prefix is `pmsk_` + first 8 random chars; `name` required; revoke is idempotent |
| `workspaceAccess.test.ts` | owner pass; participant pass; stranger 403; missing workspace 404 |
| `ssrf.test.ts` | table-driven blocklist (≥12 cases: each CIDR, each literal, IPv6 forms, scheme block, redirect re-validation); validating lookup picks allowed address; multi-A response with one blocked entry rejects whole request |
| `tools/switch_component.test.ts` | each of 8 components; the 5 disabled return `COMPONENT_DISABLED`; the 3 active enqueue with correct payload |
| `tools/update_notes.test.ts` | replace creates new note Asset on first call; replace updates existing notesAssetId on subsequent calls; empty content rejected; >1 MB rejected; unknown fields silently dropped; directive POST shape matches plugin verbatim |
| `tools/load_pdf.test.ts` | assetId+url mutual exclusion; assetId Int (not string); ASSET_FORBIDDEN when userId mismatches; SSRF blocking; magic bytes pass/fail; URL hash dedup hit reuses assetId; page bounds; redirect limit; pdf-parse total pages extraction |

### 6.2 Layer 1 e2e (`tests/layer1/`)

Two specs:

- `mcp-protocol.spec.ts`: connect via `@modelcontextprotocol/sdk` client to local Next.js; test `initialize` → `list_tools` → `call_tool`; auth-pass and auth-fail flows
- `mcp-tools-e2e.spec.ts`: call each tool once; assert correct directive lands in `directiveQueue` (poll SSE)

### 6.3 Layer 2 / Layer 3

Not extended. Existing L2/L3 specs cover `SWITCH_COMPONENT` / `UPDATE_NOTES` / `PDF_LOAD_DOCUMENT` rendering. MCP introduces no new render path.

### 6.4 Manual smoke (must pass before land)

1. Configure Claude Desktop with the local MCP endpoint and a real token; call each of three tools; verify workspace UI updates
2. Configure Cursor or Codex with same; repeat
3. Existing L1/L2/L3 e2e suite passes

## 7. Documentation

| File | Content | When |
|---|---|---|
| `docs/plans/2026-04-28-workspace-mcp-design.md` | This spec | Now |
| `docs/self-hosting/mcp.md` | Token creation, client config snippets, troubleshooting, single-user authz disclaimer | Implementation phase |
| `web/src/lib/mcp/README.md` | Internal dev guide: directory layout, how to add a tool, error codes | Implementation phase |
| `docs/SCHEME.md` | Add `WorkspaceMcpToken` table | Implementation phase |
| `docs/ARCH.md` | Agent System: add MCP path alongside OpenClaw | Implementation phase |

## 8. Rollout Order

| Phase | Work | Acceptance |
|---|---|---|
| 0 | Prisma migration (`WorkspaceMcpToken` only); env loading; new deps | `db:push` clean on dev SQLite; `npm install` clean |
| 1 | `requireWorkspaceAccess` helper + tests; refactor existing workspace routes to use it (opportunistic; one route per PR) | Helper unit tests green; existing route tests still green |
| 2 | Auth + token CRUD (`lib/mcp/auth.ts`, `lib/mcp/tokens.ts`); workspace settings UI for tokens | Unit tests green; manual: create + revoke + list |
| 3 | MCP server skeleton (`route.ts`, `lib/mcp/server.ts`) — initialize + list_tools, empty tool set | `mcp-protocol.spec.ts` green |
| 4 | `notes.service.ts` extraction; refactor existing `PUT /api/workspace/[id]/notes/route.ts` to call it | Existing notes tests green |
| 5 | `ssrf.ts` + tests | Unit tests green (≥12 cases) |
| 6 | Tool implementations: `switch_component` → `update_notes` → `load_pdf` | Unit tests + L1 `mcp-tools-e2e.spec.ts` green |
| 7 | `ensureAgentForWorkspace` extraction + use from MCP tools | Manual: MCP call against a workspace with no AgentInstance row succeeds |
| 8 | Documentation + manual smoke | Smoke checklist signed off |

The order is deliberately bottom-up: helper, auth, server skeleton, services, tools. Each phase has a green-bar gate before the next. No phase requires modifying existing OpenClaw code paths.

## 9. Risks and Trade-offs

| Risk | Mitigation |
|---|---|
| `ssrf.ts` validating-lookup approach has edge cases (IPv6 dual-stack, custom DNS resolvers in user environments) | Phase 5 has a dedicated test matrix; cross-validate against `ssrf-req-filter` if its license allows |
| `pdf-parse` is unmaintained and fails on some malformed PDFs | Wrap in try/catch; on parse failure, return `totalPages: 0` and skip page validation; agent still gets the asset loaded — frontend can compute its own page count |
| Adding `requireWorkspaceAccess` to existing routes breaks them | Phase 1 is opportunistic per-route; each route refactor is its own PR with the existing route's e2e gating; no big-bang refactor |
| MCP client compatibility (different protocol minor versions) | Pin `@modelcontextprotocol/sdk`; manual smoke against two clients before land |
| The 5 disabled components in `DISABLED_COMPONENTS` may be re-enabled before this ships | The check uses the constant directly; re-enabling components is a one-liner edit, no MCP code change |
| `fetch` of the internal `/api/agents/[id]/directive` from inside Next.js may have edge cases on standalone build | Phase 6 verifies on `next build` output; if needed, fall back to in-process `directiveQueue.enqueue` import (the queue is exported, no refactor needed) |
| Forward-compat of "silently drop unknown fields" — clients may rely on errors to know they sent garbage | Documented; the alternative (reject unknowns) was found backwards by codex review and discarded |

## 10. Future Work (referenced, not implemented here)

- `update_notes` `mode: 'append'` + patch / `baseVersion` (Cursor-style co-authoring; product improvement #3)
- Remaining workspace tools as MCP (`jupyter_execute`, `latex_project`, `data_load`, etc.) — each its own short spec
- `HermesAgentService`: post-MCP, after at least 5 workspace tools are MCP-native
- Research workflow phase model (independent spec)
- Intelligent data → chart skill (independent spec; differentiation feature)
- Per-client MCP config templates
- MCP rate limit / IP allowlist
- Bridge thinning (post-merge plan #3)
- Re-enabling disabled components (separate UX decision per component)
- Optional cleanup: extract a shared `dispatchDirective()` once a second non-OpenClaw caller demands it

## Appendix A: Codex Findings Cross-Reference

For traceability, every codex finding maps to a v2 resolution:

| # | Codex finding | v2 resolution |
|---|---|---|
| 1 | `AgentInstance.workspaceId @unique` blocks two-row coexistence | §1.4 — drop virtual agent; reuse single AgentInstance |
| 2 | `dispatchDirective` would not be byte-identical | §4.3 — drop the extraction entirely |
| 3 | `AgentService` factory hardcodes types | §1.4 — MCP doesn't go through factory |
| 4 | DNS rebinding "dial IP" breaks TLS SNI | §3.4 — validating-lookup callback preserves SNI |
| 5 | SSRF rules incomplete (single-A only) | §3.4 — `dns.resolve4` + `dns.resolve6`, validate all |
| 6 | NO_DATA fields don't exist in schema | §3.2 — drop NO_DATA pre-check entirely |
| 7 | ComponentState debounced 3s | §3.2 — same; DB lookup race avoided |
| 8 | Wire protocol is `PDF_LOAD_DOCUMENT`, not `LOAD_PDF` | §3.4, §4.1 — reuse existing types verbatim |
| 9 | `Asset.id` is `Int` | §3.4 — `assetId: number` |
| 10 | `Asset.userId` and `WorkspaceSession.ownerId` are different identity systems | §3.4 — compare against `getRemoteUserId()` (current model) |
| 11 | No `WorkspaceNote` model | §3.3 — extract `notesService` from existing notes route, which uses Asset |
| 12 | "Reject reserved fields" is forward-incompatible | §3.1 — silently drop unknown fields |
| 13 | Workspace ACL helper does not exist | §2.5, §1.2 — add `requireWorkspaceAccess` as a real helper |
| 14 | `tokenHash @unique` makes "same hash, wrong workspace" impossible by construction | §2.3 — softened to defense-in-depth language |
| 15 | 5 components are in `DISABLED_COMPONENTS` and silently fail | §3.2 — server rejects with `COMPONENT_DISABLED` |
| 16 | OCR uses Volcengine, not `pdfjs-dist` | §3.4, §5.3 — add `pdf-parse` as a new dep; document |
| 17 | Phase 3 dispatchDirective extraction is not a prerequisite | §8 — extraction removed from critical path |
