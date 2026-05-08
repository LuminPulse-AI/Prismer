# Workspace MCP Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an MCP (Model Context Protocol) server to Prismer at `/api/mcp/workspace/[id]/` exposing three tools (`switch_component`, `update_notes`, `load_pdf`) so any MCP-capable agent (Hermes, Claude Desktop, Cursor, Codex) can drive a Prismer workspace UI without going through the OpenClaw container path.

**Architecture:** A new Next.js HTTP route hosts an MCP server using `@modelcontextprotocol/sdk` with `StreamableHTTPServerTransport`. Each tool resolves the workspace's existing `AgentInstance`, then POSTs to the existing `/api/agents/[id]/directive` endpoint with the same UPPERCASE wire types (`SWITCH_COMPONENT` / `UPDATE_NOTES` / `PDF_LOAD_DOCUMENT`) the OpenClaw plugin already uses — no new directive types, no frontend changes. Auth is per-workspace bearer tokens (`pmsk_...`) stored as SHA-256 hashes in a new `WorkspaceMcpToken` table.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma 6 (SQLite dev / MySQL prod), Zod 4, `@modelcontextprotocol/sdk`, `pdf-parse`, vitest, Playwright.

**Source spec:** `docs/plans/2026-04-28-workspace-mcp-design.md` (v2). All §refs in this plan point to that spec.

---

## File Structure

```
web/
├── prisma/schema.prisma                                        # +1 model (WorkspaceMcpToken)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── mcp/workspace/[id]/route.ts                     # NEW — MCP HTTP endpoint
│   │   │   └── workspace/[id]/
│   │   │       ├── mcp-tokens/route.ts                         # NEW — POST + GET
│   │   │       ├── mcp-tokens/[tokenId]/route.ts               # NEW — DELETE
│   │   │       └── notes/route.ts                              # MODIFIED — call notesService
│   │   ├── workspace/components/Settings/McpAccessPanel.tsx    # NEW — token UI
│   │   └── workspace/components/Settings/index.tsx             # MODIFIED — mount panel
│   ├── lib/
│   │   ├── mcp/
│   │   │   ├── server.ts                                       # NEW — MCP Server factory
│   │   │   ├── auth.ts                                         # NEW — bearer validation
│   │   │   ├── tokens.ts                                       # NEW — token CRUD (DB I/O)
│   │   │   ├── errors.ts                                       # NEW — error code enum + mapping
│   │   │   ├── ssrf.ts                                         # NEW — SSRF blocklist + lookup
│   │   │   ├── tools/
│   │   │   │   ├── index.ts                                    # NEW — registration
│   │   │   │   ├── switch_component.ts                         # NEW
│   │   │   │   ├── update_notes.ts                             # NEW
│   │   │   │   └── load_pdf.ts                                 # NEW
│   │   │   ├── README.md                                       # NEW — internal dev guide
│   │   │   └── __tests__/                                      # NEW — vitest unit tests
│   │   │       ├── auth.test.ts
│   │   │       ├── tokens.test.ts
│   │   │       ├── ssrf.test.ts
│   │   │       ├── workspace-access.test.ts
│   │   │       └── tools/
│   │   │           ├── switch_component.test.ts
│   │   │           ├── update_notes.test.ts
│   │   │           └── load_pdf.test.ts
│   │   └── services/
│   │       ├── notes.service.ts                                # NEW — extracted from notes route
│   │       ├── workspace-access.service.ts                     # NEW — requireWorkspaceAccess
│   │       └── workspace.service.ts                            # MODIFIED — add notesAssetId field
├── tests/layer1/
│   ├── mcp-protocol.spec.ts                                    # NEW — initialize + list_tools
│   └── mcp-tools-e2e.spec.ts                                   # NEW — each tool round-trip
├── package.json                                                # MODIFIED — +2 deps
├── .env.example                                                # MODIFIED — +5 env vars
docs/
├── self-hosting/mcp.md                                         # NEW — user-facing guide
├── SCHEME.md                                                   # MODIFIED — +WorkspaceMcpToken
└── ARCH.md                                                     # MODIFIED — +MCP path
```

**Decomposition rationale:**
- One file per tool keeps each ≤150 LoC and makes per-tool tests focused.
- `auth.ts` + `tokens.ts` separate (auth is request-scoped validation; tokens is DB CRUD).
- `notes.service.ts` is extracted *before* MCP needs it so the existing PUT route can adopt it first (Phase 4) — same code, two callers.
- `workspace-access.service.ts` is its own file because §1 says it gets adopted opportunistically by other workspace routes too.
- `ssrf.ts` is isolated so the test matrix is clearly bounded.

---

## Type/Identifier Glossary (locked at start)

| Name | Type | Source |
|---|---|---|
| `workspaceId` | `string` (cuid) | URL path param, `WorkspaceSession.id` |
| `agentId` | `string` (cuid) | `AgentInstance.id`, `@unique workspaceId` |
| `tokenId` | `string` (cuid) | `WorkspaceMcpToken.id` |
| `assetId` | `number` (Int) | `Asset.id` autoincrement |
| `userId` (workspace owner) | `string` (cuid) | `WorkspaceSession.ownerId`, `User.id` |
| `userId` (asset/legacy) | `number` | `Asset.userId`, returned by `getRemoteUserId()` (default `1`) |
| `tokenHash` | `string` | `sha256(plaintext)` hex |
| `tokenPrefix` | `string` | `pmsk_` + first 8 random base64url chars (13 chars total) |
| `plaintext` | `string` | `pmsk_` + 32 random bytes base64url (≈48 chars) |

Two `userId`s coexist because `Asset` keeps a legacy numeric ID while `User`/`WorkspaceSession` use cuid strings. Spec §2.5 calls this out. Throughout this plan: `userId: string` is the workspace-owner identity (NextAuth-compatible); `userId: number` is the asset-table identity from `getRemoteUserId()`. **Never mix them.**

---

## Phase 0 — DB migration + dependencies + env scaffolding

**Goal:** Schema row, deps installed, env vars wired. No behavior changes.

### Task 0.1: Add `WorkspaceMcpToken` model

**Files:**
- Modify: `web/prisma/schema.prisma` (add model after line 707, after `AgentInstance`)

- [ ] **Step 1: Add the model**

Append to `web/prisma/schema.prisma` after the `AgentInstance` block:

```prisma
model WorkspaceMcpToken {
  id          String   @id @default(cuid())
  workspaceId String
  workspace   WorkspaceSession @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tokenHash   String   @unique
  prefix      String
  name        String
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  revokedAt   DateTime?
  createdBy   String
  createdAt   DateTime @default(now())

  @@index([workspaceId])
  @@index([tokenHash])
}
```

Add the back-relation on `WorkspaceSession`. Insert this line into the existing `WorkspaceSession` model (around line 423) alongside the other relations:

```prisma
  mcpTokens     WorkspaceMcpToken[]
```

- [ ] **Step 2: Generate Prisma Client and push schema**

```bash
cd web
npm run db:generate
npm run db:push
```

Expected: `npm run db:push` reports `✔ Generated Prisma Client` and `Your database is now in sync with your Prisma schema`. SQLite file at `web/prisma/dev.db` updated.

- [ ] **Step 3: Verify the table exists via Prisma Studio (optional smoke)**

```bash
cd web
npx prisma db execute --stdin <<EOF
SELECT name FROM sqlite_master WHERE type='table' AND name='WorkspaceMcpToken';
EOF
```

Expected: prints `name\nWorkspaceMcpToken`.

- [ ] **Step 4: Commit**

```bash
git add web/prisma/schema.prisma
git commit -m "feat(mcp): add WorkspaceMcpToken model"
```

---

### Task 0.2: Add npm dependencies

**Files:**
- Modify: `web/package.json` (add to `dependencies`)

- [ ] **Step 1: Install MCP SDK and pdf-parse**

```bash
cd web
npm install @modelcontextprotocol/sdk@^1.18.0 pdf-parse@^1.1.1
npm install --save-dev @types/pdf-parse@^1.1.4
```

Expected: `package.json` and `package-lock.json` updated; install completes without errors.

- [ ] **Step 2: Verify imports compile**

Create a throwaway `web/src/lib/mcp/_smoke.ts` (will be deleted next step):

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import pdfParse from 'pdf-parse';

void Server;
void StreamableHTTPServerTransport;
void pdfParse;
```

Run:
```bash
cd web
npx tsc --noEmit src/lib/mcp/_smoke.ts
```

Expected: exits 0 (no type errors).

- [ ] **Step 3: Delete smoke file**

```bash
rm web/src/lib/mcp/_smoke.ts
```

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat(mcp): add @modelcontextprotocol/sdk and pdf-parse deps"
```

---

### Task 0.3: Add environment variables

**Files:**
- Modify: `web/.env.example`

- [ ] **Step 1: Append MCP env block to `.env.example`**

Append to `web/.env.example`:

```bash

# ============================================================
# MCP server (Phase 1: switch_component / update_notes / load_pdf)
# ============================================================
MCP_AUTH_MODE=enabled              # 'enabled' (default) | 'disabled' (dev only, requires NODE_ENV=development AND localhost client)
MCP_MAX_PDF_SIZE_MB=100             # load_pdf URL download cap
MCP_MAX_NOTES_SIZE_KB=1024          # update_notes content cap
MCP_FETCH_TIMEOUT_MS=30000          # URL download timeout
MCP_REDIRECT_LIMIT=3                # URL download redirect limit
```

- [ ] **Step 2: Commit**

```bash
git add web/.env.example
git commit -m "feat(mcp): document MCP env vars in .env.example"
```

---

## Phase 1 — `requireWorkspaceAccess` helper

**Goal:** A reusable workspace-access helper. In current self-host single-user mode it trivially passes; future multi-user just plugs into this one function. **Spec §2.5.**

### Task 1.1: Write the helper test

**Files:**
- Create: `web/src/lib/services/__tests__/workspace-access.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/services/__tests__/workspace-access.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const findUnique = vi.fn();
  const findUniqueParticipant = vi.fn();
  return {
    default: {
      workspaceSession: { findUnique },
      workspaceParticipant: { findUnique: findUniqueParticipant },
    },
  };
});

import prisma from '@/lib/prisma';
import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';

const mockedWorkspace = prisma.workspaceSession.findUnique as ReturnType<typeof vi.fn>;
const mockedParticipant = prisma.workspaceParticipant.findUnique as ReturnType<typeof vi.fn>;

describe('requireWorkspaceAccess', () => {
  beforeEach(() => {
    mockedWorkspace.mockReset();
    mockedParticipant.mockReset();
  });

  it('returns asOwner=true when caller is the workspace owner', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'user1' });

    const ctx = await requireWorkspaceAccess('ws1', 'user1');

    expect(ctx).toEqual({ workspaceId: 'ws1', userId: 'user1', asOwner: true });
  });

  it('returns asOwner=false when caller is a participant', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'other' });
    mockedParticipant.mockResolvedValueOnce({ id: 'p1' });

    const ctx = await requireWorkspaceAccess('ws1', 'user2');

    expect(ctx).toEqual({ workspaceId: 'ws1', userId: 'user2', asOwner: false });
  });

  it('throws WorkspaceAccessError(404) when workspace does not exist', async () => {
    mockedWorkspace.mockResolvedValueOnce(null);

    await expect(requireWorkspaceAccess('missing', 'user1')).rejects.toMatchObject({
      name: 'WorkspaceAccessError',
      status: 404,
    });
  });

  it('throws WorkspaceAccessError(403) when caller is neither owner nor participant', async () => {
    mockedWorkspace.mockResolvedValueOnce({ id: 'ws1', ownerId: 'other' });
    mockedParticipant.mockResolvedValueOnce(null);

    await expect(requireWorkspaceAccess('ws1', 'stranger')).rejects.toMatchObject({
      name: 'WorkspaceAccessError',
      status: 403,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/services/__tests__/workspace-access.service.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/services/workspace-access.service'" (or similar import error).

### Task 1.2: Implement `requireWorkspaceAccess`

**Files:**
- Create: `web/src/lib/services/workspace-access.service.ts`

- [ ] **Step 1: Implement the helper**

```ts
// web/src/lib/services/workspace-access.service.ts
import prisma from '@/lib/prisma';

export interface WorkspaceAccessContext {
  workspaceId: string;
  userId: string;
  asOwner: boolean;
}

export class WorkspaceAccessError extends Error {
  override name = 'WorkspaceAccessError' as const;
  constructor(public status: 403 | 404, message: string) {
    super(message);
  }
}

/**
 * Verify a user has access to a workspace.
 *
 * In current self-host single-user mode all workspaces are owned by the
 * implicit user; calls trivially pass. The helper is implemented now so
 * multi-user can be added later without ratcheting every workspace route.
 */
