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

# SCHEME — Database Schema Alignment

> Last verified: 2026-05-13
> Source: `prisma/schema.prisma` (38 models + AgentCronJob planned)
> Dev: SQLite | Prod: Remote MySQL (prismer_info)

---

## 1. Users & Auth (4 models)

### User
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| email | String @unique | |
| password | String? | nullable for OAuth-only |
| name, avatar, bio, organization | String? | profile fields |
| googleId, githubId | String? @unique | OAuth identifiers |
| isActive | Boolean | default true |
| emailVerified | Boolean | default false |
| lastLoginAt | DateTime? | |
| createdAt, updatedAt | DateTime | |

**Relations**: notebooks, notes, favorites, likes, comments, activities, uploads, paperStates, sessions, accounts, workspaces (WorkspaceSession[]), wsParticipants, agentInstances, llmUsageLogs, imUser

### Account (NextAuth)
| Field | Type | Notes |
|-------|------|-------|
| provider + providerAccountId | @@unique | composite key |
| userId | String | FK → User |
| type, refresh_token, access_token, etc. | | standard NextAuth fields |

### Session (NextAuth)
| Field | Type | Notes |
|-------|------|-------|
| sessionToken | String @unique | |
| userId | String | FK → User |
| expires | DateTime | |

### VerificationToken
| Field | Type | Notes |
|-------|------|-------|
| identifier + token | @@unique | |
| expires | DateTime | |

---

## 2. Papers & OCR (3 models)

### Paper
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| title | String | |
| abstract | String? | |
| authors | String? | JSON: `["Author 1", "Author 2"]` |
| categories | String? | JSON: `["cs.AI", "cs.LG"]` |
| mainCategory | String? | |
| platform | String | default "arxiv" |
| arxivId | String? @unique | |
| doi | String? | |
| pdfUrl, thumbnailUrl, s3Key | String? | resource links |
| viewCount, likeCount, commentCount | Int | default 0 |
| publishedAt | DateTime? | |

**Relations**: favorites, likes, comments, citations (NoteCitation), paperStates, ocrTask, figures

### OcrTask
| Field | Type | Notes |
|-------|------|-------|
| paperId | String @unique | 1:1 with Paper |
| status | String | pending → processing → completed → failed |
| s3Bucket, s3BasePath | String? | S3 storage location |
| mdFileName | String? | default "output.md" |
| jsonFileName | String? | default "result.json" |
| pageCount, imageCount, tableCount, equationCount, charCount | Int | content stats |
| processingMs | Int? | performance metric |

### Figure
| Field | Type | Notes |
|-------|------|-------|
| paperId | String | FK → Paper |
| pageNumber, figureIndex | Int | position |
| type | String | image / table / equation |
| caption | String? | |
| s3Key | String? | |

---

## 3. Notebooks & Notes (3 models)

### Notebook
| Field | Type | Notes |
|-------|------|-------|
| userId | String | FK → User |
| name | String | |
| description, color, icon | String? | |
| isPublic | Boolean | default false |

### Note
| Field | Type | Notes |
|-------|------|-------|
| notebookId | String | FK → Notebook |
| userId | String | FK → User |
| title | String? | |
| content | String | HTML or Markdown |
| contentFormat | String | default "html" |
| tags | String? | JSON string |

### NoteCitation
| Field | Type | Notes |
|-------|------|-------|
| noteId | String | FK → Note |
| paperId | String | FK → Paper |
| pageNumber | Int? | |
| excerpt | String? | |
| type | String | default "text" |

---

## 4. Social (5 models)

### Favorite
- `userId + paperId` @@unique

### Like
- `userId + paperId` @@unique

### Comment
- Self-referencing: `parent Comment?` + `replies Comment[]` ("CommentReplies")
- Fields: content, likeCount, isDeleted

### Activity
- Fields: userId, paperId?, action (view/like/favorite/comment/download/search), metadata (JSON)
- Index: `[userId, createdAt]`

### UserPaperState
- Composite PK: `@@id([userId, paperId])`
- Fields: isFavorite, isDownloaded, readingProgress (0-100), lastReadPage, totalReadTime, lastReadAt

---

## 5. Upload (1 model)

### Upload
| Field | Type | Notes |
|-------|------|-------|
| userId | String | FK → User |
| fileName, fileSize | String, Int | |
| contentHash | String? | dedup check |
| s3Key | String | |
| status | String | pending → uploading → processing → completed → failed |
| paperId | String? | linked paper after OCR |
| error | String? | |

---

## 6. Workspace (10 models)

### WorkspaceSession
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| name | String | display name |
| description | String? | |
| ownerId | String | FK → User |
| status | String | active / archived |
| settings | String? | JSON: WorkspaceSettings |

**Relations**: messages, tasks, participants, timeline, snapshots, componentStates, agentInstance (1:1), workspaceFiles, wsSnapshots, mcpTokens

