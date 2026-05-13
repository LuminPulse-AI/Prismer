<!--
 Copyright 2026 prismer

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

     https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
-->

# ARCH — Engineering Architecture

> Last verified: 2026-05-13
> Source of truth: actual codebase, not aspirational docs
> See also: `docs/WINDOWVIEW_CONVERGENCE.md` for WindowViewer component unification plan

---

## 1. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.1.1 |
| UI Runtime | React + React Compiler | 19 |
| Language | TypeScript | 5 |
| State | Zustand | 5 |
| Styling | Tailwind CSS + shadcn/ui (Radix) | 4 |
| ORM | Prisma (SQLite dev / MySQL prod) | 6 |
| Auth | NextAuth v5 (JWT strategy) | beta.30 |
| Desktop/Mobile | Tauri 2 (Rust + WKWebView) | 2 |
| Validation | Zod | 4 |
| Animation | framer-motion | - |
| Toast | Sonner | - |
| Real-time | Custom WebSocket protocol | - |
| Storage | AWS S3 (STS uploads) | - |
| Config | Environment variables (.env) | - |

## 2. Codebase Metrics

| Directory | TS/TSX Files | Purpose |
|-----------|-------------|---------|
| `src/lib/` | 44 | Services, sync engine, infra clients |
| `src/components/` | 191 | Editors, UI primitives, agent UI |
| `src/app/` | 180 | Pages, API routes, layouts, stores |
| `scripts/` | 17 | Dev servers, verification scripts |
| **Total** | **431** | ~53K lines TypeScript |

**Prisma models**: 37 (across 7 domains)