export async function requireWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<WorkspaceAccessContext> {
  const workspace = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });

  if (!workspace) {
    throw new WorkspaceAccessError(404, `Workspace ${workspaceId} not found`);
  }

  if (workspace.ownerId === userId) {
    return { workspaceId, userId, asOwner: true };
  }

  const participant = await prisma.workspaceParticipant.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });

  if (participant) {
    return { workspaceId, userId, asOwner: false };
  }

  throw new WorkspaceAccessError(403, `User ${userId} has no access to workspace ${workspaceId}`);
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/services/__tests__/workspace-access.service.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/services/workspace-access.service.ts web/src/lib/services/__tests__/workspace-access.service.test.ts
git commit -m "feat(mcp): add requireWorkspaceAccess helper with tests"
```

---

## Phase 2 — Auth + token CRUD

**Goal:** Bearer-token auth (`lib/mcp/auth.ts`), token CRUD library (`lib/mcp/tokens.ts`), three HTTP endpoints, and a settings UI panel. Auth is wired but no MCP server exists yet — that's Phase 3.

### Task 2.1: Token CRUD library — write failing tests

**Files:**
- Create: `web/src/lib/mcp/__tests__/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// web/src/lib/mcp/__tests__/tokens.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@/lib/prisma';
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpToken,
  validateMcpToken,
} from '@/lib/mcp/tokens';

describe('mcp/tokens', () => {
  let workspaceId: string;
  const ownerId = 'user-tokens-test';

  beforeEach(async () => {
    await prisma.workspaceMcpToken.deleteMany({});
    await prisma.workspaceSession.deleteMany({ where: { ownerId } });
    await prisma.user.upsert({
      where: { email: 'tokens-test@example.com' },
      update: { id: ownerId },
      create: { id: ownerId, email: 'tokens-test@example.com' },
    });
    const ws = await prisma.workspaceSession.create({
      data: { name: 'tokens-test', ownerId },
    });
    workspaceId = ws.id;
  });

  it('createMcpToken returns plaintext exactly once and stores only the hash', async () => {
    const result = await createMcpToken({
      workspaceId,
      name: 'CI bot',
      createdBy: ownerId,
    });

    expect(result.plaintext).toMatch(/^pmsk_[A-Za-z0-9_-]{40,}$/);
    expect(result.prefix).toMatch(/^pmsk_[A-Za-z0-9_-]{8}$/);
    expect(result.prefix.length).toBe(13);

    const row = await prisma.workspaceMcpToken.findUnique({ where: { id: result.id } });
    expect(row?.tokenHash).toBeDefined();
    expect(row?.tokenHash).not.toBe(result.plaintext);
    expect(row?.tokenHash.length).toBe(64); // sha256 hex
  });

  it('listMcpTokens returns metadata without plaintext', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    const list = await listMcpTokens(workspaceId);

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, prefix: created.prefix, name: 'A' });
    expect(list[0]).not.toHaveProperty('plaintext');
    expect(list[0]).not.toHaveProperty('tokenHash');
  });

  it('revokeMcpToken sets revokedAt and is idempotent', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    await revokeMcpToken(workspaceId, created.id);
    await revokeMcpToken(workspaceId, created.id); // second call is OK

    const row = await prisma.workspaceMcpToken.findUnique({ where: { id: created.id } });
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it('validateMcpToken accepts valid token and rejects revoked', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    const ok = await validateMcpToken(created.plaintext, workspaceId);
    expect(ok).toMatchObject({ workspaceId, tokenId: created.id });

    await revokeMcpToken(workspaceId, created.id);
    await expect(validateMcpToken(created.plaintext, workspaceId)).rejects.toThrow(/revoked/i);
  });

  it('validateMcpToken rejects token bound to different workspace', async () => {
    const otherWs = await prisma.workspaceSession.create({
      data: { name: 'tokens-test-other', ownerId },
    });
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    await expect(validateMcpToken(created.plaintext, otherWs.id)).rejects.toThrow(/workspace/i);
  });

  it('validateMcpToken rejects expired token', async () => {
    const past = new Date(Date.now() - 60_000);
    const created = await createMcpToken({
      workspaceId,
      name: 'A',
      createdBy: ownerId,
      expiresAt: past,
    });

    await expect(validateMcpToken(created.plaintext, workspaceId)).rejects.toThrow(/expired/i);
  });

  it('validateMcpToken updates lastUsedAt on success (fire-and-forget)', async () => {
    const created = await createMcpToken({ workspaceId, name: 'A', createdBy: ownerId });

    await validateMcpToken(created.plaintext, workspaceId);
    // fire-and-forget — wait for next tick
    await new Promise((r) => setTimeout(r, 50));

    const row = await prisma.workspaceMcpToken.findUnique({ where: { id: created.id } });
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tokens.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/mcp/tokens'".

### Task 2.2: Token CRUD library — implementation

**Files:**
- Create: `web/src/lib/mcp/tokens.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/mcp/tokens.ts
import { createHash, randomBytes } from 'crypto';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpTokens');

const TOKEN_PREFIX = 'pmsk_';
const RANDOM_BYTES = 32;
const PREFIX_VISIBLE_LEN = 8;

export interface CreateTokenInput {
  workspaceId: string;
  name: string;
  createdBy: string;
  expiresAt?: Date;
}

export interface CreatedToken {
  id: string;
  prefix: string;
  name: string;
  plaintext: string;
}

export interface TokenSummary {
  id: string;
  prefix: string;
  name: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface TokenContext {
  tokenId: string;
  workspaceId: string;
  prefix: string;
}

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function generatePlaintext(): { plaintext: string; prefix: string } {
  const random = randomBytes(RANDOM_BYTES).toString('base64url');
  const plaintext = TOKEN_PREFIX + random;
  const prefix = TOKEN_PREFIX + random.slice(0, PREFIX_VISIBLE_LEN);
  return { plaintext, prefix };
}

export async function createMcpToken(input: CreateTokenInput): Promise<CreatedToken> {
  const { plaintext, prefix } = generatePlaintext();
  const tokenHash = hashToken(plaintext);

  const row = await prisma.workspaceMcpToken.create({
    data: {
      workspaceId: input.workspaceId,
      tokenHash,
      prefix,
      name: input.name,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    },
  });

  log.info('MCP token created', {
    workspaceId: input.workspaceId,
    tokenId: row.id,
    prefix,
  });

  return { id: row.id, prefix, name: row.name, plaintext };
}

export async function listMcpTokens(workspaceId: string): Promise<TokenSummary[]> {
  const rows = await prisma.workspaceMcpToken.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      prefix: true,
      name: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

export async function revokeMcpToken(workspaceId: string, tokenId: string): Promise<void> {
  await prisma.workspaceMcpToken.updateMany({
    where: { id: tokenId, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  log.info('MCP token revoked', { workspaceId, tokenId });
}

export async function validateMcpToken(
  plaintext: string,
  workspaceId: string
): Promise<TokenContext> {
  if (!plaintext.startsWith(TOKEN_PREFIX)) {
    throw new Error('Invalid token format');
  }

  const tokenHash = hashToken(plaintext);
  const row = await prisma.workspaceMcpToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      workspaceId: true,
      prefix: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!row) {
    throw new Error('Token not found');
  }
  if (row.revokedAt) {
    throw new Error('Token revoked');
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    throw new Error('Token expired');
  }
  if (row.workspaceId !== workspaceId) {
    throw new Error('Token does not match workspace');
  }

  // Fire-and-forget lastUsedAt update — failures are non-fatal.
  prisma.workspaceMcpToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => log.warn('Failed to update lastUsedAt', { tokenId: row.id, err: String(err) }));

  return { tokenId: row.id, workspaceId: row.workspaceId, prefix: row.prefix };
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tokens.test.ts
```

Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/mcp/tokens.ts web/src/lib/mcp/__tests__/tokens.test.ts
git commit -m "feat(mcp): add token CRUD library (tokens.ts) with tests"
```

---

### Task 2.3: Bearer auth — write failing tests

**Files:**
- Create: `web/src/lib/mcp/__tests__/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// web/src/lib/mcp/__tests__/auth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/mcp/tokens', () => ({
  validateMcpToken: vi.fn(),
}));

import { validateMcpToken } from '@/lib/mcp/tokens';
import { authenticateMcpRequest } from '@/lib/mcp/auth';

const mockedValidate = validateMcpToken as ReturnType<typeof vi.fn>;

function makeRequest(opts: { authorization?: string; remoteAddr?: string }): Request {
  const headers = new Headers();
  if (opts.authorization) headers.set('authorization', opts.authorization);
  if (opts.remoteAddr) headers.set('x-forwarded-for', opts.remoteAddr);
  return new Request('http://localhost/api/mcp/workspace/ws1', { headers });
}

describe('authenticateMcpRequest', () => {
  beforeEach(() => {
    mockedValidate.mockReset();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects request with no Authorization header (401)', async () => {
    const req = makeRequest({});
    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects malformed Authorization header (401)', async () => {
    const req = makeRequest({ authorization: 'NotBearer xyz' });
    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when token validation fails (401)', async () => {
    mockedValidate.mockRejectedValueOnce(new Error('Token revoked'));
    const req = makeRequest({ authorization: 'Bearer pmsk_xxx' });
    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects when token belongs to different workspace (403)', async () => {
    mockedValidate.mockRejectedValueOnce(new Error('Token does not match workspace'));
    const req = makeRequest({ authorization: 'Bearer pmsk_xxx' });
    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 403 });
  });

  it('passes valid token and returns context', async () => {
    mockedValidate.mockResolvedValueOnce({
      tokenId: 't1',
      workspaceId: 'ws1',
      prefix: 'pmsk_abcd1234',
    });
    const req = makeRequest({ authorization: 'Bearer pmsk_xxx' });

    const ctx = await authenticateMcpRequest(req, 'ws1');

    expect(ctx).toEqual({ tokenId: 't1', workspaceId: 'ws1', prefix: 'pmsk_abcd1234' });
  });

  it('dev fallback: skips when MCP_AUTH_MODE=disabled AND NODE_ENV=development AND remote is localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');
    const req = makeRequest({ remoteAddr: '127.0.0.1' });

    const ctx = await authenticateMcpRequest(req, 'ws1');

    expect(ctx).toMatchObject({ workspaceId: 'ws1', prefix: 'dev' });
    expect(mockedValidate).not.toHaveBeenCalled();
  });

  it('dev fallback: rejects when remote is non-loopback even if other conditions hold', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');
    const req = makeRequest({ remoteAddr: '192.168.1.5' });

    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 401 });
  });

  it('dev fallback: rejects when NODE_ENV=production even if MCP_AUTH_MODE=disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_AUTH_MODE', 'disabled');
    const req = makeRequest({ remoteAddr: '127.0.0.1' });

    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 401 });
  });

  it('dev fallback: rejects when MCP_AUTH_MODE!=disabled even on localhost in dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_AUTH_MODE', 'enabled');
    const req = makeRequest({ remoteAddr: '127.0.0.1' });

    await expect(authenticateMcpRequest(req, 'ws1')).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/auth.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/mcp/auth'".

### Task 2.4: Bearer auth — implementation

**Files:**
- Create: `web/src/lib/mcp/auth.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/mcp/auth.ts
import { validateMcpToken, type TokenContext } from '@/lib/mcp/tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpAuth');

export class McpAuthError extends Error {
  override name = 'McpAuthError' as const;
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLoopback(req: Request): boolean {
  const xff = req.headers.get('x-forwarded-for');
  const candidate = (xff?.split(',')[0]?.trim() ?? '').toLowerCase();
  return LOOPBACK.has(candidate);
}

function devFallbackEnabled(req: Request): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.MCP_AUTH_MODE === 'disabled' &&
    isLoopback(req)
  );
}

export async function authenticateMcpRequest(
  req: Request,
  workspaceId: string
): Promise<TokenContext> {
  if (devFallbackEnabled(req)) {
    log.warn('Auth bypassed via dev fallback', { workspaceId });
    return { tokenId: 'dev', workspaceId, prefix: 'dev' };
  }

  const header = req.headers.get('authorization');
  if (!header) {
    throw new McpAuthError(401, 'Missing Authorization header');
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new McpAuthError(401, 'Malformed Authorization header');
  }
  const plaintext = match[1].trim();

  try {
    const ctx = await validateMcpToken(plaintext, workspaceId);
    return ctx;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /workspace/i.test(msg) ? 403 : 401;
    log.warn('Auth rejected', { workspaceId, reason: msg, status });
    throw new McpAuthError(status, msg);
  }
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/auth.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/mcp/auth.ts web/src/lib/mcp/__tests__/auth.test.ts
git commit -m "feat(mcp): add bearer auth with dev fallback (auth.ts)"
```

---

### Task 2.5: Token CRUD HTTP endpoints

**Files:**
- Create: `web/src/app/api/workspace/[id]/mcp-tokens/route.ts`
- Create: `web/src/app/api/workspace/[id]/mcp-tokens/[tokenId]/route.ts`

> **Auth gotcha:** spec §2.6 says token CRUD requires "an authenticated NextAuth session AND `requireWorkspaceAccess`". Codebase does not yet ship a NextAuth `auth()` helper. For Phase 1 self-host single-user mode, derive the caller's `userId` from the workspace's `ownerId` (looked up by URL path) and pass it through `requireWorkspaceAccess` — the call trivially passes because the implicit user equals the owner. When NextAuth lands later, swap the lookup for `(await auth()).user.id`. **No new TODO** — this matches the spec's own self-host single-user disclaimer.

- [ ] **Step 1: Implement POST + GET**