### WorkspaceParticipant
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| userId | String? | FK → User (nullable for agents) |
| agentId | String? | |
| name, avatar | String | |
| type | String | user / agent |
| role | String | owner / member / agent / collaborator / advisor |
| status | String | online / offline / busy |
| capabilities | String? | JSON: string[] |

@@unique([workspaceId, userId])

### WorkspaceMessage
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| senderId | String | participant ID |
| senderType | String | user / agent |
| senderName, senderAvatar | String | |
| content | String | message text |
| contentType | String | text / markdown / code / image / file |
| actions | String? | JSON: AgentAction[] |
| interactive | String? | JSON: InteractiveComponent[] |
| uiDirectives | String? | JSON: UIDirective[] |
| agentHandoff | String? | JSON: AgentHandoff |
| references | String? | JSON: string[] |
| replyTo | String? | |
| metadata | String? | JSON: Record<string, unknown> |

Index: `[workspaceId, createdAt]`

### WorkspaceTask
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| title | String | |
| description | String? | |
| status | String | pending / running / completed / error |
| progress | Int | 0-100 |
| subtasks | String? | JSON: SubTask[] |
| outputs | String? | JSON: TaskOutput[] |
| dependencies | String? | JSON: string[] (task IDs) |
| startTime, endTime | DateTime? | |

### WorkspaceTimelineEvent
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| timestamp | BigInt | epoch milliseconds |
| componentType | String | |
| action | String | edit / create / delete / navigate / execute / workflow_* / agent_* / user_* |
| description | String | |
| snapshot | String? | JSON: StateSnapshot |
| actorId, actorType | String? | |
| messageId | String? | |
| duration | Int? | |

Index: `[workspaceId, timestamp]`

### WorkspaceStateSnapshot
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| layout | String? | JSON: LayoutState |
| components | String? | JSON: ComponentStates |
| diff | String? | JSON: DiffState |
| timelineEventId | String? | |

### WorkspaceComponentState
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| componentType | String | ComponentType enum value |
| state | String | JSON: component-specific state |

@@unique([workspaceId, componentType])

### WorkspaceFile
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| path | String | relative path: IDENTITY.md, skills/latex/SKILL.md |
| content | String | file content |
| contentHash | String | SHA256 for sync |

@@unique([workspaceId, path])

### WorkspaceSnapshot
| Field | Type | Notes |
|-------|------|-------|
| workspaceId | String | FK → WorkspaceSession |
| version | Int | |
| description | String? | |
| filesManifest | String | JSON: [{path, hash}] |

@@unique([workspaceId, version])

### WorkspaceMcpToken
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| workspaceId | String | FK → WorkspaceSession (cascade delete) |
| tokenHash | String @unique | SHA-256 of plaintext bearer |
| prefix | String | `pmsk_` + first 8 random chars (13 total); shown in UI |
| name | String | user-supplied label |
| lastUsedAt | DateTime? | updated fire-and-forget on each request |
| expiresAt | DateTime? | optional; not exposed in Phase 1 UI |
| revokedAt | DateTime? | non-null means revoked |
| createdBy | String | issuing userId |
| createdAt | DateTime | default now() |

Indexes: `[workspaceId]`, `[tokenHash]`

Used by the workspace MCP surface (`/api/mcp/workspace/[id]/`) to authenticate external agents (Hermes, Claude Desktop, Cursor, Codex) reaching the workspace from outside the OpenClaw container path. Plaintext is returned **once** at create; only the hash is persisted. See `docs/plans/2026-04-28-workspace-mcp-design.md` §2.

---

## 7. Agent & IM (12 models)

> **Cloud SDK Mapping**: The IM models align with `@prismer/sdk` v1.7 types.
> - `IMUser` → `IMUser` (SDK)
> - `IMAgentCard` → `IMAgentCard` (SDK)
> - `IMConversation` → `IMConversation` (SDK)
> - `IMMessage` → `IMMessage` (SDK)
> - Registration via `client.im.account.register()` creates both IMUser and IMAgentCard
> - Workspace-IM binding via `client.im.workspace.init()` creates IMConversation linked to WorkspaceSession

### AgentInstance
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| name | String | |
| ownerId | String | FK → User |
| workspaceId | String @unique | 1:1 → WorkspaceSession |
| containerId | String? | Docker container ID |
| status | String | stopped / starting / running / error |
| gatewayUrl | String? | OpenClaw Gateway URL |
| configId | String? | FK → AgentConfig |
| capabilities | String? | JSON: string[] |
| metadata | String? | JSON |
| lastActiveAt | DateTime? | |

**Relations**: owner, workspace, config, container, deployments, usageLogs, cronJobs