## 3. Source Layout

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # REST API endpoints
│   │   ├── v2/                   # Current API convention
│   │   │   ├── papers/           # Paper CRUD, search, favorites
│   │   │   ├── assets/           # User assets, upload
│   │   │   ├── collections/      # Collection management
│   │   │   ├── notebooks/        # Notebook CRUD
│   │   │   ├── stats/            # Statistics
│   │   │   └── im/               # IM API (register, conversations, messages, workspace binding)
│   │   ├── auth/                 # NextAuth endpoints
│   │   ├── workspace/            # Workspace agent API
│   │   ├── agents/               # Agent CRUD + start/stop/logs/health/status
│   │   ├── ai/                   # AI proxy endpoints
│   │   └── ...                   # health, jupyter, latex, ocr, github, config
│   ├── global/                   # Shared across all pages
│   │   ├── layouts/              # MainLayout.tsx
│   │   ├── components/           # AppSidebar, UserMenu, ReaderOverlay, WorkspaceTabButton, CreateWorkspaceDialog, ManageWorkspacesDialog
│   │   └── store/                # uiStore, readerStore, authStore
│   ├── discovery/                # Paper discovery feed
│   ├── assets/                   # Asset management
│   ├── workspace/                # Research workspace
│   │   ├── [workspaceId]/        # Dynamic route for specific workspace
│   │   │   └── page.tsx          # Server component with ownership validation
│   │   ├── page.tsx              # Redirect to most recent or create default
│   │   ├── components/           # WorkspaceView, WorkspaceChat, WindowViewer, ConnectionIndicator, etc.
│   │   ├── stores/               # workspaceStore.ts (80+ actions), agentInstanceStore.ts (gatewayUrl, fetchAgentBinding)
│   │   ├── hooks/                # useContainerChat, useIMChat, useHealthMonitor, useDirectiveStream, useIMSync
│   │   ├── lib/                  # Event bus, action executor, state snapshots
│   │   ├── mock/                 # Demo flow data providers
│   │   └── types.ts              # Workspace type definitions
│   ├── mobile/                   # 3-tab mobile (Command/Files/Me) with BottomTabBar, SafeAreaView
│   ├── admin/                    # Admin monitor dashboard
│   ├── agent/                    # Agent protocol, gateway (TypeScript)
│   ├── playground/               # WebContainer code playground
│   ├── auth/                     # Login/register pages
│   └── library/                  # Redirect to /discovery
├── components/
│   ├── editors/                  # 8 editor components
│   │   ├── pdf-reader/           # PDF with OCR, AI chat, annotations (~40K lines)
│   │   ├── jupyter/              # Jupyter notebook integration (~15K lines)
│   │   └── previews/             # LaTeX, code playground, AI editor, AG Grid, etc.
│   ├── ui/                       # shadcn/ui components
│   ├── agent/                    # Agent chat UI components
│   └── shared/                   # Shared components
├── lib/
│   ├── cloud/                    # @prismer/sdk integration (v1.7)
│   │   ├── index.ts              # Main exports
│   │   ├── client.ts             # PrismerClient singleton
│   │   ├── context.ts            # Context API (load, search, cache)
│   │   ├── parse.ts              # Parse API (PDF → markdown)
│   │   ├── im.ts                 # IM API (messaging, groups, workspace)
│   │   ├── realtime.ts           # WebSocket/SSE realtime
│   │   ├── webhook.ts            # Webhook handler (HMAC verification)
│   │   └── types.ts              # Type re-exports and extensions
│   ├── sync/                     # WebSocket sync engine (see section 7)
│   │   └── persistence/          # Session persistence (Phase 3D)
│   │       ├── types.ts          # SessionPersistence interface
│   │       ├── PrismaSessionPersistence.ts  # Database backend
│   │       └── MemorySessionPersistence.ts  # In-memory backend
│   ├── agent/                    # Agent service abstraction (Phase 3A/3B)
│   │   ├── types.ts              # AgentService interface, AgentEvent types
│   │   ├── DemoAgentService.ts   # Demo implementation
│   │   ├── OpenClawAgentService.ts # OpenClaw WebSocket client
│   │   ├── AgentServiceFactory.ts  # Factory for service selection
│   │   └── eventMapper.ts        # AgentEvent → Sync protocol mapping
│   ├── container/                # Container orchestration (Phase 3C)
│   │   ├── types.ts              # Container config, status types
│   │   ├── orchestrator.ts       # ContainerOrchestrator interface + factory
│   │   ├── dockerOrchestrator.ts # Docker implementation
│   │   ├── k8sOrchestrator.ts    # Kubernetes implementation
│   │   ├── k8sClient.ts          # K8s API client singleton (3 auth modes)
│   │   ├── autoRecovery.ts       # Auto-recovery service (multi-orchestrator)
│   │   ├── version.ts            # Container image version SSoT (v5.0)
│   │   ├── compatibility.ts      # Version compatibility validation
│   │   └── client.ts             # Container proxy utilities (Docker + K8s)
│   ├── llm/                      # LLM gateway (Phase 3E)
│   │   ├── types.ts              # LLM types, MODEL_PRICING
│   │   ├── usageLogger.ts        # Usage logging, stats, cost alerts
│   │   └── index.ts              # Module exports
│   ├── services/                 # Business logic services
│   │   ├── paper.service.ts      # Paper search, CRUD
│   │   ├── asset.service.ts      # User assets CRUD
│   │   ├── collection.service.ts # Collections CRUD
│   │   ├── upload.service.ts     # S3 upload flow
│   │   ├── parser.service.ts     # OCR Parser API v2.5
│   │   ├── auth.service.ts       # Auth operations
│   │   ├── remote-paper.service.ts # Remote MySQL queries
│   │   ├── workspace.service.ts  # Workspace CRUD with ownership
│   │   └── offline.service.ts    # Offline support
│   ├── prisma.ts                 # Prisma Client singleton
│   ├── remote-db.ts              # MySQL connection pool
│   ├── s3.ts                     # AWS S3 client
│   └── redis.ts                  # Redis client
├── store/                        # Global Zustand stores
├── generated/prisma/             # Generated Prisma Client (never edit)
└── test/                         # Test setup
scripts/
├── agent-server.ts               # WebSocket agent/sync server (port 3456)
├── mobile-dev.sh                 # iOS simulator dev script
└── verify-*.ts                   # Service verification scripts
prisma/
└── schema.prisma                 # 37 models, SQLite dev / MySQL prod
python/
└── main.py                       # Separate Python agent server (uv)
docker/
├── Dockerfile.openclaw           # v5.0 overlay on prismer-academic:v5.0
├── docker-compose.dev.yml        # Dev: port 16888
├── docker-compose.openclaw.yml   # Standalone: port 16888
├── gateway/
│   └── container-gateway.mjs     # Unified reverse proxy (pure Node.js)
├── scripts/
│   ├── arxiv-server.py           # arXiv paper conversion service
│   └── patch-entrypoint.py       # Entrypoint patcher
├── config/                       # OpenClaw + skill configs
├── plugin/
│   ├── prismer-im/               # IM channel plugin
│   └── prismer-workspace/        # Workspace skill plugin
└── templates/                    # Agent persona templates
```

## 4. Routing

```
/                           → redirect → /library → redirect → /discovery
/discovery                  → Paper discovery feed (MainLayout)
/assets                     → User assets & collections (MainLayout)
/workspace                  → Redirect to most recent workspace or create default
/workspace/[workspaceId]    → Research workspace for specific session (MainLayout, overflow-hidden)
/mobile                     → Mobile 3-tab layout: /command, /files, /me (Tauri iOS)
/admin/monitor              → Service monitor dashboard
/playground                 → WebContainer code playground (COEP/COOP headers)
/auth                       → Login/register
/api/v2/*                   → REST API (current convention)
/api/workspace              → Workspace CRUD (GET list, POST create)
/api/workspace/[id]         → Single workspace (GET, PATCH update, DELETE)
/api/auth/*                 → NextAuth endpoints
```

**Layout hierarchy**:
```
MainLayout
├── AppSidebar (3 tabs: Discovery | Assets | Workspace)
├── Content area (flex-1, overflow varies by route)
├── ReaderOverlay (PDF reader modal, any page)
└── UploadModal (file upload, triggered from sidebar)
```

## 5. State Management

| Store | Location | Persist | Scope |
|-------|----------|---------|-------|
| `uiStore` | `app/global/store/` | none | Active tab, UI flags |
| `readerStore` | `app/global/store/` | none | Open papers, reader state |
| `authStore` | `app/global/store/` | localStorage | User auth, JWT |
| `discoveryStore` | `app/discovery/store/` | none | Paper filters, pagination |
| `assetStore` | `app/assets/store/` | localStorage (user-isolated) | Upload state, asset list |
| `collectionStore` | `app/assets/store/` | none | Collections |
| `workspaceStore` | `app/workspace/stores/` | none | Chat, tasks, timeline, components, demo, agent sync |
| `pdfStore` | `components/editors/pdf-reader/store/` | none | PDF viewer state |
| `chatSessionStore` | `components/editors/pdf-reader/store/` | none | AI chat sessions |
| `notebookStore` | `components/editors/jupyter/store/` | none | Jupyter state |

**workspaceStore** is the largest store (80+ actions, 15+ selector hooks). Key selectors: `useCurrentTask`, `useActiveDiff`, `useLayoutState`, `useActiveComponent`, `useComponentState`.

## 6. Data Flow

### Service Architecture (Current)

```
┌──────────────────────────────────────────┐
│            Next.js API Routes            │
│  /api/v2/papers  /api/v2/assets  etc.    │
└─────────┬────────────────────┬───────────┘
          │                    │
┌─────────▼──────────┐ ┌──────▼──────────┐
│  paper.service.ts  │ │ asset.service   │
│  remote-paper.ts   │ │ collection.ts   │
│  parser.service    │ │ upload.service  │
└─────────┬──────────┘ └──────┬──────────┘
          │                    │
┌─────────▼────────────────────▼───────────┐
│              remote-db.ts                │
│         MySQL connection pool            │
│    (env-based credentials)               │
└─────────────────┬────────────────────────┘
                  │
┌─────────────────▼────────────────────────┐
│       Remote MySQL (prismer_info)        │
│  documents | po_user_assets | users      │
└──────────────────────────────────────────┘
```

### Real-time Sync Architecture (Unified)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                            │
│  chatStore ◄──► taskStore ◄──► timelineStore ◄──► contextStore      │
│       │              │              │                   │            │
│       └──────────────┴──────────────┴───────────────────┘            │
│                              │                                       │
│              useDesktopAgent / useMobileAgent (WebSocket)            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    agent-server.ts (port 3456)                       │
│                                                                      │
│  SessionStore (in-memory)  ◄──► PersistenceProxy                    │
│       │                              │                               │
│       │                    ┌─────────▼──────────┐                   │
│       │                    │  Next.js REST APIs  │                   │
│       │                    │  /api/workspace/:id │                   │
│       │                    │  /messages /tasks   │                   │
│       │                    │  /timeline /session  │                   │
│       │                    └─────────┬──────────┘                   │
│       │                              │ Prisma                        │
│       │                    ┌─────────▼──────────┐                   │
│       │                    │  SQLite / MySQL DB  │                   │
│       │                    │  WorkspaceMessage   │                   │
│       │                    │  WorkspaceTask      │                   │
│       │                    │  WorkspaceTimeline  │                   │
│       │                    └────────────────────┘                   │
│       │                                                              │
│  ContainerBridge ◄── ContextManager (uses @prismer/sdk)             │
│       │                                                              │
└───────┼──────────────────────────────────────────────────────────────┘
        │ WebSocket
┌───────▼──────────────────────────────────────────────────────────────┐
│                    Container (OpenClaw)                               │
│  Gateway(:18901) ← receives messages + context + files               │
│  /workspace/ ← synced files                                          │
│  Jupyter(:8888), LaTeX(:8080), etc.                                  │
└──────────────────────────────────────────────────────────────────────┘
```

**Realtime Protocol**: FULL_STATE | STATE_DELTA | UI_DIRECTIVE | AGENT_STATUS | ERROR

**Source of Truth**:

| Data Type | Source of Truth | Primary Storage | Cache / Mirror |
|-----------|----------------|-----------------|----------------|
| Messages | Prisma `WorkspaceMessage` | SQLite/MySQL | chatStore (Zustand), agent-server memory |
| Tasks | Prisma `WorkspaceTask` | SQLite/MySQL | taskStore (Zustand), agent-server memory |
| Timeline | Prisma `WorkspaceTimelineEvent` | SQLite/MySQL | timelineStore (Zustand) |
| State Snapshots | Prisma `WorkspaceStateSnapshot` | SQLite/MySQL | timelineStore |
| Component States | Prisma `WorkspaceComponentState` | SQLite/MySQL | componentStore (Zustand) |
| Files (text) | Prisma `WorkspaceFile` | SQLite/MySQL | Container `/workspace/` |
| Files (binary) | S3 + `WorkspaceFile` URL | S3 | Container `/workspace/` |
| Paper Context | Cloud SDK (Prismer Cloud) | Cloud CDN (HQCC) | contextStore (Zustand) |
| Agent State | agent-server.ts (runtime) | In-memory | agentInstanceStore (Zustand) |
| Layout State | Frontend only | Zustand + localStorage | Not synced to backend |

**Data Flow (5 paths)**:

1. **Realtime**: `useDesktopAgent` → WebSocket → `agent-server.ts` → ContainerBridge → OpenClaw Gateway
2. **Persistence**: agent-server.ts → `PersistenceProxy` → REST → `/api/workspace/:id/*` → Prisma DB (`PrismaSessionPersistence`)
3. **Context**: PDF reader event → agent-server.ts → `ContextManager` → Cloud SDK `context.load()` / `parsePdf()` → enrich agent prompts
4. **Files**: ChatPanel upload → `/api/workspace/:id/files` → Prisma DB → ContainerBridge sync to `/workspace/`
5. **Session Hydration**: Page load → `GET /api/workspace/:id/session` → chatStore + taskStore + timelineStore

**Why agent-server.ts, not SDK realtime**: agent-server.ts handles full session state sync (8 component types, UI directives, task updates, timeline events). This exceeds SDK `im.realtime.connectWS()` which only handles message delivery. SDK realtime reserved for future cross-workspace notifications.

**Implementation status**: See `docs/ROADMAP.md` Phase 4C-F for persistence, context, files, and IM convergence sub-phases.

## 7. Sync/Agent Layer

The `src/lib/sync/` module is an **adaptation layer** bridging frontend with OpenClaw agent backend.

| File | Purpose |
|------|---------|
| `types.ts` | Protocol types, message schemas |
| `SyncMatrixEngine.ts` | Declarative access control: who can access what data how |
| `useAgentConnection.ts` | WebSocket hook: connect, reconnect, dedup, throttle |
| `useAgentStore.ts` | Zustand bridge: auto-sync store ↔ WebSocket |
| `componentStateConfig.ts` | Per-field sync policies per component type |
| `defaultMatrix.ts` | Built-in sync rules per data type |
| `syncUtils.ts` | Throttle, debounce, diff utilities |
| `errorHandler.ts` | Error recovery strategies |
| `componentEventForwarder.ts` | Forward component events to server |

**Sync Matrix (default rules)**:

| Data Type | Desktop | Mobile | Agent |
|-----------|---------|--------|-------|
| messages | readwrite | readwrite | read |
| tasks | read | read | readwrite |
| participants | read | read | none |
| timeline | readwrite | read | readwrite |
| componentStates | readwrite | partial | read |
| agentState | read | read | write |

**Key design**: Switching from demo server to OpenClaw requires zero component-layer changes. Only the server-side implementation changes.

## 8. Agent Service Layer (Phase 3)

The `src/lib/agent/` module provides a service abstraction for agent backends, enabling seamless switching between demo and production agents.

### 8.1 AgentService Interface

```typescript
interface AgentService {
  readonly type: 'demo' | 'openclaw';
  startSession(config: SessionConfig): Promise<SessionState>;
  endSession(sessionId: string): Promise<void>;
  sendMessage(sessionId: string, content: string, metadata?: Record<string, unknown>): Promise<void>;
  executeTask(sessionId: string, config: TaskConfig): Promise<string>;
  handleInteraction(sessionId: string, interaction: UserInteraction): Promise<void>;
  subscribe(sessionId: string, handler: AgentEventHandler): () => void;
  healthCheck(): Promise<boolean>;
}
```

### 8.2 Service Implementations

| Service | File | Description |
|---------|------|-------------|
| `DemoAgentService` | `DemoAgentService.ts` | Simulated agent for testing, demo flows |
| `OpenClawAgentService` | `OpenClawAgentService.ts` | Production WebSocket client for OpenClaw Gateway |

**Factory selection** via `AGENT_MODE` env var:
- `AGENT_MODE=demo` (default) → DemoAgentService
- `AGENT_MODE=openclaw` → OpenClawAgentService

### 8.3 Event System

AgentEvent union type (16 event types):
```
session_started | session_ended | message_start | message_delta |
message_complete | task_created | task_updated | task_completed |
task_failed | tool_start | tool_result | component_update |
interaction_required | error | status_change | heartbeat
```

**Event mapping**: `agentEventToSyncMessage()` transforms AgentEvent to ServerToClientMessage for sync broadcast.

### 8.4 Container Orchestration (Docker + Kubernetes)

The container module (`src/lib/container/`) supports dual-mode orchestration. All API routes use per-agent orchestrator resolution via the `Container.orchestrator` DB field.

**Architecture**:
```
API Routes (start/stop/health/logs)
         │ getOrchestrator(type)
         ▼
┌────────────────┐
│  Orchestrator   │  ContainerOrchestrator interface
│   Factory       │  (per-type singleton cache)
└───┬────────┬───┘
    │        │
┌───▼────┐ ┌─▼──────────┐
│ Docker │ │ Kubernetes  │
│Orch.   │ │ Orch.       │
└───┬────┘ └──┬──────────┘
    │         │
 localhost  NodePort
  :16888    :3xxxx
```

| Feature | Docker | Kubernetes |
|---------|--------|------------|
| Create | `docker create` | Pod + NodePort Service |
| Start | `docker start` | No-op (pod auto-starts) |
| Stop | `docker stop` | Delete Pod (keep Service) |
| Remove | `docker rm` | Delete Pod + Service |
| Logs | Docker API (strip 8-byte header) | K8s Log API (plain text) |
| Config deploy | `docker exec cat >` | K8s Exec API |
| Health | Docker inspect + HTTP probe | Pod status + HTTP probe |
| Gateway URL | `ws://<container-ip>:18901` | `ws://<node-ip>:<nodePort>` |
| Gateway proxy | TCP proxy (18901→18900) | No-op (NodePort handles) |

**K8s Client** (`k8sClient.ts`) supports 3 auth modes:
1. Remote cluster: `K8S_CLUSTER_URL` + `K8S_SERVICE_ACCOUNT_TOKEN`
2. Kubeconfig file: `K8S_KUBECONFIG_PATH`
3. In-cluster: `K8S_IN_CLUSTER=true`

**Pod naming**: `prismer-agent-{agentId}`, Service: `prismer-svc-{agentId}`

### 8.5 Container Auto-Recovery

`ContainerAutoRecoveryService` in `src/lib/container/autoRecovery.ts`:

| Feature | Description |
|---------|-------------|
| Health monitoring | Periodic health checks with configurable interval |
| Failure detection | Threshold-based failure detection (consecutive failures) |
| Auto-restart | Exponential backoff retry (maxRetries, backoffFactor) |
| Event hooks | Container died/oom/started/stopped handlers |
| Recovery policy | Configurable per-container policies |
| Multi-orchestrator | Per-agent orchestrator resolution (Docker or K8s) |

### 8.6 Session Persistence

`SessionPersistence` interface in `src/lib/sync/persistence/`:

| Implementation | Backend | Use Case |
|----------------|---------|----------|
| `PrismaSessionPersistence` | SQLite/MySQL via Prisma | Production |
| `MemorySessionPersistence` | In-memory Map | Development/testing |

**Env toggle**: `SYNC_PERSISTENCE=true` (default) enables database persistence.

**PersistenceProxy pattern** (Phase 4C): `agent-server.ts` runs as a standalone Node process and cannot import Prisma directly. It persists data via HTTP calls to Next.js REST APIs:

```
agent-server.ts (port 3456)
  │ onMessage() ──→ PersistenceProxy.saveMessage()
  │ onTaskUpdate() ──→ PersistenceProxy.saveTasks()
  │ onTimelineEvent() ──→ PersistenceProxy.saveTimelineEvent()
  │ onConnect() ──→ PersistenceProxy.loadSession() → hydrate in-memory
  │
  └──→ HTTP ──→ /api/workspace/:id/{messages,tasks,timeline,session}
                    └──→ PrismaSessionPersistence (already implemented)
```

`PrismaSessionPersistence` already implements full CRUD: `saveMessage()`, `saveMessages()`, `saveTask()`, `saveTasks()`, `saveTimelineEvent()`, `saveTimelineEvents()`, `saveComponentState()`, `loadSession()`, `saveSnapshot()`, `loadSnapshots()`.

### 8.7 Workspace MCP Surface (Phase 1)

The `src/lib/mcp/` module exposes a Model Context Protocol (MCP) surface so external agent runtimes — Hermes, Claude Desktop, Cursor, Codex, future custom agents — can drive a workspace **without** going through the OpenClaw container path. Both entry paths share one `AgentInstance` row, one directive queue, and one SSE stream — there is no fork in the frontend.

```
External agent (Hermes / Claude Desktop / Cursor / Codex)
       │  HTTP POST /api/mcp/workspace/<id>/   (MCP JSON-RPC over Streamable HTTP, bearer auth)
       ▼
   lib/mcp/auth.ts           bearer → tokenHash lookup, workspace-id binding check
       │
       ▼
   lib/mcp/tools/*           switch_component / update_notes / load_pdf
       │  POST /api/agents/<agentId>/directive   (same endpoint OpenClaw plugin posts to)
       ▼
   directiveQueue ──SSE──> frontend useDirectiveStream ──> syncActions
                                                    ▲
   OpenClaw container plugin ──POST /api/agents/<agentId>/directive────┘
```

| Layer | File | Purpose |
|-------|------|---------|
| Transport | `app/api/mcp/workspace/[id]/route.ts` | Streamable HTTP JSON-RPC endpoint (POST/GET/DELETE) |
| Server factory | `lib/mcp/server.ts` | `McpServer` per request, registers tools with context |
| Auth | `lib/mcp/auth.ts` | Bearer extraction + SHA-256 hash lookup + workspace-id check |
| Tokens | `lib/mcp/tokens.ts` | Generate / list / revoke `WorkspaceMcpToken` |
| ACL | `lib/services/workspace-access.service.ts` | `requireWorkspaceAccess()` owner+participant gate |
| Notes | `lib/services/notes.service.ts` | Extracted from `/api/workspace/[id]/notes` for tool reuse |
| SSRF | `lib/mcp/ssrf.ts` | DNS-validating fetch agent for `load_pdf` URL mode |
| Tools | `lib/mcp/tools/{switch_component,update_notes,load_pdf}.ts` | 3 Phase-1 tools |

**Phase 1 tool surface (3 of ~26 OpenClaw tools)**:

| Tool | Wire directive emitted | Notes |
|------|------------------------|-------|
| `switch_component` | `SWITCH_COMPONENT { component }` | Server-side rejects components in `DISABLED_COMPONENTS` |
| `update_notes` | `UPDATE_NOTES { content }` | Persists via `notesService` Asset; replace-only in Phase 1 |
| `load_pdf` | `SWITCH_COMPONENT` + `PDF_LOAD_DOCUMENT { source, page }` | assetId XOR url; URL mode runs SSRF + magic-byte + size checks |

**Tokens** live in the `WorkspaceMcpToken` table (see `docs/SCHEME.md` §6). Plaintext is returned **once** at create; only `sha256(plaintext)` is persisted. UI is in `WorkspaceView.tsx` settings drawer ("MCP Access" tab).

**Key decisions** (from `docs/plans/2026-04-28-workspace-mcp-design.md`):
- No new `AgentInstance.runtime` field — both paths reuse the single per-workspace row (`workspaceId @unique`).
- No new directive types — the three Phase 1 wire directives already exist for OpenClaw.
- `AgentService` interface (§8.1) is **not** extended — MCP does not go through the factory.
- MCP tools call the existing `/api/agents/[id]/directive` HTTP route exactly as the OpenClaw plugin does. No shared `dispatchDirective()` extraction; both paths are byte-identical at the wire.

**Out of scope for Phase 1**: remaining 23 OpenClaw tools, `update_notes` append/patch mode, `HermesAgentService` runtime adapter, rate limiting, multi-user ACL. Tracked in `docs/plans/2026-04-23-post-merge-next-steps.md` and the design doc §Non-Goals.

### 8.8 LLM Gateway

`src/lib/llm/` provides multi-provider LLM support with usage tracking:

| Function | Description |
|----------|-------------|
| `logLLMUsage()` | Record usage to LLMUsageLog model |
| `extractUsageFromOpenAI()` | Parse OpenAI response format |
| `getUserUsageStats()` | Aggregate stats per user |
| `getAgentUsageStats()` | Aggregate stats per agent |
| `checkCostThreshold()` | Budget alert checking |

**MODEL_PRICING** table includes 12 models (Claude, GPT-4, DeepSeek) with per-token cost in USD/million.

**API Endpoints**:
- `GET /api/llm/usage` — Usage statistics
- `POST /api/llm/usage` — Record usage
- `GET /api/llm/cost` — Cost monitoring with threshold alerts
- `GET /api/agents/health` — Aggregated agent container health
- `GET/POST /api/v2/im/bridge/[workspaceId]` — Bridge chat API (status, send message, history)
- `POST /api/agents/[id]/start` — Start agent container (Docker/K8s, config deploy, gateway proxy)
- `GET /api/agents/[id]/health` — Single agent health check (gateway + container)
- `GET /api/agents/[id]/logs` — Container logs streaming

## 9. Database Schema Domains

38 Prisma models across 7 domains (see `docs/SCHEME.md` for full detail):

| Domain | Models | Count |
|--------|--------|-------|
| **Users & Auth** | User, Account, Session, VerificationToken | 4 |
| **Papers & OCR** | Paper, OcrTask, Figure | 3 |
| **Notebooks & Notes** | Notebook, Note, NoteCitation | 3 |
| **Social** | Favorite, Like, Comment, Activity, UserPaperState | 5 |
| **Uploads** | Upload | 1 |
| **Workspace** | WorkspaceSession, WorkspaceParticipant, WorkspaceMessage, WorkspaceTask, WorkspaceTimelineEvent, WorkspaceStateSnapshot, WorkspaceComponentState, WorkspaceFile, WorkspaceSnapshot, WorkspaceMcpToken | 10 |
| **Agent & IM** | AgentInstance, AgentConfig, Container, ConfigDeployment, LLMUsageLog, IMUser, IMAgentCard, IMConversation, IMParticipant, IMMessage, IMWebhook | 11 |
| **Cache** | StatsCache | 1 |

## 10. Configuration

- **Build-time** (`.env`): `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- **Runtime** (`.env`): API keys, model settings, service URLs. All configuration via environment variables.
- **Container**: `CONTAINER_IMAGE` (default: `docker.prismer.dev/prismer-academic:v5.0-openclaw`)

## 11. Container Gateway (v1.1.0)

Agent containers run a unified service gateway (`container-gateway.mjs`) that reverse-proxies all internal services via `/api/v1/{service}/*` routing.

```
Docker:  Host (:16888) ──→ Container (:3000)
K8s:     NodePort (:3xxxx) ──→ Pod (:3000)

                                   ┌──────────────────────────┐
  /api/v1/latex/*                  │  container-gateway.mjs   │
  ────────────────────────────────→│    → LaTeX    :8080      │
  /api/v1/prover/*                 │    → Prover   :8081      │
  ────────────────────────────────→│    → Jupyter  :8888      │
  /api/v1/jupyter/*                │    → Gateway  :18900     │
  ────────────────────────────────→│    → arXiv    :8082      │
  /api/v1/gateway/*                │                          │
  /api/v1/arxiv/*                  │                          │
  /api/v1/health                   │  aggregated health       │
  ────────────────────────────────→│                          │
                                   └──────────────────────────┘
```

| Port | Service | Description |
|------|---------|-------------|
| **16888** (Docker host) | Container Gateway | Docker unified entry point |
| **30000-32767** (K8s NodePort) | Container Gateway | K8s auto-assigned NodePort |
| 3000 (container) | container-gateway.mjs | Internal reverse proxy |
| 8080 | LaTeX | LaTeX → PDF compilation (pdflatex, xelatex, lualatex) |
| 8081 | Prover | Theorem provers (Coq, Z3) |
| 8888 | Jupyter | Jupyter server (token auto-injected by gateway) |
| 18900 | Gateway | OpenClaw agent gateway (WebSocket upgrade supported) |
| 8082 | arXiv | arXiv paper → flattened LaTeX (arxiv-to-prompt) |

**Key design decisions:**
- Zero npm dependencies — pure `node:http`
- Docker: auto-assigned host ports (not fixed), accessed via `docker port` inspection
- K8s: NodePort auto-assigned (30000-32767), accessed via `K8S_NODE_EXTERNAL_IP`
- Jupyter token injected automatically from `$JUPYTER_TOKEN` env
- WebSocket upgrade transparent relay for OpenClaw Gateway
- Aggregated health endpoint probes all services with 3s timeout
- CORS headers on all responses

**Gateway Auth (OpenClaw WebSocket protocol):**
- **Token-only auth** (local mode, preferred): Send `connect` with just `auth.token` — no device credentials needed
- **Device-signed auth** (remote mode): Ed25519 signed nonce for multi-node topologies
- Bridge API uses token-only auth via `sendGatewayMessage(gatewayUrl, token, device=null, ...)`
- Gateway token set via `OPENCLAW_GATEWAY_TOKEN` env var, stored in `AgentInstance.metadata`
- TCP proxy on port 18901 (0.0.0.0) → OpenClaw gateway on port 18900 (localhost-only)

**Frontend client** (`src/lib/container/client.ts`): `buildServiceUrl()` produces `http://{host}:${hostPort}/api/v1/${service}/${path}`. For Docker, host is `localhost`; for K8s, host is `nodeAddress` from `K8S_NODE_EXTERNAL_IP` or parsed from `gatewayUrl`.

**Version Management** (SSoT: `src/lib/container/version.ts`):

| Component | Version | SSoT File |
|-----------|---------|-----------|
| Container Image | v5.0-openclaw | `src/lib/container/version.ts` |
| prismer-workspace | 0.5.0 | `docker/plugin/prismer-workspace/version.ts` |
| prismer-im | 0.2.0 | `docker/plugin/prismer-im/version.ts` |
| container-gateway | 1.1.0 | `docker/gateway/version.mjs` |
| prismer-tools | 0.1.0 | `docker/scripts/prismer-tools/version.py` |

Compatibility matrix (`docker/compatibility.json`) validates all component versions at startup. Version manifest (`docker/versions-manifest.json`) is baked into the image at `/opt/prismer/versions.json` and reported by gateway root endpoint.

Change protocol: `docs/CONTAINER_PROTOCOL.md` (6 change types with checklists).

## 12. Open-Source Local Mode (Planned)

> Design doc: `docs/OPENSOURCE_ARCHITECTURE.md`
> Feasibility: `docs/CONTAINER_FRONTEND_FEASIBILITY.md`
> Change protocol: `docs/CONTAINER_PROTOCOL.md` Change Type V

### 12.1 Dual-Mode Architecture

The workspace frontend (`@prismer/workspace-ui`) runs identically in two deployment modes:

```
Cloud Mode (current)                    Local Mode (open-source)
┌──────────────┐                        ┌──────────────┐
│ Browser      │                        │ Browser      │
│ workspace-ui │                        │ workspace-ui │ (same code)
└──────┬───────┘                        └──────┬───────┘
       │                                       │
┌──────▼───────────────┐               ┌───────▼──────────────────┐
│ Prismer Cloud (:3000)│               │ Container Gateway (:3000)│
│ Next.js API Routes   │               │ API Compat Routes        │
│ Prisma + MySQL       │               │ SQLite + Agent           │
└──────┬───────────────┘               └──────────────────────────┘
       │
┌──────▼───────────────┐
│ Container (OpenClaw)  │
│ Gateway :3000         │
└──────────────────────┘
```

**Core strategy**: Gateway mimics Cloud API endpoints (`/api/v2/im/bridge/*`, `/api/agents/*`, `/api/container/*`) with identical response formats. Frontend code needs **zero modifications**.

### 12.2 npm Packages

| Package | Purpose | Status |
|---------|---------|--------|
| `@prismer/workspace-ui` | Vite SPA — workspace chat + WindowViewer | Planned (Phase 5) |
| `@prismer/container-gateway` | Extended gateway with API compat + SQLite | Planned (Phase 5) |

### 12.3 Local Mode Components

| Component | Cloud Equivalent | Local Implementation |
|-----------|-----------------|---------------------|
| Chat API | Bridge API + Prisma | Gateway → SQLite + Agent |
| Service proxy | Next.js proxy routes | Gateway direct proxy (:8888, :8080) |
| Agent management | Docker/K8s orchestration | Fixed: always running |
| Message persistence | IMMessage + WorkspaceMessage | SQLite `messages` table |
| UI directives | Bridge API → directive files | Gateway → directive files (same) |

### 12.4 Public Workspace

Public Workspace allows anyone (including unauthenticated users) to view running workspaces. Three visibility levels are supported:

| Visibility | Discovery | Direct Link | Auth Required |
|-----------|-----------|-------------|---------|
| `private` | Hidden | Inaccessible | Yes |
| `unlisted` | Hidden | Accessible (read-only) | No |
| `public` | Shown in Trending | Accessible (read-only) | No |

**Social features**: Star, Fork, Comment, Collaboration Request — all require authentication.

**Fork mechanism**: Deep-copies workspace context (paper references re-fetched via DOI, Jupyter notebooks, LaTeX source, Agent config). Does not copy chat history or agent instances. Reuses the Asset system's import pipeline.

**Data model extensions** (Prisma):
- `WorkspaceSession` adds `visibility` field (`private` | `unlisted` | `public`)
- New models: `WorkspaceStar`, `WorkspaceFork`, `WorkspaceComment`
- Discovery query: `WHERE visibility = 'public' ORDER BY starCount DESC`

**Cloud + Local dual mode**:
- Cloud mode: Public Workspace served via CDN + Next.js SSR
- Local mode: Container Gateway exposes `/public/:id` read-only route (suitable for lab intranet sharing)

### 12.5 Agent Automation (Cron, Hooks, Heartbeat)

OpenClaw provides three automation mechanisms for agent proactivity. Prismer backend acts as **SSoT** — container is the execution layer.

Reference: [OpenClaw Cron Docs](https://docs.openclaw.ai/automation/cron-jobs), [Hooks Docs](https://docs.openclaw.ai/automation/hooks), [Cron vs Heartbeat](https://docs.openclaw.ai/automation/cron-vs-heartbeat)

#### Three Automation Mechanisms

| Mechanism | What It Does | OpenClaw Location | Prismer Control |
|-----------|-------------|-------------------|-----------------|
| **Cron Jobs** | Scheduled tasks (one-shot or recurring) | Gateway scheduler, `~/.openclaw/cron/jobs.json` | Backend CRUD → Gateway `cron.*` API |
| **Hooks** | Event-driven automation (on message, command, bootstrap) | Gateway event system, `<workspace>/hooks/` | Backend enables/disables → config deploy |
| **Heartbeat** | Periodic agent awareness check (default 30min) | Gateway main session, `openclaw.json` config | Backend config → deploy on start |

#### Architecture: Backend SSoT + Container Execution

```
Frontend (Scheduler Panel)     Prismer Backend              Container Gateway
┌─────────────────────┐     ┌──────────────────┐         ┌─────────────────┐
│ Create/Edit/Delete  │ →   │ AgentCronJob (DB) │ ──→     │ cron.add/update │
│ View run history    │ ←   │ AgentHook (DB)    │ ←──     │ cron.runs       │
│ Toggle hooks        │     │ HeartbeatConfig   │         │ hooks config    │
└─────────────────────┘     └──────────────────┘         └─────────────────┘
                                    ↑                          │
                                    │  Agent self-creates job  │
                                    └──── callback/sync ───────┘
```

**Key flows**:
1. **User creates cron job** → Backend API → DB persist → Gateway `cron.add` → container executes
2. **Agent creates cron job in conversation** → Gateway `cron.add` → callback → Backend persists → UI updates
3. **Container restart** → Backend re-deploys all cron jobs from DB → no job loss
4. **Config deploy** (Step 6 of agent start) → includes heartbeat config + hook enable/disable

#### Cron Job Types

| Type | `sessionTarget` | Use Case |
|------|----------------|----------|
| Main session | `"main"` + `systemEvent` | Reminders, heartbeat-integrated checks |
| Isolated | `"isolated"` + `agentTurn` | Heavy analysis, scheduled reports, no context carryover |

Schedule kinds: `at` (one-shot timestamp), `every` (fixed interval ms), `cron` (cron expression + timezone).

#### Hook Categories

| Hook | Events | Purpose |
|------|--------|---------|
| `session-memory` | `command:new` | Captures session context snapshots |
| `bootstrap-extra-files` | `agent:bootstrap` | Injects workspace files at setup |
| `command-logger` | `command` | Audit trail to log file |
| `boot-md` | `gateway:startup` | Executes BOOT.md instructions |
| Custom hooks | Any event | User/plugin-defined automation |

Hooks load from: workspace `hooks/` (highest priority) → user `~/.openclaw/hooks/` → bundled.

#### Data Model

```prisma
model AgentCronJob {
  id              String   @id @default(cuid())
  agentInstanceId String
  agent           AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  name            String
  schedule        String   // JSON: { kind, at?, everyMs?, expr?, tz? }
  sessionTarget   String   @default("isolated") // "main" | "isolated"
  payload         String   // JSON: { kind, text?, message?, model?, thinking? }
  delivery        String?  // JSON: { mode, channel?, to? }
  enabled         Boolean  @default(true)
  gatewayJobId    String?  // OpenClaw jobId for sync
  lastRunAt       DateTime?
  nextRunAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

#### API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents/:id/cron` | List all cron jobs |
| `POST` | `/api/agents/:id/cron` | Create cron job → deploy to container |
| `PATCH` | `/api/agents/:id/cron/:jobId` | Update job → `cron.update` |
| `DELETE` | `/api/agents/:id/cron/:jobId` | Delete job → `cron.remove` |
| `POST` | `/api/agents/:id/cron/:jobId/run` | Force run → `cron.run` |
| `GET` | `/api/agents/:id/cron/:jobId/runs` | Run history → `cron.runs` |
| `GET` | `/api/agents/:id/hooks` | List hooks + status |
| `PATCH` | `/api/agents/:id/hooks/:name` | Enable/disable hook |

## 13. Container Plugins & Tools

The `docker/` directory contains four modules that run inside the OpenClaw agent container. Each has its own README with full documentation; see `docker/VERSIONS.md` for version tracking.

| Module | Version | Type | Purpose |
|--------|---------|------|---------|
| `prismer-workspace` | 0.5.0 | Skill Plugin | 26 tools via `registerTool()` API (latex, jupyter, pdf, code, data, ui control, content update, workspace context, academic, gallery) |
| `prismer-tools` | 0.1.0 | Python CLIs | 4 CLI tools (prismer-latex, prismer-jupyter, prismer-component, prismer-workspace-sync) installed at `/home/user/.local/bin/` |
| `container-gateway` | 1.1.0 | Reverse Proxy | Zero-dependency Node.js proxy routing to 5 internal services |

**Directive pipeline**: Agent tools write JSON files to `/workspace/.openclaw/directives/`. The Bridge API (`/api/v2/im/bridge/[workspaceId]`) reads these files via `docker exec`, parses them into `UIDirective` objects, and clears processed files. Three sources are checked in order: (1) WebSocket tool events, (2) directive files from prismer-* tools, (3) filesystem scan fallback.

## 14. CI/CD & Deployment

- **CI**: GitLab CI (`.gitlab-ci.yml`) — build → deploy → k8s-deploy (ArgoCD)
- **Docker (app)**: Multi-stage build (node:20-alpine), standalone output
- **Docker (agent)**: `docker.prismer.dev/prismer-academic:v5.0-openclaw` — academic tools + unified gateway
- **Runtime env**: DATABASE_URL, REDIS_URL, AWS credentials via `docker run -e`
- **Desktop**: Tauri 2 (macOS)
- **Mobile**: Tauri 2 iOS (WKWebView, iPhone 16 Pro Max simulator)

## 15. Test Infrastructure

Four-layer test system covering unit through full E2E:

| Layer | Tool | Location | Scope | Files | Tests |
|-------|------|----------|-------|-------|-------|
| Unit | Vitest + jsdom | `tests/unit/` | Stores, hooks, API handlers, directive mapping | 8 | ~50+ |
| L1 | Playwright | `tests/layer1/` | Container API — health, bridge, directive SSE, context, data tools | 5 | 21 |
| L2 | Playwright + Chrome | `tests/layer2/` | Mock frontend — directive injection, component rendering, MVP scenarios | 7 | 32 |
| L3 | Playwright + Chrome | `tests/layer3/` | Real Agent E2E — LLM inference, tool calls, directive generation | 2 | 6 |

**Commands**: `npx vitest` (unit) | `npm run test:layer1` | `npm run test:layer2` | `npm run test:layer3` | `npm run test:e2e` (all)

**Test Helpers** (`tests/helpers/`):
- `mock-agent.ts`: `mockAgentReady()` intercepts API routes; `forceAgentRunning()` sets store state + expands chat; `injectDirective()` dispatches plugin directives via window
- `playwright-utils.ts`: `waitForWorkspace()`, `waitForActiveComponent()`, `capture()` screenshots
- `trace-collector.ts`: MutationObserver-based trace for directive/store events
- `api-client.ts`: REST helpers for bridge, context, health, directive collection
- `setup-vitest.ts`: Global mocks (ResizeObserver, matchMedia, IntersectionObserver)

**Window-exposed stores** (dev only, via `useDirectiveStream.ts`):
`__agentInstanceStore`, `__componentStore`, `__chatStore`, `__layoutStore`, `__executeDirective`, `__mapPluginDirective`

**Test scenarios**: T0 (agent identity chat), T1 (LaTeX CVPR template + compile), T2 (Jupyter plot + gallery), T3 (notes template), T4 (PDF reader directives), T5 (workspace context sync), component CRUD (8-type switching, data injection, rapid switch)