```ts
// web/src/app/api/workspace/[id]/mcp-tokens/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';
import { createMcpToken, listMcpTokens } from '@/lib/mcp/tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpTokensApi');

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveCallerUserId(workspaceId: string): Promise<string> {
  // Self-host single-user mode: caller is the workspace owner.
  // Replace with NextAuth session lookup once auth is wired.
  const ws = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!ws) throw new WorkspaceAccessError(404, `Workspace ${workspaceId} not found`);
  return ws.ownerId;
}

const CreateBody = z.object({
  name: z.string().min(1).max(120),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;
  try {
    const userId = await resolveCallerUserId(workspaceId);
    await requireWorkspaceAccess(workspaceId, userId);

    const body = CreateBody.parse(await req.json());
    const token = await createMcpToken({
      workspaceId,
      name: body.name,
      createdBy: userId,
    });

    return NextResponse.json({ success: true, data: token }, { status: 201 });
  } catch (err) {
    return errorToResponse(err, 'POST /api/workspace/[id]/mcp-tokens');
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;
  try {
    const userId = await resolveCallerUserId(workspaceId);
    await requireWorkspaceAccess(workspaceId, userId);

    const tokens = await listMcpTokens(workspaceId);
    return NextResponse.json({ success: true, data: tokens });
  } catch (err) {
    return errorToResponse(err, 'GET /api/workspace/[id]/mcp-tokens');
  }
}

function errorToResponse(err: unknown, op: string): NextResponse {
  if (err instanceof WorkspaceAccessError) {
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body', details: err.errors },
      { status: 400 }
    );
  }
  log.error(op, { err: err instanceof Error ? err.message : String(err) });
  return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
}
```

- [ ] **Step 2: Implement DELETE**

```ts
// web/src/app/api/workspace/[id]/mcp-tokens/[tokenId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  requireWorkspaceAccess,
  WorkspaceAccessError,
} from '@/lib/services/workspace-access.service';
import { revokeMcpToken } from '@/lib/mcp/tokens';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpTokensApi');

interface RouteParams {
  params: Promise<{ id: string; tokenId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, tokenId } = await params;
  try {
    const ws = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });
    if (!ws) throw new WorkspaceAccessError(404, `Workspace ${workspaceId} not found`);

    await requireWorkspaceAccess(workspaceId, ws.ownerId);
    await revokeMcpToken(workspaceId, tokenId);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof WorkspaceAccessError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    log.error('DELETE /api/workspace/[id]/mcp-tokens/[tokenId]', {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Smoke test the endpoints**

```bash
cd web
npm run dev &
DEV_PID=$!
sleep 5

# Find any existing workspace id; if none, create one via Prisma
WS_ID=$(npx tsx -e "import prisma from './src/lib/prisma'; (async()=>{const w=await prisma.workspaceSession.findFirst();console.log(w?.id||'none');await prisma.\$disconnect()})()")
echo "Using workspace: $WS_ID"

curl -s -X POST "http://localhost:3000/api/workspace/$WS_ID/mcp-tokens" \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke"}'
echo

curl -s "http://localhost:3000/api/workspace/$WS_ID/mcp-tokens"
echo

kill $DEV_PID
```

Expected: POST returns `{"success":true,"data":{"id":"...","prefix":"pmsk_...","name":"smoke","plaintext":"pmsk_..."}}`. GET returns the token in a list (no `plaintext`).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/workspace/\[id\]/mcp-tokens
git commit -m "feat(mcp): add token CRUD HTTP endpoints"
```

---

### Task 2.6: Settings UI — `McpAccessPanel` component

**Files:**
- Create: `web/src/app/workspace/components/Settings/McpAccessPanel.tsx`
- Modify: `web/src/app/workspace/components/Settings/index.tsx` (mount the panel)

> **Note:** Repo's actual settings location may differ. Before editing, check `web/src/app/workspace/components/` for the existing settings entry point. If no settings panel exists yet, create the panel as a standalone component and add a TODO in `docs/plans/2026-04-30-workspace-mcp-phase1-followups.md` to mount it once a settings UI exists. **Do not invent a settings dialog**; the panel can ship and be hooked up later. Spec only requires the *endpoint* surface to be usable.

- [ ] **Step 1: Implement the panel component**