### AgentConfig
| Field | Type | Notes |
|-------|------|-------|
| name | String | |
| templateType | String? | academic-researcher / data-scientist / paper-reviewer |
| modelProvider | String | default "anthropic" |
| modelName | String | default "claude-sonnet-4-20250514" |
| systemPrompt | String? | |
| skills | String? | JSON: SkillConfig[] |
| tools | String? | JSON: ToolConfig[] |
| sandbox | String? | JSON: SandboxConfig |
| customConfig | String? | JSON |
| isTemplate | Boolean | default false |
| isPublic | Boolean | default false |

### Container
| Field | Type | Notes |
|-------|------|-------|
| agentInstanceId | String @unique | 1:1 → AgentInstance |
| orchestrator | String | docker / kubernetes / podman |
| containerId | String | actual container ID |
| imageTag | String | |
| status | String | pending / created / running / stopped / error |
| hostPort | Int? | |
| gatewayPort | Int | default 18789 (OpenClaw) |
| resourceLimits | String? | JSON |
| healthStatus | String? | JSON |

### ConfigDeployment
| Field | Type | Notes |
|-------|------|-------|
| agentInstanceId | String | FK → AgentInstance |
| configId | String? | FK → AgentConfig (nullable) |
| version | Int | deployment version |
| status | String | pending / deploying / deployed / failed |
| deployedConfig | String | JSON: full config snapshot |

### LLMUsageLog
| Field | Type | Notes |
|-------|------|-------|
| agentInstanceId | String | FK → AgentInstance |
| userId | String | FK → User |
| provider | String | anthropic / openai / prismer |
| model | String | model name |
| inputTokens, outputTokens, totalTokens | Int | |
| costUsd | Float | default 0 |
| latencyMs | Int | |
| requestId | String? | external request ID |

### AgentCronJob
| Field | Type | Notes |
|-------|------|-------|
| id | String @id | cuid |
| agentInstanceId | String | FK → AgentInstance |
| name | String | human-readable job name |
| schedule | String | JSON: `{ kind: 'daily'|'interval'|'weekly'|'cron', at?, everyMs?, expr?, tz? }` |
| sessionTarget | String | `main` (continue context) or `isolated` (fresh session) |
| payload | String | JSON: `{ kind: 'systemEvent'|'agentTurn'|'wakeMode', text?, message?, model?, thinking? }` |
| delivery | String? | JSON: `{ mode: 'broadcast'|'direct', channel?, to? }` |
| enabled | Boolean | default true |
| gatewayJobId | String? | ID from OpenClaw gateway `/jobs` endpoint |
| lastRunAt | DateTime? | |
| nextRunAt | DateTime? | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

**Relations**: agent (AgentInstance)
**Index**: `[agentInstanceId]`

### IMUser
| Field | Type | Notes |
|-------|------|-------|
| username | String @unique | |
| displayName | String | |
| role | String | human / agent / admin |
| agentType | String? | assistant / specialist / orchestrator / tool / bot |
| userId | String? @unique | FK → User (optional) |

**Relations**: agentCard (1:1), participations, sentMessages, createdConversations

### IMAgentCard
| Field | Type | Notes |
|-------|------|-------|
| imUserId | String @unique | 1:1 → IMUser |
| name, description | String | |
| agentType | String | default "assistant" |
| capabilities | String | JSON: AgentCapability[] |
| protocolVersion | String | default "1.0" |
| endpoint | String? | HTTP endpoint |
| status | String | online / busy / idle / offline |
| load | Float | 0-1 utilization |

### IMConversation
| Field | Type | Notes |
|-------|------|-------|
| type | String | direct / group / channel |
| title, description | String? | |
| status | String | active / archived / deleted |
| createdById | String | FK → IMUser |
| workspaceId | String? @unique | optional 1:1 → Workspace |

### IMParticipant
| Field | Type | Notes |
|-------|------|-------|
| conversationId | String | FK → IMConversation |
| imUserId | String | FK → IMUser |
| role | String | owner / admin / member / observer |

@@unique([conversationId, imUserId])

### IMMessage
| Field | Type | Notes |
|-------|------|-------|
| conversationId | String | FK → IMConversation |
| senderId | String | FK → IMUser |
| type | String | text / markdown / code / image / file / tool_call / tool_result / system_event / thinking |
| content | String | |
| metadata | String | JSON: MessageMetadata |
| parentId | String? | threading |
| status | String | sending / sent / delivered / read / failed |

### IMWebhook
| Field | Type | Notes |
|-------|------|-------|
| url | String | |
| events | String | JSON: string[] |
| secret | String? | |
| active | Boolean | default true |
| failureCount | Int | |

---

## 8. Cache (1 model)

### StatsCache
| Field | Type | Notes |
|-------|------|-------|
| key | String @unique | |
| value | String | JSON |
| expiresAt | DateTime | |

---

## 9. Remote MySQL Mapping