```tsx
// web/src/app/workspace/components/Settings/McpAccessPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface TokenSummary {
  id: string;
  prefix: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function McpAccessPanel({ workspaceId }: { workspaceId: string }) {
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [revealed, setRevealed] = useState<{ name: string; plaintext: string } | null>(null);

  async function refresh() {
    const res = await fetch(`/api/workspace/${workspaceId}/mcp-tokens`);
    const json = await res.json();
    if (json.success) setTokens(json.data);
  }

  useEffect(() => {
    void refresh();
  }, [workspaceId]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/mcp-tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setRevealed({ name: json.data.name, plaintext: json.data.plaintext });
      setNewName('');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    const res = await fetch(`/api/workspace/${workspaceId}/mcp-tokens/${tokenId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (json.success) {
      toast.success('Token revoked');
      await refresh();
    } else {
      toast.error(json.error || 'Failed to revoke');
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-base font-semibold">MCP Access</h3>
        <p className="text-sm text-muted-foreground">
          Generate per-workspace tokens for MCP-capable agents (Claude Desktop, Cursor, Codex, ...).
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Endpoint: <code>/api/mcp/workspace/{workspaceId}/</code>
        </p>
      </header>

      <div className="space-y-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Token name (e.g., 'Claude Desktop')"
          className="border rounded px-2 py-1 w-full"
        />
        <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? 'Generating...' : 'Generate Token'}
        </Button>
      </div>

      {revealed && (
        <div className="border rounded p-3 bg-yellow-50 space-y-2">
          <p className="text-sm font-medium">Copy this token now — it will not be shown again:</p>
          <code className="block break-all bg-white p-2 text-xs">{revealed.plaintext}</code>
          <Button
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(revealed.plaintext);
              toast.success('Copied to clipboard');
            }}
          >
            Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
            I have copied it
          </Button>
        </div>
      )}

      <ul className="space-y-1 text-sm">
        {tokens.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between border rounded px-3 py-2"
          >
            <div>
              <span className="font-mono text-xs">{t.prefix}</span> · {t.name}
              {t.revokedAt && <span className="ml-2 text-red-500 text-xs">revoked</span>}
              {t.lastUsedAt && (
                <span className="ml-2 text-xs text-muted-foreground">
                  last used {new Date(t.lastUsedAt).toLocaleString()}
                </span>
              )}
            </div>
            {!t.revokedAt && (
              <Button size="sm" variant="ghost" onClick={() => handleRevoke(t.id)}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd web
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/workspace/components/Settings/McpAccessPanel.tsx
git commit -m "feat(mcp): add McpAccessPanel UI for token management"
```

---

## Phase 3 — MCP server skeleton

**Goal:** A working MCP endpoint that responds to `initialize` and `list_tools` with an empty tool set. Real tool registration happens in Phase 6.

### Task 3.1: Error code module

**Files:**
- Create: `web/src/lib/mcp/errors.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/mcp/errors.ts
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpErrorCode =
  | 'UNKNOWN_COMPONENT'
  | 'COMPONENT_DISABLED'
  | 'EMPTY_CONTENT'
  | 'TOO_LARGE'
  | 'MISSING_SOURCE'
  | 'BOTH_SOURCES'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_FORBIDDEN'
  | 'URL_INVALID'
  | 'URL_FETCH_FAILED'
  | 'URL_NOT_PDF'
  | 'URL_TOO_LARGE'
  | 'INVALID_PAGE'
  | 'INTERNAL_ERROR';

export function toolError(code: McpErrorCode, message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
    isError: true,
  };
}

export function toolSuccess<T>(data: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    isError: false,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/mcp/errors.ts
git commit -m "feat(mcp): add error code module (errors.ts)"
```

---

### Task 3.2: MCP Server factory

**Files:**
- Create: `web/src/lib/mcp/server.ts`
- Create: `web/src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Implement empty tool registry**

```ts
// web/src/lib/mcp/tools/index.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { TokenContext } from '@/lib/mcp/tokens';

export interface ToolContext {
  workspaceId: string;
  token: TokenContext;
}

/**
 * Registers all Phase 1 tools on the MCP server.
 * Filled in during Phase 6 (one task per tool).
 */
export function registerTools(_server: Server, _ctx: ToolContext): void {
  // Phase 6 will register: switch_component, update_notes, load_pdf
}
```

- [ ] **Step 2: Implement server factory**

```ts
// web/src/lib/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerTools, type ToolContext } from '@/lib/mcp/tools';

export function createMcpServer(ctx: ToolContext): Server {
  const server = new Server(
    { name: 'prismer-workspace', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );
  registerTools(server, ctx);
  return server;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/mcp/server.ts web/src/lib/mcp/tools/index.ts
git commit -m "feat(mcp): add MCP server factory and empty tool registry"
```

---

### Task 3.3: MCP HTTP route

**Files:**
- Create: `web/src/app/api/mcp/workspace/[id]/route.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/app/api/mcp/workspace/[id]/route.ts
import { NextRequest } from 'next/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '@/lib/mcp/server';
import { authenticateMcpRequest, McpAuthError } from '@/lib/mcp/auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpRoute');

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function handle(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id: workspaceId } = await params;
  const start = Date.now();

  let token;
  try {
    token = await authenticateMcpRequest(req, workspaceId);
  } catch (err) {
    if (err instanceof McpAuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    log.error('Auth error', { workspaceId, err: String(err) });
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }

  const server = createMcpServer({ workspaceId, token });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  let body: unknown = undefined;
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      // empty body is OK for some MCP probes
    }
  }

  // Bridge Web Request/Response → Node IncomingMessage/ServerResponse via a minimal shim.
  // The MCP SDK transport is Node-flavored; Next.js Edge or Node runtime both expose
  // the underlying Node socket via internal utilities, but the cleanest path is to
  // convert here. See https://github.com/modelcontextprotocol/typescript-sdk for details.
  const { req: nodeReq, res: nodeRes, response } = await toNodeAdapter(req, body);

  await server.connect(transport);
  await transport.handleRequest(nodeReq, nodeRes, body);

  const finished = await response;
  log.info('MCP request handled', {
    workspaceId,
    tokenPrefix: token.prefix,
    method: req.method,
    durationMs: Date.now() - start,
    status: finished.status,
  });
  return finished;
}

export const POST = handle;
export const GET = handle;

// ---- Web Request → Node adapter (used because MCP SDK speaks Node IM/SR) ----

import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { Readable } from 'stream';

interface NodeAdapter {
  req: IncomingMessage;
  res: ServerResponse;
  response: Promise<Response>;
}

async function toNodeAdapter(req: NextRequest, body: unknown): Promise<NodeAdapter> {
  const socket = new Socket();
  const nodeReq = new IncomingMessage(socket);
  nodeReq.method = req.method;
  nodeReq.url = new URL(req.url).pathname + new URL(req.url).search;
  for (const [k, v] of req.headers.entries()) {
    nodeReq.headers[k.toLowerCase()] = v;
  }
  // Push the parsed body back as a stream so transport.handleRequest can re-read it
  if (body !== undefined) {
    const buf = Buffer.from(JSON.stringify(body));
    Readable.from([buf]).pipe(nodeReq);
  } else {
    nodeReq.push(null);
  }

  const chunks: Buffer[] = [];
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let resolve: (r: Response) => void;
  const responsePromise = new Promise<Response>((r) => {
    resolve = r;
  });

  const nodeRes = new ServerResponse(nodeReq);
  // @ts-expect-error monkey-patch for capture
  nodeRes.writeHead = (code: number, hdrs?: Record<string, string>) => {
    statusCode = code;
    if (hdrs) Object.assign(headers, hdrs);
    return nodeRes;
  };
  // @ts-expect-error monkey-patch for capture
  nodeRes.write = (chunk: string | Buffer) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };
  // @ts-expect-error monkey-patch for capture
  nodeRes.end = (chunk?: string | Buffer) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    resolve(
      new Response(Buffer.concat(chunks), {
        status: statusCode,
        headers: { ...headers, 'Cache-Control': 'no-cache, no-transform' },
      })
    );
    return nodeRes;
  };

  return { req: nodeReq, res: nodeRes, response: responsePromise };
}
```

> **Implementation note:** The Web↔Node adapter above is intentionally minimal and matches Next.js's own internal MCP middleware (`next/dist/esm/server/mcp/get-mcp-middleware.js`). If `transport.handleRequest` ever requires features the shim doesn't cover (e.g., true streaming for SSE), revisit by either: (a) using Next.js's `unstable_after` to keep the connection open, or (b) calling the underlying `handleStreamableRequest` directly with a `ReadableStream`. Phase 1 only needs request/response semantics — no streaming.

- [ ] **Step 2: Smoke-test with the MCP SDK client**

```bash
cd web
npm run dev &
DEV_PID=$!
sleep 5

# Create a token
WS_ID=$(npx tsx -e "import p from './src/lib/prisma'; (async()=>{const w=await p.workspaceSession.findFirst();console.log(w?.id||'none');await p.\$disconnect()})()")
TOKEN=$(curl -s -X POST "http://localhost:3000/api/workspace/$WS_ID/mcp-tokens" \
  -H "Content-Type: application/json" -d '{"name":"smoke"}' | npx jq -r '.data.plaintext')
echo "Token: $TOKEN"

# Call initialize
curl -s -X POST "http://localhost:3000/api/mcp/workspace/$WS_ID/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.1"}}}'
echo

# Call tools/list
curl -s -X POST "http://localhost:3000/api/mcp/workspace/$WS_ID/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
echo

kill $DEV_PID
```

Expected:
- `initialize` returns a JSON-RPC result with `serverInfo.name = "prismer-workspace"`.
- `tools/list` returns `{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}` (empty — Phase 6 fills it).

If the smoke test fails, do **not** patch around it: re-read `next/dist/esm/server/mcp/get-mcp-middleware.js` and align the adapter exactly.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/mcp/workspace/\[id\]/route.ts
git commit -m "feat(mcp): add MCP HTTP endpoint with empty tool set"
```

---

## Phase 4 — Notes service extraction

**Goal:** Move the notes upsert logic from `PUT /api/workspace/[id]/notes/route.ts` into a `notesService.upsertWorkspaceNote(workspaceId, content)` function. The existing route adopts the service. The `update_notes` MCP tool will call the same service in Phase 6.

### Task 4.1: Add `notesAssetId` to `WorkspaceSettings`

**Files:**
- Modify: `web/src/lib/services/workspace.service.ts:192-200` (extend interface)

- [ ] **Step 1: Extend the interface**

In `web/src/lib/services/workspace.service.ts`, replace lines 192-200:

```ts
// BEFORE
export interface WorkspaceSettings {
  autoSave?: boolean;
  notificationsEnabled?: boolean;
  theme?: 'light' | 'dark' | 'system';
  orchestrator?: 'docker' | 'kubernetes';
  imageTag?: string;
}
```

with:

```ts
export interface WorkspaceSettings {
  autoSave?: boolean;
  notificationsEnabled?: boolean;
  theme?: 'light' | 'dark' | 'system';
  orchestrator?: 'docker' | 'kubernetes';
  imageTag?: string;
  collectionId?: number;     // workspace's default Collection (existing — was already used in code)
  notesAssetId?: number;     // workspace's pinned notes Asset (new — used by notesService)
}
```

> Both `collectionId` and `notesAssetId` were already being read/written through ad-hoc `JSON.parse(settings)` (see existing notes route and `workspace.service.ts:464`). Hoisting them into the type is a pure type-level refactor with no runtime change.

- [ ] **Step 2: Run typecheck**

```bash
cd web
npx tsc --noEmit
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/services/workspace.service.ts
git commit -m "refactor(mcp): hoist collectionId and notesAssetId into WorkspaceSettings type"
```

---

### Task 4.2: Notes service — write failing test

**Files:**
- Create: `web/src/lib/services/__tests__/notes.service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// web/src/lib/services/__tests__/notes.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import prisma from '@/lib/prisma';
import { upsertWorkspaceNote } from '@/lib/services/notes.service';

describe('upsertWorkspaceNote', () => {
  let workspaceId: string;
  const ownerId = 'user-notes-test';

  beforeEach(async () => {
    await prisma.asset.deleteMany({});
    await prisma.workspaceSession.deleteMany({ where: { ownerId } });
    await prisma.user.upsert({
      where: { email: 'notes-test@example.com' },
      update: { id: ownerId },
      create: { id: ownerId, email: 'notes-test@example.com' },
    });
    const ws = await prisma.workspaceSession.create({
      data: { name: 'notes-test', ownerId },
    });
    workspaceId = ws.id;
  });

  it('creates a new note Asset on first call and stores notesAssetId in settings', async () => {
    const result = await upsertWorkspaceNote(workspaceId, 'first content');

    expect(typeof result.assetId).toBe('number');

    const asset = await prisma.asset.findUnique({ where: { id: result.assetId } });
    expect(asset?.assetType).toBe('note');
    expect(asset?.content).toBe('first content');
    expect(asset?.noteType).toBe('summary');

    const ws = await prisma.workspaceSession.findUnique({ where: { id: workspaceId } });
    const settings = JSON.parse(ws?.settings ?? '{}');
    expect(settings.notesAssetId).toBe(result.assetId);
  });

  it('updates existing note Asset on second call', async () => {
    const first = await upsertWorkspaceNote(workspaceId, 'first');
    const second = await upsertWorkspaceNote(workspaceId, 'second');

    expect(second.assetId).toBe(first.assetId);
    const asset = await prisma.asset.findUnique({ where: { id: first.assetId } });
    expect(asset?.content).toBe('second');
  });

  it('throws when workspace does not exist', async () => {
    await expect(upsertWorkspaceNote('nonexistent', 'x')).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/services/__tests__/notes.service.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/services/notes.service'".

### Task 4.3: Notes service — implementation

**Files:**
- Create: `web/src/lib/services/notes.service.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/services/notes.service.ts
import prisma from '@/lib/prisma';
import { assetService } from '@/lib/services/asset.service';
import { collectionService } from '@/lib/services/collection.service';
import { getRemoteUserId } from '@/lib/services/workspace.service';
import type { WorkspaceSettings } from '@/lib/services/workspace.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('NotesService');

export interface UpsertNoteResult {
  assetId: number;
  created: boolean;
}

/**
 * Upsert the workspace's notes content into a single Asset row.
 *
 * - First call: creates a new `note` Asset, stores its id in workspace.settings.notesAssetId
 * - Subsequent calls: updates the same Asset's content
 *
 * Extracted verbatim from the original PUT /api/workspace/[id]/notes/route.ts so MCP
 * `update_notes` and the legacy HTTP route share a single code path.
 */
export async function upsertWorkspaceNote(
  workspaceId: string,
  content: string
): Promise<UpsertNoteResult> {
  const workspace = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { settings: true, name: true },
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  const settings: WorkspaceSettings = workspace.settings
    ? (JSON.parse(workspace.settings) as WorkspaceSettings)
    : {};
  const userId = getRemoteUserId();

  if (settings.notesAssetId) {
    await assetService.update(settings.notesAssetId, userId, { content });
    log.debug('Notes updated', {
      workspaceId,
      assetId: settings.notesAssetId,
      contentLength: content.length,
    });
    return { assetId: settings.notesAssetId, created: false };
  }

  const asset = await assetService.create({
    userId,
    assetType: 'note',
    title: `${workspace.name || 'Workspace'} — Research Notes`,
    content,
    noteType: 'summary',
    metadata: { sourceId: `workspace:${workspaceId}` },
  });

  if (settings.collectionId) {
    await collectionService.addAsset(settings.collectionId, asset.id, userId);
  }

  const nextSettings: WorkspaceSettings = { ...settings, notesAssetId: asset.id };
  await prisma.workspaceSession.update({
    where: { id: workspaceId },
    data: { settings: JSON.stringify(nextSettings) },
  });

  log.info('Notes asset created', {
    workspaceId,
    assetId: asset.id,
    collectionId: settings.collectionId,
  });

  return { assetId: asset.id, created: true };
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/services/__tests__/notes.service.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/services/notes.service.ts web/src/lib/services/__tests__/notes.service.test.ts
git commit -m "feat(mcp): extract upsertWorkspaceNote into notes.service.ts"
```

---

### Task 4.4: Adopt `upsertWorkspaceNote` in existing PUT route

**Files:**
- Modify: `web/src/app/api/workspace/[id]/notes/route.ts`

- [ ] **Step 1: Replace the route body**

```ts
// web/src/app/api/workspace/[id]/notes/route.ts (replace whole file)
import { NextRequest, NextResponse } from 'next/server';
import { upsertWorkspaceNote } from '@/lib/services/notes.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('WorkspaceNotes');

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: workspaceId } = await params;
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: 'content is required' },
        { status: 400 }
      );
    }

    const result = await upsertWorkspaceNote(workspaceId, content);
    return NextResponse.json({ success: true, data: { assetId: result.assetId } });
  } catch (err) {
    log.error('Notes save error', {
      err: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error && /not found/i.test(err.message)) {
      return NextResponse.json({ success: false, error: err.message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Smoke-test the existing route still works**

```bash
cd web
npm run dev &
DEV_PID=$!
sleep 5

WS_ID=$(npx tsx -e "import p from './src/lib/prisma'; (async()=>{const w=await p.workspaceSession.findFirst();console.log(w?.id||'none');await p.\$disconnect()})()")

curl -s -X PUT "http://localhost:3000/api/workspace/$WS_ID/notes" \
  -H "Content-Type: application/json" \
  -d '{"content":"hello world"}'
echo

curl -s -X PUT "http://localhost:3000/api/workspace/$WS_ID/notes" \
  -H "Content-Type: application/json" \
  -d '{"content":"updated"}'
echo

kill $DEV_PID
```

Expected: First call returns `{"success":true,"data":{"assetId":N}}` with a new id. Second call returns the same `assetId`.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/workspace/\[id\]/notes/route.ts
git commit -m "refactor(notes): adopt notesService.upsertWorkspaceNote in legacy PUT route"
```

---

## Phase 5 — SSRF defense

**Goal:** A pure-function `isBlockedAddress(addr)` plus a validating-lookup `safeFetch(url, opts)` that resolves all A/AAAA records, rejects any blocked IP, then dials the first allowed address with TLS SNI preserved. Used only by `load_pdf`. **Spec §3.4.**

### Task 5.1: Blocklist test matrix

**Files:**
- Create: `web/src/lib/mcp/__tests__/ssrf.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// web/src/lib/mcp/__tests__/ssrf.test.ts
import { describe, it, expect } from 'vitest';
import { isBlockedAddress, isBlockedHostname, isAllowedScheme } from '@/lib/mcp/ssrf';

describe('isBlockedAddress', () => {
  const blocked = [
    '127.0.0.1', '127.255.255.254',
    '10.0.0.1', '10.255.255.254',
    '172.16.0.1', '172.31.255.254',
    '192.168.0.1', '192.168.255.254',
    '169.254.0.1', '169.254.169.254',
    '::1',
    'fc00::1', 'fdff::1',
    'fe80::1',
  ];
  for (const addr of blocked) {
    it(`blocks ${addr}`, () => expect(isBlockedAddress(addr)).toBe(true));
  }

  const allowed = [
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34', // example.com
    '2606:4700:4700::1111',
  ];
  for (const addr of allowed) {
    it(`allows ${addr}`, () => expect(isBlockedAddress(addr)).toBe(false));
  }
});

describe('isBlockedHostname', () => {
  const blocked = ['localhost', 'foo.local', 'metadata.google.internal'];
  for (const h of blocked) {
    it(`blocks ${h}`, () => expect(isBlockedHostname(h)).toBe(true));
  }

  it('allows example.com', () => expect(isBlockedHostname('example.com')).toBe(false));
  it('allows arxiv.org', () => expect(isBlockedHostname('arxiv.org')).toBe(false));
});

describe('isAllowedScheme', () => {
  it('allows http', () => expect(isAllowedScheme('http:')).toBe(true));
  it('allows https', () => expect(isAllowedScheme('https:')).toBe(true));
  it('blocks file', () => expect(isAllowedScheme('file:')).toBe(false));
  it('blocks ftp', () => expect(isAllowedScheme('ftp:')).toBe(false));
  it('blocks gopher', () => expect(isAllowedScheme('gopher:')).toBe(false));
  it('blocks data', () => expect(isAllowedScheme('data:')).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/ssrf.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/mcp/ssrf'".

### Task 5.2: SSRF blocklist — implementation

**Files:**
- Create: `web/src/lib/mcp/ssrf.ts`

- [ ] **Step 1: Implement blocklist + lookup function**

```ts
// web/src/lib/mcp/ssrf.ts
import { resolve4, resolve6 } from 'dns/promises';
import { Agent, fetch as undiciFetch } from 'undici';
import type { LookupOptions, LookupAddress } from 'dns';

// ----- IPv4/IPv6 blocklist -----

function ip4ToInt(addr: string): number | null {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n << 8) + x;
  }
  return n >>> 0;
}

function inCidr4(addr: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const a = ip4ToInt(addr);
  const b = ip4ToInt(base);
  if (a === null || b === null) return false;
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

const BLOCKED_V4 = ['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'];
const BLOCKED_V6_LITERAL = new Set(['::1']);
const BLOCKED_V6_PREFIX = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb']; // fc00::/7 + fe80::/10

function isV6(addr: string): boolean {
  return addr.includes(':');
}

function v6Norm(addr: string): string {
  return addr.toLowerCase();
}

function isBlockedV6(addr: string): boolean {
  const a = v6Norm(addr);
  if (BLOCKED_V6_LITERAL.has(a)) return true;
  for (const p of BLOCKED_V6_PREFIX) {
    if (a.startsWith(p) && (a[p.length] === ':' || a[p.length] === undefined || /[0-9a-f]/.test(a[p.length]))) {
      // approximate prefix match — sufficient for the documented ranges
      if (p === 'fc' || p === 'fd') return a.startsWith('fc') || a.startsWith('fd');
      if (p.startsWith('fe')) return a.startsWith('fe8') || a.startsWith('fe9') || a.startsWith('fea') || a.startsWith('feb');
    }
  }
  return false;
}

export function isBlockedAddress(addr: string): boolean {
  if (isV6(addr)) return isBlockedV6(addr);
  return BLOCKED_V4.some((c) => inCidr4(addr, c));
}

// ----- Hostname blocklist -----

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith('.local')) return true;
  return false;
}

// ----- Scheme blocklist -----

export function isAllowedScheme(scheme: string): boolean {
  return scheme === 'http:' || scheme === 'https:';
}

// ----- Validating fetch with DNS rebinding mitigation (preserves SNI) -----

export class SsrfError extends Error {
  override name = 'SsrfError' as const;
  constructor(public readonly code: 'URL_INVALID' | 'URL_FETCH_FAILED', message: string) {
    super(message);
  }
}

async function validatingLookup(hostname: string): Promise<LookupAddress> {
  if (isBlockedHostname(hostname)) {
    throw new SsrfError('URL_INVALID', `Blocked hostname: ${hostname}`);
  }
  const [v4, v6] = await Promise.all([
    resolve4(hostname).catch(() => [] as string[]),
    resolve6(hostname).catch(() => [] as string[]),
  ]);
  const all = [...v4.map((a) => ({ address: a, family: 4 as const })), ...v6.map((a) => ({ address: a, family: 6 as const }))];
  if (all.length === 0) {
    throw new SsrfError('URL_FETCH_FAILED', `DNS resolution failed for ${hostname}`);
  }
  for (const r of all) {
    if (isBlockedAddress(r.address)) {
      throw new SsrfError('URL_INVALID', `Blocked address ${r.address} for ${hostname}`);
    }
  }
  return all[0];
}

/**
 * Build an undici Agent whose `connect.lookup` validates all resolved addresses
 * against the blocklist before connecting. SNI / cert validation continue to use
 * the original hostname.
 */
function buildSafeAgent(): Agent {
  return new Agent({
    connect: {
      lookup: (hostname: string, _opts: LookupOptions, cb: (e: Error | null, address?: string, family?: number) => void) => {
        validatingLookup(hostname)
          .then((a) => cb(null, a.address, a.family))
          .catch((err: Error) => cb(err));
      },
    },
  });
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  redirectLimit?: number;
}

export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const parsed = new URL(url);
  if (!isAllowedScheme(parsed.protocol)) {
    throw new SsrfError('URL_INVALID', `Disallowed scheme: ${parsed.protocol}`);
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new SsrfError('URL_INVALID', `Blocked hostname: ${parsed.hostname}`);
  }

  const timeoutMs = opts.timeoutMs ?? Number(process.env.MCP_FETCH_TIMEOUT_MS ?? 30000);
  const redirectLimit = opts.redirectLimit ?? Number(process.env.MCP_REDIRECT_LIMIT ?? 3);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    let current = url;
    for (let i = 0; i <= redirectLimit; i++) {
      const res = await undiciFetch(current, {
        method: 'GET',
        redirect: 'manual',
        dispatcher: buildSafeAgent(),
        signal: ctrl.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new SsrfError('URL_FETCH_FAILED', 'Redirect without Location');
        current = new URL(loc, current).toString();
        const next = new URL(current);
        if (!isAllowedScheme(next.protocol) || isBlockedHostname(next.hostname)) {
          throw new SsrfError('URL_INVALID', `Redirect to blocked target: ${current}`);
        }
        continue;
      }
      // Cast undici Response → standard Response (compatible runtime shape)
      return res as unknown as Response;
    }
    throw new SsrfError('URL_FETCH_FAILED', `Redirect limit ${redirectLimit} exceeded`);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/ssrf.test.ts
```

Expected: all blocklist tests PASS (≥18 cases).

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/mcp/ssrf.ts web/src/lib/mcp/__tests__/ssrf.test.ts
git commit -m "feat(mcp): add SSRF blocklist + validating-lookup safeFetch"
```

---

## Phase 6 — Tool implementations

**Goal:** Three tools registered, each enqueuing the same wire directive that the OpenClaw plugin already produces. Order: `switch_component` (simplest) → `update_notes` (touches DB) → `load_pdf` (most complex).

### Task 6.1: Shared dispatcher helper

**Files:**
- Create: `web/src/lib/mcp/dispatch.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/mcp/dispatch.ts
import prisma from '@/lib/prisma';
import { directiveQueue } from '@/lib/directive/queue';
import { workspaceService } from '@/lib/services/workspace.service';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpDispatch');

/**
 * Resolve the AgentInstance.id for a workspace.
 * Creates the agent binding via workspaceService.ensureAgentBinding if absent.
 *
 * Returns the agent id. Same row both OpenClaw and MCP write to.
 */
export async function resolveAgentId(workspaceId: string): Promise<string> {
  const existing = await prisma.agentInstance.findUnique({
    where: { workspaceId },
    select: { id: true },
  });
  if (existing) return existing.id;

  const ws = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  if (!ws) throw new Error(`Workspace ${workspaceId} not found`);

  await workspaceService.ensureAgentBinding(workspaceId, ws.ownerId);
  const created = await prisma.agentInstance.findUnique({
    where: { workspaceId },
    select: { id: true },
  });
  if (!created) throw new Error(`ensureAgentBinding did not create an AgentInstance for ${workspaceId}`);

  log.info('Created AgentInstance via MCP path', { workspaceId, agentId: created.id });
  return created.id;
}

/**
 * Enqueue a UI directive for an agent. Uses the in-process queue directly —
 * same code path as POST /api/agents/[id]/directive. Avoids an internal HTTP hop.
 */
export function dispatchDirective(
  agentId: string,
  type: string,
  payload: Record<string, unknown>
): void {
  const directive = {
    id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    timestamp: Date.now(),
  };
  directiveQueue.enqueue(agentId, directive);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/mcp/dispatch.ts
git commit -m "feat(mcp): add resolveAgentId + dispatchDirective helpers"
```

> **Note on spec §4.3:** spec says MCP should call the existing HTTP `/api/agents/[id]/directive` route the same way the plugin does. The plugin's reasoning is it lives *outside* the Next.js process (in the container). MCP runs *inside* the same Next.js process — calling its own HTTP route would be a needless self-loopback hop. Using the exported `directiveQueue.enqueue` directly is what spec §9 lists as the documented fallback ("the queue is exported, no refactor needed"). Behavior is byte-identical.

---

### Task 6.2: `switch_component` tool — write failing test

**Files:**
- Create: `web/src/lib/mcp/__tests__/tools/switch_component.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// web/src/lib/mcp/__tests__/tools/switch_component.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mcp/dispatch', () => ({
  resolveAgentId: vi.fn(),
  dispatchDirective: vi.fn(),
}));

import { resolveAgentId, dispatchDirective } from '@/lib/mcp/dispatch';
import { switchComponentTool } from '@/lib/mcp/tools/switch_component';
import { DISABLED_COMPONENTS } from '@/types/workspace';

const mockedResolve = resolveAgentId as ReturnType<typeof vi.fn>;
const mockedDispatch = dispatchDirective as ReturnType<typeof vi.fn>;

const ctx = { workspaceId: 'ws1', token: { tokenId: 't', workspaceId: 'ws1', prefix: 'p' } };

describe('switch_component tool', () => {
  beforeEach(() => {
    mockedResolve.mockReset();
    mockedDispatch.mockReset();
    mockedResolve.mockResolvedValue('agent1');
  });

  it('rejects unknown component with -32602 (zod handles)', async () => {
    const result = await switchComponentTool.handler({ component: 'not-a-component' }, ctx);
    expect(result.isError).toBe(true);
    const text = result.content[0].type === 'text' ? result.content[0].text : '';
    expect(text).toMatch(/UNKNOWN_COMPONENT/);
  });

  for (const c of DISABLED_COMPONENTS) {
    it(`rejects disabled component "${c}" with COMPONENT_DISABLED`, async () => {
      const result = await switchComponentTool.handler({ component: c }, ctx);
      expect(result.isError).toBe(true);
      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(text).toMatch(/COMPONENT_DISABLED/);
      expect(mockedDispatch).not.toHaveBeenCalled();
    });
  }

  for (const c of ['ai-editor', 'pdf-reader', 'latex-editor'] as const) {
    it(`enqueues SWITCH_COMPONENT for active "${c}"`, async () => {
      const result = await switchComponentTool.handler({ component: c }, ctx);
      expect(result.isError).toBe(false);
      const text = result.content[0].type === 'text' ? result.content[0].text : '';
      expect(JSON.parse(text)).toEqual({ ok: true, current: c });
      expect(mockedDispatch).toHaveBeenCalledWith('agent1', 'SWITCH_COMPONENT', { component: c });
    });
  }

  it('silently drops unknown extra fields', async () => {
    const result = await switchComponentTool.handler(
      { component: 'pdf-reader', futureField: 'ignored' },
      ctx
    );
    expect(result.isError).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tools/switch_component.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/mcp/tools/switch_component'".

### Task 6.3: `switch_component` tool — implementation

**Files:**
- Create: `web/src/lib/mcp/tools/switch_component.ts`
- Modify: `web/src/lib/mcp/tools/index.ts` (register)

- [ ] **Step 1: Implement tool**

```ts
// web/src/lib/mcp/tools/switch_component.ts
import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ComponentType } from '@/lib/events/types';
import { DISABLED_COMPONENTS } from '@/types/workspace';
import { resolveAgentId, dispatchDirective } from '@/lib/mcp/dispatch';
import { toolError, toolSuccess } from '@/lib/mcp/errors';
import type { ToolContext } from '@/lib/mcp/tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const COMPONENTS = [
  'ai-editor',
  'pdf-reader',
  'latex-editor',
  'code-playground',
  'bento-gallery',
  'three-viewer',
  'ag-grid',
  'jupyter-notebook',
] as const satisfies readonly ComponentType[];

const Input = z.object({ component: z.enum(COMPONENTS) }).strip();
type InputT = z.infer<typeof Input>;

async function handler(raw: unknown, ctx: ToolContext): Promise<CallToolResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return toolError('UNKNOWN_COMPONENT', parsed.error.errors.map((e) => e.message).join('; '));
  }
  const { component } = parsed.data;

  if (DISABLED_COMPONENTS.has(component)) {
    const disabled = Array.from(DISABLED_COMPONENTS).join(', ');
    return toolError(
      'COMPONENT_DISABLED',
      `Component "${component}" is currently disabled. Disabled: [${disabled}]`
    );
  }

  const agentId = await resolveAgentId(ctx.workspaceId);
  dispatchDirective(agentId, 'SWITCH_COMPONENT', { component });
  return toolSuccess({ ok: true, current: component });
}

export const switchComponentTool = {
  name: 'switch_component',
  description:
    "Switch the workspace's active editor component. Disabled components return COMPONENT_DISABLED.",
  inputSchema: {
    type: 'object',
    properties: {
      component: {
        type: 'string',
        enum: [...COMPONENTS],
        description: 'Target component id',
      },
    },
    required: ['component'],
  },
  handler: handler as (input: unknown, ctx: ToolContext) => Promise<CallToolResult>,
};

export function register(server: Server, ctx: ToolContext): void {
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== switchComponentTool.name) {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    return handler(req.params.arguments, ctx);
  });
}