The remote MySQL database (`prismer_info`) has a different naming convention:

| Prisma Model | MySQL Table | Notes |
|-------------|-------------|-------|
| Paper (partial) | `documents` | 12,199 records, main paper table |
| Upload / Asset | `po_user_assets` | User-owned assets |
| Collection | `po_user_collections` | User collections |
| - | `po_collection_assets` | Collection membership |
| User (partial) | `users` | User accounts |
| - | `document_references` | Citations (empty) |

**Important**: Remote MySQL tables use `INT` for user IDs, while Prisma uses `String` (cuid). The `remote-db.ts` module handles this mapping.

### Workspace MySQL Tables (Planned)

When migrating workspace persistence from JSON files to MySQL:

| Prisma Model | MySQL Table |
|-------------|-------------|
| WorkspaceSession | `po_workspace_sessions` |
| WorkspaceMessage | `po_workspace_messages` |
| WorkspaceTask | `po_workspace_tasks` |
| WorkspaceTimelineEvent | `po_workspace_timeline` |

---

## 10. Key Relationships

```
User ──1:N──> WorkspaceSession ──1:1──> AgentInstance ──1:1──> Container
                    │                        │
                    ├──1:N──> WorkspaceMessage    ├──1:N──> ConfigDeployment
                    ├──1:N──> WorkspaceTask       ├──N:1──> AgentConfig
                    ├──1:N──> WorkspaceParticipant ├──1:N──> LLMUsageLog
                    │                              └──1:N──> AgentCronJob
                    ├──1:N──> WorkspaceTimelineEvent
                    ├──1:N──> WorkspaceComponentState
                    ├──1:N──> WorkspaceFile
                    ├──1:N──> WorkspaceSnapshot
                    └──1:N──> WorkspaceMcpToken

User ──1:1──> IMUser ──1:1──> IMAgentCard
                 │
                 ├──1:N──> IMConversation ──1:N──> IMMessage
                 └──N:M──> IMConversation (via IMParticipant)

User ──1:N──> Paper (via Favorite/Like/Comment/UserPaperState)
User ──1:N──> Notebook ──1:N──> Note ──N:M──> Paper (via NoteCitation)
```

## 11. JSON Field Convention

All JSON data is stored as `String` type in Prisma (SQLite compatibility). Each JSON field has a comment indicating the expected structure:

```prisma
actions    String?  // JSON: AgentAction[]
interactive String? // JSON: InteractiveComponent[]
metadata   String?  // JSON: Record<string, unknown>
```

**Parsing**: Always use `JSON.parse()` with try-catch when reading JSON fields. Arrays like `authors` and `categories` on Paper are also JSON-encoded strings.

---

## 12. IM API Routes (v2)

The IM system provides REST API routes for message persistence, aligned with @prismer/sdk v1.7:

### `/api/v2/im/register`
| Method | Purpose | Auth | Request Body |
|--------|---------|------|--------------|
| POST | Register agent/user | None | `{ type, username, displayName, agentType?, capabilities?, endpoint? }` |

**Response**: `{ ok, data: { imUserId, username, token, expiresIn, isNew } }`

### `/api/v2/im/conversations`
| Method | Purpose | Auth | Request Body |
|--------|---------|------|--------------|
| GET | List user conversations | Bearer / x-im-user-id | Query: `?type=&limit=&offset=` |
| POST | Create conversation | Bearer / x-im-user-id | `{ type, title?, memberIds?, metadata? }` |

### `/api/v2/im/conversations/[id]`
| Method | Purpose | Auth | Request Body |
|--------|---------|------|--------------|
| GET | Get conversation details | Bearer / x-im-user-id | - |
| PATCH | Add/remove participant | Bearer / x-im-user-id | `{ action: 'add_participant' \| 'remove_participant', userId, role? }` |

### `/api/v2/im/conversations/[id]/messages`
| Method | Purpose | Auth | Request Body |
|--------|---------|------|--------------|
| GET | Get message history | Bearer / x-im-user-id | Query: `?limit=&offset=&before=` |
| POST | Send message | Bearer / x-im-user-id | `{ content, type?, parentId?, metadata? }` |

### `/api/v2/im/workspace/[workspaceId]`
| Method | Purpose | Auth | Request Body |
|--------|---------|------|--------------|
| GET | Get workspace IM info | x-user-id | - |
| POST | Initialize workspace IM | x-user-id | `{ users?, title?, agentIds? }` |
| PUT | Add agent to workspace | x-user-id | `{ agentId }` |

**Authentication**:
- Bearer token: Base64-encoded JSON `{ imUserId, username, role, exp }`
- Header fallback: `x-im-user-id` for development

**Message Types** (SDK v1.7 aligned):
- `text`, `markdown`, `code`, `image`, `file`
- `tool_call`, `tool_result`, `thinking`, `system_event`