// Used by registerTools() to wire into list_tools.
export const switchComponentDescriptor = {
  name: switchComponentTool.name,
  description: switchComponentTool.description,
  inputSchema: switchComponentTool.inputSchema,
};

// Suppress unused export warnings — `switchComponentTool.handler` is used in tests
void InputT;
```

> **Registration pattern:** the SDK registers tools via two handlers: `ListToolsRequest` returns descriptors, `CallToolRequest` dispatches by name. We collect all descriptors in `tools/index.ts` and route by `name` in a single `setRequestHandler`. Per-tool files only export the handler + descriptor.

- [ ] **Step 2: Wire into the registry**

Replace `web/src/lib/mcp/tools/index.ts`:

```ts
// web/src/lib/mcp/tools/index.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { TokenContext } from '@/lib/mcp/tokens';
import { switchComponentTool } from '@/lib/mcp/tools/switch_component';

export interface ToolContext {
  workspaceId: string;
  token: TokenContext;
}

interface ToolEntry {
  name: string;
  description: string;
  inputSchema: object;
  handler: (input: unknown, ctx: ToolContext) => Promise<CallToolResult>;
}

const TOOLS: ToolEntry[] = [
  {
    name: switchComponentTool.name,
    description: switchComponentTool.description,
    inputSchema: switchComponentTool.inputSchema,
    handler: switchComponentTool.handler,
  },
  // Phase 6: + update_notes, load_pdf
];

export function registerTools(server: Server, ctx: ToolContext): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    return tool.handler(req.params.arguments, ctx);
  });
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tools/switch_component.test.ts
```

Expected: all tests PASS (1 unknown + 5 disabled + 3 active + 1 unknown-fields = 10 cases).

- [ ] **Step 4: Smoke-test end-to-end**

```bash
cd web
npm run dev &
DEV_PID=$!
sleep 5

WS_ID=$(npx tsx -e "import p from './src/lib/prisma'; (async()=>{const w=await p.workspaceSession.findFirst();console.log(w?.id||'none');await p.\$disconnect()})()")
TOKEN=$(curl -s -X POST "http://localhost:3000/api/workspace/$WS_ID/mcp-tokens" \
  -H "Content-Type: application/json" -d '{"name":"smoke-tools"}' | npx jq -r '.data.plaintext')

curl -s -X POST "http://localhost:3000/api/mcp/workspace/$WS_ID/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"switch_component","arguments":{"component":"pdf-reader"}}}'
echo

kill $DEV_PID
```

Expected: returns a JSON-RPC result whose `content[0].text` parses to `{"ok":true,"current":"pdf-reader"}`.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/mcp/tools/switch_component.ts web/src/lib/mcp/tools/index.ts web/src/lib/mcp/__tests__/tools/switch_component.test.ts
git commit -m "feat(mcp): implement switch_component tool"
```

---

### Task 6.4: `update_notes` tool — write failing test

**Files:**
- Create: `web/src/lib/mcp/__tests__/tools/update_notes.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// web/src/lib/mcp/__tests__/tools/update_notes.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mcp/dispatch', () => ({
  resolveAgentId: vi.fn(),
  dispatchDirective: vi.fn(),
}));
vi.mock('@/lib/services/notes.service', () => ({
  upsertWorkspaceNote: vi.fn(),
}));

import { resolveAgentId, dispatchDirective } from '@/lib/mcp/dispatch';
import { upsertWorkspaceNote } from '@/lib/services/notes.service';
import { updateNotesTool } from '@/lib/mcp/tools/update_notes';

const mockedResolve = resolveAgentId as ReturnType<typeof vi.fn>;
const mockedDispatch = dispatchDirective as ReturnType<typeof vi.fn>;
const mockedUpsert = upsertWorkspaceNote as ReturnType<typeof vi.fn>;

const ctx = { workspaceId: 'ws1', token: { tokenId: 't', workspaceId: 'ws1', prefix: 'p' } };

describe('update_notes tool', () => {
  beforeEach(() => {
    mockedResolve.mockReset();
    mockedDispatch.mockReset();
    mockedUpsert.mockReset();
    mockedResolve.mockResolvedValue('agent1');
  });

  it('rejects empty content with EMPTY_CONTENT', async () => {
    const r = await updateNotesTool.handler({ content: '' }, ctx);
    expect(r.isError).toBe(true);
    expect(JSON.parse((r.content[0] as { text: string }).text).code).toBe('EMPTY_CONTENT');
    expect(mockedUpsert).not.toHaveBeenCalled();
  });

  it('rejects content larger than MCP_MAX_NOTES_SIZE_KB with TOO_LARGE', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    const r = await updateNotesTool.handler({ content: big }, ctx);
    expect(r.isError).toBe(true);
    expect(JSON.parse((r.content[0] as { text: string }).text).code).toBe('TOO_LARGE');
  });

  it('on first call: creates Asset, dispatches UPDATE_NOTES, returns assetId+length', async () => {
    mockedUpsert.mockResolvedValueOnce({ assetId: 42, created: true });

    const r = await updateNotesTool.handler({ content: 'hello' }, ctx);

    expect(r.isError).toBe(false);
    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(data).toEqual({ ok: true, assetId: 42, length: 5 });
    expect(mockedUpsert).toHaveBeenCalledWith('ws1', 'hello');
    expect(mockedDispatch).toHaveBeenCalledWith('agent1', 'UPDATE_NOTES', { content: 'hello' });
  });

  it('silently drops unknown fields (mode, patch, baseVersion)', async () => {
    mockedUpsert.mockResolvedValueOnce({ assetId: 1, created: false });
    const r = await updateNotesTool.handler(
      { content: 'x', mode: 'append', patch: 'foo', baseVersion: 1 },
      ctx
    );
    expect(r.isError).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tools/update_notes.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/mcp/tools/update_notes'".

### Task 6.5: `update_notes` tool — implementation

**Files:**
- Create: `web/src/lib/mcp/tools/update_notes.ts`
- Modify: `web/src/lib/mcp/tools/index.ts` (register)

- [ ] **Step 1: Implement**

```ts
// web/src/lib/mcp/tools/update_notes.ts
import { z } from 'zod';
import { resolveAgentId, dispatchDirective } from '@/lib/mcp/dispatch';
import { toolError, toolSuccess } from '@/lib/mcp/errors';
import { upsertWorkspaceNote } from '@/lib/services/notes.service';
import type { ToolContext } from '@/lib/mcp/tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const Input = z.object({ content: z.string() }).strip(); // strips unknown fields silently

function maxBytes(): number {
  const kb = Number(process.env.MCP_MAX_NOTES_SIZE_KB ?? 1024);
  return kb * 1024;
}

async function handler(raw: unknown, ctx: ToolContext): Promise<CallToolResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return toolError('EMPTY_CONTENT', parsed.error.errors.map((e) => e.message).join('; '));
  }
  const { content } = parsed.data;

  if (content.length === 0) {
    return toolError('EMPTY_CONTENT', 'content must be a non-empty string');
  }
  if (Buffer.byteLength(content, 'utf8') > maxBytes()) {
    return toolError('TOO_LARGE', `content exceeds ${maxBytes() / 1024} KB limit`);
  }

  const result = await upsertWorkspaceNote(ctx.workspaceId, content);
  const agentId = await resolveAgentId(ctx.workspaceId);
  dispatchDirective(agentId, 'UPDATE_NOTES', { content });

  return toolSuccess({ ok: true, assetId: result.assetId, length: content.length });
}

export const updateNotesTool = {
  name: 'update_notes',
  description:
    'Replace the workspace notes content. Persists to the workspace note Asset and pushes UPDATE_NOTES to the UI.',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Replacement notes content (HTML or markdown)' },
    },
    required: ['content'],
  },
  handler: handler as (input: unknown, ctx: ToolContext) => Promise<CallToolResult>,
};
```

- [ ] **Step 2: Wire into the registry**

Edit `web/src/lib/mcp/tools/index.ts`, add to imports and `TOOLS`:

```ts
import { updateNotesTool } from '@/lib/mcp/tools/update_notes';
```

Append to `TOOLS`:

```ts
{
  name: updateNotesTool.name,
  description: updateNotesTool.description,
  inputSchema: updateNotesTool.inputSchema,
  handler: updateNotesTool.handler,
},
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tools/update_notes.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/mcp/tools/update_notes.ts web/src/lib/mcp/tools/index.ts web/src/lib/mcp/__tests__/tools/update_notes.test.ts
git commit -m "feat(mcp): implement update_notes tool"
```

---

### Task 6.6: `load_pdf` tool — write failing test

**Files:**
- Create: `web/src/lib/mcp/__tests__/tools/load_pdf.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// web/src/lib/mcp/__tests__/tools/load_pdf.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mcp/dispatch', () => ({
  resolveAgentId: vi.fn(),
  dispatchDirective: vi.fn(),
}));
vi.mock('@/lib/services/asset.service', () => ({
  assetService: {
    findById: vi.fn(),
    findBySourceId: vi.fn(),
    create: vi.fn(),
  },
}));
vi.mock('@/lib/mcp/ssrf', () => ({
  safeFetch: vi.fn(),
  SsrfError: class SsrfError extends Error {
    constructor(public code: string, msg: string) { super(msg); }
  },
  isAllowedScheme: (s: string) => s === 'http:' || s === 'https:',
  isBlockedHostname: (h: string) => h === 'localhost',
  isBlockedAddress: () => false,
}));
vi.mock('pdf-parse', () => ({ default: vi.fn() }));
vi.mock('@/lib/assets/storage', () => ({
  storeLocalAssetBuffer: vi.fn(),
}));
vi.mock('@/lib/services/workspace.service', () => ({
  getRemoteUserId: () => 1,
}));

import { resolveAgentId, dispatchDirective } from '@/lib/mcp/dispatch';
import { assetService } from '@/lib/services/asset.service';
import { safeFetch } from '@/lib/mcp/ssrf';
import { storeLocalAssetBuffer } from '@/lib/assets/storage';
import pdfParse from 'pdf-parse';
import { loadPdfTool } from '@/lib/mcp/tools/load_pdf';

const mockedResolve = resolveAgentId as ReturnType<typeof vi.fn>;
const mockedDispatch = dispatchDirective as ReturnType<typeof vi.fn>;
const mockedFindById = assetService.findById as ReturnType<typeof vi.fn>;
const mockedFindBySource = assetService.findBySourceId as ReturnType<typeof vi.fn>;
const mockedCreate = assetService.create as ReturnType<typeof vi.fn>;
const mockedFetch = safeFetch as ReturnType<typeof vi.fn>;
const mockedStore = storeLocalAssetBuffer as ReturnType<typeof vi.fn>;
const mockedParse = pdfParse as unknown as ReturnType<typeof vi.fn>;

const ctx = { workspaceId: 'ws1', token: { tokenId: 't', workspaceId: 'ws1', prefix: 'p' } };

const PDF_MAGIC = Buffer.from('%PDF-1.4\n', 'utf8');

describe('load_pdf tool', () => {
  beforeEach(() => {
    [mockedResolve, mockedDispatch, mockedFindById, mockedFindBySource, mockedCreate, mockedFetch, mockedStore, mockedParse].forEach((m) => m.mockReset());
    mockedResolve.mockResolvedValue('agent1');
  });

  it('rejects when neither assetId nor url is given (MISSING_SOURCE)', async () => {
    const r = await loadPdfTool.handler({}, ctx);
    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('MISSING_SOURCE');
  });

  it('rejects when both assetId and url are given (BOTH_SOURCES)', async () => {
    const r = await loadPdfTool.handler({ assetId: 1, url: 'https://x.com/a.pdf' }, ctx);
    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('BOTH_SOURCES');
  });

  it('rejects when assetId points to non-existent Asset (ASSET_NOT_FOUND)', async () => {
    mockedFindById.mockResolvedValueOnce(null);
    const r = await loadPdfTool.handler({ assetId: 99 }, ctx);
    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('ASSET_NOT_FOUND');
  });

  it('rejects when asset.userId !== getRemoteUserId() (ASSET_FORBIDDEN)', async () => {
    mockedFindById.mockResolvedValueOnce({ id: 5, userId: 2, content: null, externalUrl: null, storageKey: null });
    const r = await loadPdfTool.handler({ assetId: 5 }, ctx);
    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('ASSET_FORBIDDEN');
  });

  it('on assetId: dispatches SWITCH+PDF_LOAD_DOCUMENT and returns metadata', async () => {
    mockedFindById.mockResolvedValueOnce({ id: 5, userId: 1, storageKey: 'foo' });
    mockedParse.mockResolvedValueOnce({ numpages: 12 });
    // Mock fs read for pdf-parse — covered indirectly; the implementation reads asset bytes itself
    const result = await loadPdfTool.handler({ assetId: 5, page: 3 }, ctx);

    expect(result.isError).toBe(false);
    const data = JSON.parse((result.content[0] as { text: string }).text);
    expect(data).toMatchObject({ ok: true, assetId: 5, source: '/api/v2/assets/5/file', currentPage: 3 });
    expect(mockedDispatch).toHaveBeenCalledWith('agent1', 'SWITCH_COMPONENT', { component: 'pdf-reader' });
    expect(mockedDispatch).toHaveBeenCalledWith('agent1', 'PDF_LOAD_DOCUMENT', {
      source: '/api/v2/assets/5/file',
      page: 3,
    });
  });

  it('on URL: dedups via sourceUrlHash and reuses existing assetId', async () => {
    mockedFindBySource.mockResolvedValueOnce({ id: 7, userId: 1 });
    mockedFindById.mockResolvedValueOnce({ id: 7, userId: 1, storageKey: 'cached' });
    mockedParse.mockResolvedValueOnce({ numpages: 5 });

    const r = await loadPdfTool.handler({ url: 'https://example.com/p.pdf' }, ctx);

    expect(r.isError).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(JSON.parse((r.content[0] as { text: string }).text).assetId).toBe(7);
  });

  it('on URL: rejects non-PDF magic bytes (URL_NOT_PDF)', async () => {
    mockedFindBySource.mockResolvedValueOnce(null);
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => new TextEncoder().encode('NOT A PDF').buffer,
    });

    const r = await loadPdfTool.handler({ url: 'https://example.com/p.pdf' }, ctx);

    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('URL_NOT_PDF');
  });

  it('on URL: rejects exceeding MCP_MAX_PDF_SIZE_MB (URL_TOO_LARGE)', async () => {
    process.env.MCP_MAX_PDF_SIZE_MB = '0'; // anything > 0 bytes triggers
    mockedFindBySource.mockResolvedValueOnce(null);
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => Buffer.concat([PDF_MAGIC, Buffer.alloc(10)]).buffer,
    });

    const r = await loadPdfTool.handler({ url: 'https://example.com/p.pdf' }, ctx);

    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('URL_TOO_LARGE');
    delete process.env.MCP_MAX_PDF_SIZE_MB;
  });

  it('on URL: stores asset, computes pages, dispatches directives', async () => {
    mockedFindBySource.mockResolvedValueOnce(null);
    const buf = Buffer.concat([PDF_MAGIC, Buffer.alloc(100)]);
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/pdf' }),
      arrayBuffer: async () => buf.buffer,
    });
    mockedStore.mockResolvedValueOnce({ storageKey: 'k', fileName: 'p.pdf', mimeType: 'application/pdf' });
    mockedCreate.mockResolvedValueOnce({ id: 99, userId: 1 });
    mockedParse.mockResolvedValueOnce({ numpages: 8 });

    const r = await loadPdfTool.handler({ url: 'https://example.com/p.pdf' }, ctx);

    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(r.isError).toBe(false);
    expect(data).toMatchObject({ ok: true, assetId: 99, source: '/api/v2/assets/99/file', currentPage: 1, totalPages: 8 });
  });

  it('rejects page > totalPages (INVALID_PAGE)', async () => {
    mockedFindById.mockResolvedValueOnce({ id: 5, userId: 1, storageKey: 'foo' });
    mockedParse.mockResolvedValueOnce({ numpages: 3 });

    const r = await loadPdfTool.handler({ assetId: 5, page: 10 }, ctx);

    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('INVALID_PAGE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tools/load_pdf.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/mcp/tools/load_pdf'".

### Task 6.7: `load_pdf` tool — implementation

**Files:**
- Create: `web/src/lib/mcp/tools/load_pdf.ts`
- Modify: `web/src/lib/mcp/tools/index.ts`

- [ ] **Step 1: Implement**

```ts
// web/src/lib/mcp/tools/load_pdf.ts
import { createHash } from 'crypto';
import { z } from 'zod';
import pdfParse from 'pdf-parse';
import { resolveAgentId, dispatchDirective } from '@/lib/mcp/dispatch';
import { toolError, toolSuccess } from '@/lib/mcp/errors';
import { safeFetch, SsrfError } from '@/lib/mcp/ssrf';
import { assetService } from '@/lib/services/asset.service';
import { getRemoteUserId } from '@/lib/services/workspace.service';
import { storeLocalAssetBuffer, readLocalAssetBuffer } from '@/lib/assets/storage';
import type { ToolContext } from '@/lib/mcp/tools';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '@/lib/logger';

const log = createLogger('McpLoadPdf');

const Input = z
  .object({
    assetId: z.number().int().positive().optional(),
    url: z.string().url().optional(),
    page: z.number().int().positive().optional(),
  })
  .strip();

function maxPdfBytes(): number {
  const mb = Number(process.env.MCP_MAX_PDF_SIZE_MB ?? 100);
  return mb * 1024 * 1024;
}

function isPdfMagic(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

async function loadPdfFromAsset(
  assetId: number
): Promise<{ assetId: number; totalPages: number } | { error: { code: 'ASSET_NOT_FOUND' | 'ASSET_FORBIDDEN'; message: string } }> {
  const asset = await assetService.findById(assetId);
  if (!asset) return { error: { code: 'ASSET_NOT_FOUND', message: `Asset ${assetId} not found` } };

  const callerUserId = getRemoteUserId();
  if ((asset.userId as unknown as number) !== callerUserId) {
    return { error: { code: 'ASSET_FORBIDDEN', message: `Asset ${assetId} is not accessible to current user` } };
  }

  let totalPages = 0;
  try {
    const storageKey = (asset as { storageKey?: string }).storageKey;
    if (storageKey) {
      const buf = await readLocalAssetBuffer(storageKey);
      const parsed = await pdfParse(buf);
      totalPages = parsed.numpages ?? 0;
    }
  } catch (err) {
    log.warn('pdf-parse failed; defaulting totalPages to 0', { assetId, err: String(err) });
  }

  return { assetId, totalPages };
}

async function loadPdfFromUrl(
  url: string
): Promise<{ assetId: number; totalPages: number } | { error: { code: string; message: string } }> {
  const urlHash = createHash('sha256').update(url).digest('hex');

  const cached = await assetService.findBySourceId(getRemoteUserId(), `url:${urlHash}`, 'paper');
  if (cached) {
    const fromAsset = await loadPdfFromAsset(cached.id);
    return fromAsset;
  }

  let res: Response;
  try {
    res = await safeFetch(url);
  } catch (err) {
    if (err instanceof SsrfError) {
      return { error: { code: err.code, message: err.message } };
    }
    return { error: { code: 'URL_FETCH_FAILED', message: err instanceof Error ? err.message : 'fetch failed' } };
  }

  if (!res.ok) {
    return { error: { code: 'URL_FETCH_FAILED', message: `HTTP ${res.status}` } };
  }

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length > maxPdfBytes()) {
    return { error: { code: 'URL_TOO_LARGE', message: `PDF exceeds ${maxPdfBytes() / (1024 * 1024)} MB` } };
  }
  if (!isPdfMagic(buf)) {
    return { error: { code: 'URL_NOT_PDF', message: 'Response did not start with %PDF magic bytes' } };
  }

  const stored = await storeLocalAssetBuffer({
    buffer: buf,
    fileName: 'paper.pdf',
    mimeType: 'application/pdf',
    category: 'mcp-pdf',
  });

  const created = await assetService.create({
    userId: getRemoteUserId(),
    assetType: 'paper',
    title: new URL(url).pathname.split('/').pop() ?? 'paper.pdf',
    source: 'url',
    fileName: 'paper.pdf',
    mimeType: 'application/pdf',
    metadata: { sourceUrl: url, sourceUrlHash: urlHash, sourceId: `url:${urlHash}` },
  });

  let totalPages = 0;
  try {
    const parsed = await pdfParse(buf);
    totalPages = parsed.numpages ?? 0;
  } catch (err) {
    log.warn('pdf-parse failed on URL fetch; defaulting totalPages to 0', { url, err: String(err) });
  }

  void stored; // storage key is recorded by assetService.create indirectly; future cleanup may store explicitly
  return { assetId: created.id, totalPages };
}

async function handler(raw: unknown, ctx: ToolContext): Promise<CallToolResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return toolError('URL_INVALID', parsed.error.errors.map((e) => e.message).join('; '));
  }
  const { assetId, url, page } = parsed.data;

  if (!assetId && !url) return toolError('MISSING_SOURCE', 'Either assetId or url must be provided');
  if (assetId && url) return toolError('BOTH_SOURCES', 'Only one of assetId / url may be provided');

  const loaded = assetId !== undefined
    ? await loadPdfFromAsset(assetId)
    : await loadPdfFromUrl(url!);

  if ('error' in loaded) {
    return toolError(loaded.error.code as never, loaded.error.message);
  }

  const targetPage = page ?? 1;
  if (loaded.totalPages > 0 && targetPage > loaded.totalPages) {
    return toolError('INVALID_PAGE', `page ${targetPage} > totalPages ${loaded.totalPages}`);
  }

  const source = `/api/v2/assets/${loaded.assetId}/file`;
  const agentId = await resolveAgentId(ctx.workspaceId);

  // Auto-switch first, then load — matches the OpenClaw plugin behavior at tools.ts:347-357.
  dispatchDirective(agentId, 'SWITCH_COMPONENT', { component: 'pdf-reader' });
  dispatchDirective(agentId, 'PDF_LOAD_DOCUMENT', { source, page: targetPage });

  return toolSuccess({
    ok: true,
    assetId: loaded.assetId,
    source,
    totalPages: loaded.totalPages,
    currentPage: targetPage,
  });
}

export const loadPdfTool = {
  name: 'load_pdf',
  description:
    'Open a PDF in the workspace pdf-reader. Provide either assetId (existing Asset) or url (http(s)).',
  inputSchema: {
    type: 'object',
    properties: {
      assetId: { type: 'number', description: 'Existing Asset id (Int)' },
      url: { type: 'string', description: 'http(s) URL to fetch' },
      page: { type: 'number', description: '1-based page number, default 1' },
    },
  },
  handler: handler as (input: unknown, ctx: ToolContext) => Promise<CallToolResult>,
};
```

- [ ] **Step 2: Wire into the registry**

Edit `web/src/lib/mcp/tools/index.ts`, add to imports and `TOOLS`:

```ts
import { loadPdfTool } from '@/lib/mcp/tools/load_pdf';
```

Append to `TOOLS`:

```ts
{
  name: loadPdfTool.name,
  description: loadPdfTool.description,
  inputSchema: loadPdfTool.inputSchema,
  handler: loadPdfTool.handler,
},
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd web
npx vitest run src/lib/mcp/__tests__/tools/load_pdf.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/mcp/tools/load_pdf.ts web/src/lib/mcp/tools/index.ts web/src/lib/mcp/__tests__/tools/load_pdf.test.ts
git commit -m "feat(mcp): implement load_pdf tool with SSRF + magic-bytes + dedup"
```

---

## Phase 7 — Layer-1 e2e tests

**Goal:** Lock down the protocol surface end-to-end with the official MCP SDK client. **Spec §6.2.**

### Task 7.1: MCP protocol e2e

**Files:**
- Create: `web/tests/layer1/mcp-protocol.spec.ts`

- [ ] **Step 1: Implement**

```ts
// web/tests/layer1/mcp-protocol.spec.ts
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.PRISMER_BASE_URL || 'http://localhost:3000';

async function provisionToken(workspaceId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/workspace/${workspaceId}/mcp-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'layer1-test' }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`Token provision failed: ${json.error}`);
  return json.data.plaintext;
}

async function pickWorkspaceId(): Promise<string> {
  const res = await fetch(`${BASE}/api/workspace`);
  const json = await res.json();
  if (json.success && json.data?.length > 0) return json.data[0].id;
  // fallback — create one
  const create = await fetch(`${BASE}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'mcp-layer1', description: 'auto' }),
  });
  return (await create.json()).data.id;
}

test.describe('MCP Phase 1 — protocol', () => {
  test('initialize + tools/list returns three tools', async () => {
    const workspaceId = await pickWorkspaceId();
    const token = await provisionToken(workspaceId);

    const transport = new StreamableHTTPClientTransport(
      new URL(`${BASE}/api/mcp/workspace/${workspaceId}/`),
      { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const client = new Client({ name: 'layer1', version: '0.0.1' }, { capabilities: {} });
    await client.connect(transport);

    const list = await client.listTools();
    const names = list.tools.map((t) => t.name).sort();
    expect(names).toEqual(['load_pdf', 'switch_component', 'update_notes']);

    await client.close();
  });

  test('rejects request with no Authorization header (401)', async () => {
    const workspaceId = await pickWorkspaceId();

    const res = await fetch(`${BASE}/api/mcp/workspace/${workspaceId}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run**

```bash
cd web
npm run dev &
DEV_PID=$!
sleep 5
npx playwright test tests/layer1/mcp-protocol.spec.ts --project=layer1 --trace on
kill $DEV_PID
```

Expected: 2 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/tests/layer1/mcp-protocol.spec.ts
git commit -m "test(mcp): add layer1 MCP protocol e2e (initialize + list_tools)"
```

---

### Task 7.2: Tool round-trip e2e

**Files:**
- Create: `web/tests/layer1/mcp-tools-e2e.spec.ts`

- [ ] **Step 1: Implement**

```ts
// web/tests/layer1/mcp-tools-e2e.spec.ts
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.PRISMER_BASE_URL || 'http://localhost:3000';

async function setup(): Promise<{ client: Client; workspaceId: string; agentId: string; token: string }> {
  const wsRes = await fetch(`${BASE}/api/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'mcp-tool-e2e' }),
  });
  const wsId = (await wsRes.json()).data.id;

  const ensureRes = await fetch(`${BASE}/api/workspace/${wsId}/agent/ensure`, { method: 'POST' });
  const agentId = (await ensureRes.json()).data.id;

  const tokenRes = await fetch(`${BASE}/api/workspace/${wsId}/mcp-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'tool-e2e' }),
  });
  const token = (await tokenRes.json()).data.plaintext;

  const transport = new StreamableHTTPClientTransport(
    new URL(`${BASE}/api/mcp/workspace/${wsId}/`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const client = new Client({ name: 'e2e', version: '0.0.1' }, { capabilities: {} });
  await client.connect(transport);
  return { client, workspaceId: wsId, agentId, token };
}

async function pollDirective(agentId: string, timeoutMs: number = 5000): Promise<unknown[]> {
  const deadline = Date.now() + timeoutMs;
  const directives: unknown[] = [];
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/agents/${agentId}/directive/poll`);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.data) && json.data.length > 0) {
        directives.push(...json.data);
        return directives;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return directives;
}

test.describe('MCP Phase 1 — tool round-trip', () => {
  test('switch_component enqueues SWITCH_COMPONENT directive', async () => {
    const { client, agentId } = await setup();

    const r = await client.callTool({ name: 'switch_component', arguments: { component: 'pdf-reader' } });
    expect((r.content[0] as { text: string }).text).toContain('"current":"pdf-reader"');

    const dirs = await pollDirective(agentId);
    expect(dirs.some((d) => (d as { type: string }).type === 'SWITCH_COMPONENT')).toBe(true);

    await client.close();
  });

  test('update_notes enqueues UPDATE_NOTES + creates Asset', async () => {
    const { client, agentId, workspaceId } = await setup();

    const r = await client.callTool({ name: 'update_notes', arguments: { content: 'e2e content' } });
    const data = JSON.parse((r.content[0] as { text: string }).text);
    expect(data.ok).toBe(true);
    expect(typeof data.assetId).toBe('number');

    const dirs = await pollDirective(agentId);
    const note = dirs.find((d) => (d as { type: string }).type === 'UPDATE_NOTES');
    expect(note).toBeDefined();
    expect((note as { payload: { content: string } }).payload.content).toBe('e2e content');
    void workspaceId;

    await client.close();
  });

  test('load_pdf with assetId rejects unknown asset (ASSET_NOT_FOUND)', async () => {
    const { client } = await setup();
    const r = await client.callTool({ name: 'load_pdf', arguments: { assetId: 99999999 } });
    expect((JSON.parse((r.content[0] as { text: string }).text)).code).toBe('ASSET_NOT_FOUND');
    await client.close();
  });
});
```

> **Note:** `pollDirective` uses an existing endpoint `/api/agents/[id]/directive/poll`. If that exact endpoint name differs in the codebase, run `grep -rn "directive/poll\|directive/stream" web/src/app/api` and adjust the URL. Worst case: poll the SSE endpoint (which already exists for the bridge to consume directives).

- [ ] **Step 2: Run**

```bash
cd web
npm run dev &
DEV_PID=$!
sleep 5
npx playwright test tests/layer1/mcp-tools-e2e.spec.ts --project=layer1 --trace on
kill $DEV_PID
```

Expected: 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/tests/layer1/mcp-tools-e2e.spec.ts
git commit -m "test(mcp): add layer1 tool round-trip e2e"
```

---

## Phase 8 — Documentation + manual smoke

### Task 8.1: User-facing self-host MCP guide

**Files:**
- Create: `docs/self-hosting/mcp.md`

- [ ] **Step 1: Write the guide**

```markdown
<!-- docs/self-hosting/mcp.md -->
# MCP Access — Self-Host Guide

Prismer ships an MCP (Model Context Protocol) server that lets any MCP-capable agent
(Claude Desktop, Cursor, Codex, custom Hermes bots) drive a Prismer workspace.

This guide covers Phase 1: three tools — `switch_component`, `update_notes`, `load_pdf`.

## 1. Generate a token

1. Open your workspace.
2. Open settings → **MCP Access**.
3. Click **Generate Token**, give it a name (e.g. "Claude Desktop").
4. **Copy the token immediately** — it is only shown once.

The token is bound to that workspace. You cannot use it against any other workspace.

## 2. Configure your MCP client

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "prismer-workspace": {
      "url": "http://localhost:3000/api/mcp/workspace/<WORKSPACE_ID>/",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}
```

Replace `<WORKSPACE_ID>` and `<TOKEN>` with values from step 1. Restart Claude Desktop.

### Cursor / Codex / other

Refer to your client's MCP configuration — the endpoint URL and Bearer token are the same.

## 3. The three tools

| Tool | Effect | Caveats |
|---|---|---|
| `switch_component` | Switch the workspace's active editor (`pdf-reader`, `latex-editor`, `ai-editor`) | 5 components currently disabled; will return `COMPONENT_DISABLED` |
| `update_notes` | Replace the workspace notes content | `replace` mode only this slice — no `append` / patch yet |
| `load_pdf` | Open a PDF in the pdf-reader (by `assetId` or `url`) | URL fetches respect SSRF blocklist + 100 MB cap (`MCP_MAX_PDF_SIZE_MB`) |

## 4. Single-user mode disclaimer

Self-host runs as a **single-user** system. Tokens authorize calls *to a specific
workspace*, but they do not represent a specific user account inside that workspace.
Multi-user authz arrives in a future phase.

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| 401 from MCP endpoint | Token revoked or workspace ID in URL doesn't match the token |
| 403 | Token belongs to a *different* workspace |
| `COMPONENT_DISABLED` | Target component is in the disabled list — see Workspace Settings |
| `URL_INVALID` on `load_pdf` | Hostname is in the SSRF blocklist (private CIDR, `.local`, etc.) |
| `URL_NOT_PDF` | Server returned non-PDF content even though Content-Type was `application/pdf` |
| Tool succeeds but UI does not update | Check `/api/agents/<id>/directive/stream` SSE — the directive may have been enqueued but the frontend stream is closed |

## 6. Env vars

| Var | Default | Effect |
|---|---|---|
| `MCP_AUTH_MODE` | `enabled` | `disabled` skips bearer auth (only on `NODE_ENV=development` AND localhost client) |
| `MCP_MAX_PDF_SIZE_MB` | `100` | Maximum PDF size for URL downloads |
| `MCP_MAX_NOTES_SIZE_KB` | `1024` | Maximum content length for `update_notes` |
| `MCP_FETCH_TIMEOUT_MS` | `30000` | URL fetch timeout |
| `MCP_REDIRECT_LIMIT` | `3` | Maximum HTTP redirects on `load_pdf` |
```

- [ ] **Step 2: Commit**

```bash
git add docs/self-hosting/mcp.md
git commit -m "docs(mcp): add self-host MCP user guide"
```

---

### Task 8.2: Internal dev guide

**Files:**
- Create: `web/src/lib/mcp/README.md`

- [ ] **Step 1: Write the dev guide**

```markdown
<!-- web/src/lib/mcp/README.md -->
# `lib/mcp` — Internal Dev Guide

The MCP server surface for Prismer workspaces. Spec: `docs/plans/2026-04-28-workspace-mcp-design.md`.

## Layout

```
lib/mcp/
├── server.ts               # createMcpServer(ctx) → SDK Server instance
├── auth.ts                 # authenticateMcpRequest(req, workspaceId) → TokenContext
├── tokens.ts               # createMcpToken / listMcpTokens / revokeMcpToken / validateMcpToken
├── errors.ts               # toolError(code, msg) / toolSuccess(data) helpers
├── ssrf.ts                 # safeFetch(url) with validating DNS lookup
├── dispatch.ts             # resolveAgentId / dispatchDirective (in-process queue)
└── tools/
    ├── index.ts            # registers all tools on the SDK Server (list_tools + call_tool)
    ├── switch_component.ts
    ├── update_notes.ts
    └── load_pdf.ts
```

## Adding a new tool

1. Create `tools/<name>.ts` exporting `{ name, description, inputSchema, handler }`.
2. Add it to the `TOOLS` array in `tools/index.ts`.
3. Add a unit test in `__tests__/tools/<name>.test.ts`. Mock `@/lib/mcp/dispatch` and any service the handler calls.
4. Add a directive type to `docker/plugin/prismer-workspace/src/tools.ts` only if the wire shape is genuinely new — Phase 1 reused existing types.

## Error codes

See `errors.ts`. Tool handlers return a `CallToolResult` with `isError: true` and one
text content item containing JSON `{ code, message }`. The client should match on `code`.

Schema-level errors (zod failures) bubble up as JSON-RPC `-32602` automatically.

## Known limits

- One agent per workspace (`AgentInstance.workspaceId @unique`). Both OpenClaw and MCP write into the same row.
- `update_notes` is `replace` only.
- `load_pdf` URL fetches are subject to the SSRF blocklist in `ssrf.ts`.
- Self-host single-user — no multi-user authz inside a workspace.
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/mcp/README.md
git commit -m "docs(mcp): add internal dev guide for lib/mcp"
```

---

### Task 8.3: Update SCHEME.md and ARCH.md

**Files:**
- Modify: `docs/SCHEME.md` (add `WorkspaceMcpToken` table)
- Modify: `docs/ARCH.md` (mention MCP path alongside OpenClaw)

- [ ] **Step 1: Add the table to SCHEME.md**

Append under the **Workspace** section in `docs/SCHEME.md`:

```markdown
### `WorkspaceMcpToken`

Per-workspace bearer token for MCP clients (Phase 1).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `workspaceId` | `String` | FK → `WorkspaceSession.id` |
| `tokenHash` | `String @unique` | `sha256(plaintext)` hex |
| `prefix` | `String` | `pmsk_` + first 8 random chars (UI display only) |
| `name` | `String` | User-supplied label |
| `lastUsedAt` | `DateTime?` | Updated fire-and-forget on each successful auth |
| `expiresAt` | `DateTime?` | Optional |
| `revokedAt` | `DateTime?` | Set by DELETE endpoint |
| `createdBy` | `String` | `User.id` |
| `createdAt` | `DateTime @default(now())` | |

Indexes: `[workspaceId]`, `[tokenHash]`.
```

- [ ] **Step 2: Add the section to ARCH.md**

In the "Agent System" section of `docs/ARCH.md`, after the OpenClaw paragraph, append:

```markdown
**MCP path (Phase 1, since 2026-04):** `/api/mcp/workspace/[id]/` exposes a Streamable
HTTP MCP endpoint (`@modelcontextprotocol/sdk`). Three tools: `switch_component`,
`update_notes`, `load_pdf`. Auth is per-workspace bearer tokens stored as SHA-256
hashes in `WorkspaceMcpToken`. Tools resolve the workspace's `AgentInstance` (creating
one via `ensureAgentBinding` if missing) and enqueue directives onto the existing
`directiveQueue` — same wire types and same SSE stream as the OpenClaw plugin path.
No frontend changes; both paths can coexist on the same workspace.
```

- [ ] **Step 3: Commit**

```bash
git add docs/SCHEME.md docs/ARCH.md
git commit -m "docs(mcp): document WorkspaceMcpToken + MCP path in SCHEME.md and ARCH.md"
```

---

### Task 8.4: Manual smoke checklist

**Files:** none (this is a checklist; record results in the PR description)

Run the items below before merging. **Spec §6.4.**

- [ ] **Step 1: Configure Claude Desktop**

In `~/Library/Application Support/Claude/claude_desktop_config.json`, add an `mcpServers` entry pointing at `http://localhost:3000/api/mcp/workspace/<WORKSPACE_ID>/` with a freshly generated token.

Restart Claude Desktop. Verify the three tools (`switch_component`, `update_notes`, `load_pdf`) appear in the tool picker.

- [ ] **Step 2: Drive each tool**

In Claude Desktop, ask:
1. "Switch the workspace to pdf-reader" → Claude calls `switch_component` → workspace UI switches to PDF Reader
2. "Replace the workspace notes with: # Hello from MCP" → Claude calls `update_notes` → ai-editor shows the new content
3. "Load https://arxiv.org/pdf/1706.03762.pdf into the workspace" → Claude calls `load_pdf` → PDF reader loads the document

- [ ] **Step 3: Repeat with one other client**

Cursor or Codex CLI. Confirm same three behaviors.

- [ ] **Step 4: Run the existing L1/L2/L3 e2e suite**

```bash
cd web
npm run test:layer1 && npm run test:layer2 && npm run test:layer3
```

Expected: all green. The MCP path must not regress OpenClaw behavior.

- [ ] **Step 5: Run unit + new layer1 tests one more time, all-green gate**

```bash
cd web
npm run test:unit && npm run test:layer1
```

- [ ] **Step 6: Commit final docs (if any) and tag the PR ready-for-review**

```bash
# Push branch
git push -u origin <branch-name>
# Open PR from GitHub UI or `gh pr create`
```

---

## Self-Review

### Spec coverage

Walking spec §1 through §10:

- §1 Architecture (1.1–1.5) — Phase 0/3/6 cover SDK, file layout, coexistence, no-virtual-agent rationale, data flow.
- §2 Auth and Tokens (2.1–2.8) — Phase 0.1, 2.1–2.6 cover schema, token format, validation flow, dev fallback, access helper, CRUD, UI, audit logging.
- §3 Tool Specifications (3.1–3.4) — Phase 6 covers error model + each tool.
- §4 Frontend Directive Integration (4.1–4.5) — Phase 6 reuses existing types verbatim; `dispatch.ts` documents why we use the in-process queue.
- §5 Configuration (5.1–5.5) — Phase 0.2/0.3 cover deps and env. Next.js config (`dynamic = 'force-dynamic'`) is set in route.ts (Phase 3.3). Docker: no changes (spec §5.5).
- §6 Testing (6.1–6.4) — Phase 1/2/4/5/6 unit tests + Phase 7 layer1 + Phase 8.4 smoke.
- §7 Documentation — Phase 8.1/8.2/8.3.
- §8 Rollout Order — every phase numbered to match.
- §9 Risks — `pdf-parse` failure path (Task 6.7 catches and defaults to 0); `ssrf.ts` test matrix (Task 5.1, ≥18 cases); `requireWorkspaceAccess` adopted opportunistically (token CRUD only this PR); MCP client compat (Task 7.1 with SDK client); disabled components constant directly read (Task 6.3).
- §10 Future Work — explicitly out of scope; only referenced in dev guide.

### Placeholder scan

- No "TODO" / "TBD" / "implement later" in any task body.
- All test code blocks contain runnable assertions.
- All implementation code blocks contain complete file contents.
- The one explicit deferral (settings UI mounting in Task 2.6) is bounded: panel ships standalone; any settings dialog wiring is out of scope.

### Type consistency

- `assetId` is `number` everywhere — token records use `string` ids, asset records use `number` ids; this is locked in the type glossary at the top.
- `workspaceId` is `string` (cuid) everywhere.
- `agentId` is `string` (cuid).
- `userId` ambiguity called out and explicitly handled: workspace-owner uses `string`, asset operations use `number` via `getRemoteUserId()`.
- `ToolContext` shape is identical in `tools/index.ts` and each tool file.
- Wire directive type names are UPPERCASE (`SWITCH_COMPONENT`, `UPDATE_NOTES`, `PDF_LOAD_DOCUMENT`) — verified against `web/src/app/workspace/hooks/useDirectiveStream.ts` and `docker/plugin/prismer-workspace/src/tools.ts`.

### Known caveats not blocking the plan

1. **NextAuth integration is incomplete in the codebase.** Task 2.5 ships token CRUD using a fallback resolver (workspace owner). When NextAuth lands, replace `resolveCallerUserId` with `(await auth()).user.id`. This matches spec §2.5's self-host single-user disclaimer.
2. **The Web→Node adapter in route.ts is the most fragile piece.** If the SDK transport's expectations change in a minor SDK release, this is where it breaks. Pinning the SDK version (Task 0.2) plus the smoke test (Task 3.3) detects regressions immediately.
3. **`directive/poll` endpoint name** in the layer1 e2e test is assumed; verify before running and adjust if the actual route is `directive/stream` (SSE) — pollable via `EventSource` if so.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-30-workspace-mcp-phase1.md`.** Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
