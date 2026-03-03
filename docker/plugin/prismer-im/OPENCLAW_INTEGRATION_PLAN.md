# OpenClaw 集成实施计划

> 版本: 1.0.0
> 日期: 2026-02-09
> 状态: 待实施

---

## 目录

1. [概述](#1-概述)
2. [GAP 分析](#2-gap-分析)
3. [架构设计](#3-架构设计)
4. [数据模型](#4-数据模型)
5. [API 设计](#5-api-设计)
6. [Bootstrap 模板](#6-bootstrap-模板)
7. [实施计划](#7-实施计划)
8. [验收标准](#8-验收标准)

---

## 1. 概述

### 1.1 项目目标

构建基于 OpenClaw 的容器化 Agent 平台，实现：

- **1:1 绑定**: Workspace ↔ AgentInstance ↔ Container
- **快速启动**: 预定义学术 Agent 模板，秒级启动
- **统一计费**: 自有 LLM Gateway 代理所有 API 调用
- **多租户**: K8s 编排，每用户多 Agent 实例
- **云端持久化**: Workspace 配置/记忆独立于容器生命周期
- **多端同步**: 桌面/移动端实时同步

### 1.2 当前状态

| 模块 | 状态 | 说明 |
|------|------|------|
| Prismer IM Plugin | ✅ 完成 | channel.ts, runtime.ts, types.ts |
| gateway.startAccount | ✅ 完成 | 调用 monitorPrismerIM() |
| WebSocket 连接 | ⏸️ 暂缓 | IM Server 端点待实现 |
| 数据模型 | ⚠️ 定义 | Prisma schema 已设计，未迁移 |
| Agent API | ❌ 未开始 | /api/agents/* |
| Workspace 持久化 | ❌ 未开始 | 文件 CRUD + 版本控制 |
| Bootstrap 模板 | ❌ 未开始 | 学术 Agent 模板 |
| LLM Gateway | ❌ 未开始 | 代理服务 |

---

## 2. GAP 分析

### 2.1 设计目标 vs 现状

#### 2.1.1 Workspace 持久化

**目标**: 容器内配置/记忆云端固化

**现状**:
- 容器内 `~/.openclaw/workspace/` 为空
- 无 CRUD API
- 无版本控制

**GAP**:
- 需要 WorkspaceFile 数据模型
- 需要文件 CRUD API
- 需要快照/版本机制

#### 2.1.2 Bootstrap 模板

**目标**: 预定义学术 Agent 配置，快速启动

**OpenClaw Workspace 结构**:
```
~/.openclaw/workspace/
├── IDENTITY.md      # Agent 身份
├── SOUL.md          # 行为准则
├── USER.md          # 用户上下文
├── MEMORY.md        # 长期记忆 (始终加载)
├── AGENTS.md        # 多 Agent 协作
├── TOOLS.md         # 工具配置
├── HEARTBEAT.md     # 健康检查
├── memory/          # 日期化记忆
└── skills/          # Markdown 技能定义
    └── <skill>/SKILL.md
```

**现状**:
- 无标准模板
- 无注入机制

**GAP**:
- 需要学术场景模板设计
- 需要容器启动时注入脚本

#### 2.1.3 LLM Gateway

**目标**: 统一 API 代理，计费追踪

**OpenClaw 配置** (`~/.openclaw/openclaw.json`):
```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "apiKey": "sk-..."
  }
}
```

**现状**:
- 直接调用 Anthropic API
- 无计费追踪

**GAP**:
- 需要 Gateway 代理服务
- 需要用量统计表

#### 2.1.4 多租户编排

**目标**: K8s 每用户多 Agent

**现状**:
- Docker Compose 单机
- 无资源隔离

**GAP**:
- 需要 Helm Chart
- 需要 ResourceQuota 设计

---

## 3. 架构设计

### 3.1 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Prismer.AI Platform                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Desktop   │  │   Mobile    │  │      Admin Console      │  │
│  │  (Tauri 2)  │  │  (Tauri 2)  │  │       (Next.js)         │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
│         │                │                      │                │
│         └────────────────┼──────────────────────┘                │
│                          │                                       │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    API Gateway (Next.js)                   │  │
│  │  /api/workspace/*  /api/agents/*  /api/llm-gateway/*      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│         ┌────────────────┼────────────────┐                     │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Workspace  │  │    Agent    │  │     LLM     │             │
│  │ Persistence │  │  Orchestor  │  │   Gateway   │             │
│  │   Service   │  │   Service   │  │   Service   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   MySQL     │  │  Container  │  │  Anthropic  │             │
│  │  (Prisma)   │  │  Runtime    │  │   Claude    │             │
│  └─────────────┘  │  (Docker/   │  └─────────────┘             │
│                   │   K8s)      │                               │
│                   └──────┬──────┘                               │
│                          │                                       │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   OpenClaw Containers                      │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │  │
│  │  │ Agent 1 │  │ Agent 2 │  │ Agent 3 │  │   ...   │       │  │
│  │  │(User A) │  │(User A) │  │(User B) │  │         │       │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

```
User Action → API Gateway → Service Layer → Container/DB
     │                                            │
     │            ┌──────────────────────────────┘
     │            │
     │            ▼
     │     ┌─────────────┐
     │     │  WebSocket  │ ← 实时同步
     │     │   Server    │
     │     └─────────────┘
     │            │
     └────────────┘
```

### 3.3 模块职责

| 模块 | 职责 |
|------|------|
| Workspace Persistence | 文件 CRUD, 版本控制, 模板注入 |
| Agent Orchestrator | 容器生命周期, 状态管理, 健康检查 |
| LLM Gateway | API 代理, 计费追踪, 限流 |
| Sync Engine | 多端同步, 消息广播 |

---

## 4. 数据模型

### 4.1 核心模型

```prisma
// ============================================================
// Workspace 文件持久化
// ============================================================

model WorkspaceFile {
  id              String   @id @default(cuid())
  workspaceId     String
  path            String                          // 相对路径: IDENTITY.md, skills/latex/SKILL.md
  content         String   @db.LongText
  contentHash     String                          // SHA256 for sync
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  workspace       WorkspaceSession @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, path])
  @@index([workspaceId])
  @@index([updatedAt])
}

model WorkspaceSnapshot {
  id              String   @id @default(cuid())
  workspaceId     String
  version         Int
  description     String?
  filesManifest   String   @db.Text              // JSON: [{path, hash}]
  createdAt       DateTime @default(now())

  workspace       WorkspaceSession @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, version])
  @@index([workspaceId, createdAt])
}

// ============================================================
// Agent 实例 (已设计，待确认)
// ============================================================

model AgentInstance {
  id              String   @id @default(cuid())
  name            String
  avatar          String?
  description     String?
  ownerId         String
  workspaceId     String   @unique
  containerId     String?
  status          String   @default("stopped")   // stopped | starting | running | error
  gatewayUrl      String?
  configId        String?
  capabilities    String?                         // JSON
  metadata        String?  @db.Text
  lastActiveAt    DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  owner           User              @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  workspace       WorkspaceSession  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  config          AgentConfig?      @relation(fields: [configId], references: [id], onDelete: SetNull)
  container       Container?
  usageLogs       LLMUsageLog[]

  @@index([ownerId])
  @@index([status])
}

model Container {
  id              String   @id @default(cuid())
  agentInstanceId String   @unique
  orchestrator    String   @default("docker")    // docker | kubernetes
  containerId     String                          // Docker container ID or K8s pod name
  imageTag        String
  status          String   @default("pending")   // pending | running | stopped | error
  hostPort        Int?
  gatewayPort     Int      @default(18789)
  resourceLimits  String?  @db.Text              // JSON: {cpu, memory}
  healthStatus    String?  @db.Text              // JSON: last health check
  logs            String?  @db.LongText
  startedAt       DateTime?
  stoppedAt       DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  agentInstance   AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)

  @@index([status])
}

// ============================================================
// LLM Gateway 用量追踪
// ============================================================

model LLMUsageLog {
  id              String   @id @default(cuid())
  agentInstanceId String
  userId          String
  provider        String                          // anthropic | openai
  model           String
  inputTokens     Int
  outputTokens    Int
  totalTokens     Int
  costUsd         Decimal  @db.Decimal(10, 6)
  latencyMs       Int
  requestId       String?
  createdAt       DateTime @default(now())

  agentInstance   AgentInstance @relation(fields: [agentInstanceId], references: [id], onDelete: Cascade)
  user            User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([agentInstanceId, createdAt])
  @@index([userId, createdAt])
}

// ============================================================
// Agent 配置模板
// ============================================================

model AgentConfig {
  id              String   @id @default(cuid())
  name            String
  description     String?
  templateType    String?                         // academic-researcher | data-scientist | paper-reviewer
  modelProvider   String   @default("anthropic")
  modelName       String   @default("claude-sonnet-4-20250514")
  systemPrompt    String?  @db.Text
  skills          String?  @db.Text              // JSON: skill names
  tools           String?  @db.Text              // JSON: tool config
  sandbox         String?  @db.Text              // JSON: sandbox config
  customConfig    String?  @db.Text              // JSON: arbitrary config
  isTemplate      Boolean  @default(false)
  isPublic        Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  agents          AgentInstance[]

  @@index([isTemplate])
  @@index([templateType])
}
```

### 4.2 关联修改

```prisma
// WorkspaceSession 添加关联
model WorkspaceSession {
  // ... 现有字段
  agentInstance    AgentInstance?
  workspaceFiles   WorkspaceFile[]
  snapshots        WorkspaceSnapshot[]
}

// User 添加关联
model User {
  // ... 现有字段
  agentInstances   AgentInstance[]
  llmUsageLogs     LLMUsageLog[]
}
```

---

## 5. API 设计

### 5.1 Workspace Files API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/workspace/:id/files` | GET | 列出所有文件 |
| `/api/workspace/:id/files` | POST | 创建文件 |
| `/api/workspace/:id/files/:path` | GET | 读取文件内容 |
| `/api/workspace/:id/files/:path` | PUT | 更新文件内容 |
| `/api/workspace/:id/files/:path` | DELETE | 删除文件 |
| `/api/workspace/:id/files/sync` | POST | 批量同步 (diff-based) |

**请求/响应示例**:

```typescript
// GET /api/workspace/:id/files
{
  success: true,
  data: {
    files: [
      { path: "IDENTITY.md", hash: "abc123", updatedAt: "2026-02-09T..." },
      { path: "skills/latex/SKILL.md", hash: "def456", updatedAt: "..." }
    ]
  }
}

// PUT /api/workspace/:id/files/IDENTITY.md
// Request body
{
  content: "# IDENTITY\nName: Research Assistant\n..."
}
// Response
{
  success: true,
  data: {
    path: "IDENTITY.md",
    hash: "abc123",
    updatedAt: "2026-02-09T..."
  }
}

// POST /api/workspace/:id/files/sync
// Request body
{
  files: [
    { path: "IDENTITY.md", hash: "abc123" },
    { path: "MEMORY.md", hash: "xyz789" }
  ]
}
// Response
{
  success: true,
  data: {
    toUpload: ["MEMORY.md"],      // 客户端需要上传
    toDownload: ["SOUL.md"],      // 客户端需要下载
    conflicts: []                  // 冲突文件
  }
}
```

### 5.2 Workspace Snapshots API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/workspace/:id/snapshots` | GET | 列出快照 |
| `/api/workspace/:id/snapshots` | POST | 创建快照 |
| `/api/workspace/:id/snapshots/:version` | GET | 获取快照详情 |
| `/api/workspace/:id/snapshots/:version/restore` | POST | 恢复到快照 |

### 5.3 Agent API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/agents` | GET | 列出用户的所有 Agent |
| `/api/agents` | POST | 创建 Agent |
| `/api/agents/:id` | GET | 获取 Agent 详情 |
| `/api/agents/:id` | PATCH | 更新 Agent |
| `/api/agents/:id` | DELETE | 删除 Agent |
| `/api/agents/:id/start` | POST | 启动容器 |
| `/api/agents/:id/stop` | POST | 停止容器 |
| `/api/agents/:id/restart` | POST | 重启容器 |
| `/api/agents/:id/status` | GET | 获取状态 |
| `/api/agents/:id/logs` | GET | 获取日志 |
| `/api/agents/:id/health` | GET | 健康检查 |

### 5.4 Agent Config Templates API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/config-templates` | GET | 列出模板 |
| `/api/config-templates/presets` | GET | 系统预设模板 |
| `/api/config-templates/:id` | GET | 获取模板详情 |
| `/api/config-templates/:id/apply` | POST | 应用模板到 Agent |

### 5.5 LLM Gateway API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/llm-gateway/chat` | POST | 代理 Chat 请求 |
| `/api/llm-gateway/usage` | GET | 用量统计 |
| `/api/llm-gateway/usage/:agentId` | GET | Agent 用量 |

---

## 6. Bootstrap 模板

### 6.1 模板目录结构

```
docker/templates/
├── base/                           # 基础模板 (所有模板继承)
│   ├── SOUL.md
│   ├── TOOLS.md
│   └── HEARTBEAT.md
├── academic-researcher/            # 学术研究员
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   └── skills/
│       ├── paper-search/SKILL.md
│       ├── latex-writing/SKILL.md
│       └── data-analysis/SKILL.md
├── data-scientist/                 # 数据科学家
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   └── skills/
│       ├── jupyter/SKILL.md
│       ├── visualization/SKILL.md
│       └── machine-learning/SKILL.md
└── paper-reviewer/                 # 论文审稿人
    ├── IDENTITY.md
    ├── MEMORY.md
    └── skills/
        ├── peer-review/SKILL.md
        ├── citation-check/SKILL.md
        └── plagiarism-detect/SKILL.md
```

### 6.2 IDENTITY.md 模板 (学术研究员)

```markdown
# IDENTITY

## Basic Info
- **Name**: Research Assistant
- **Emoji**: 📚
- **Role**: Academic Research Partner

## Personality
- Rigorous and methodical in research
- Clear and precise in communication
- Proactive in suggesting improvements
- Respectful of academic integrity

## Communication Style
- Use formal academic language when discussing research
- Be concise but thorough in explanations
- Always cite sources when making claims
- Ask clarifying questions when requirements are ambiguous

## Expertise
- Literature review and paper discovery
- LaTeX document preparation
- Data analysis and visualization
- Academic writing and editing
- Citation management
```

### 6.3 SKILL.md 模板 (LaTeX Writing)

```markdown
# LaTeX Writing Skill

## Description
Help users write and compile LaTeX documents for academic papers, theses, and reports.

## Tools Used
- `latex_compile` - Compile LaTeX to PDF
- `latex_update_file` - Update LaTeX source files
- `bibtex_manage` - Manage bibliography

## Capabilities
- Create and edit LaTeX documents
- Manage document structure (chapters, sections)
- Handle mathematical equations and formulas
- Format tables and figures
- Manage references with BibTeX
- Generate PDF output

## Usage Examples

### Create a new paper
When user says: "Create a new paper about machine learning"
1. Create main.tex with article template
2. Add standard academic packages
3. Set up bibliography file
4. Compile initial PDF

### Add equation
When user says: "Add the softmax equation"
1. Find appropriate location in document
2. Insert equation environment
3. Write LaTeX formula
4. Recompile PDF

### Manage citations
When user says: "Add this paper to references"
1. Extract citation info
2. Add to .bib file
3. Insert \cite{} in text
4. Recompile with bibtex
```

### 6.4 Bootstrap 注入脚本

```bash
#!/bin/bash
# docker/scripts/bootstrap-workspace.sh

WORKSPACE_DIR="${HOME}/.openclaw/workspace"
TEMPLATE_TYPE="${AGENT_TEMPLATE:-academic-researcher}"
TEMPLATE_DIR="/opt/prismer/templates/${TEMPLATE_TYPE}"
BASE_DIR="/opt/prismer/templates/base"

# 创建 workspace 目录
mkdir -p "${WORKSPACE_DIR}/skills"
mkdir -p "${WORKSPACE_DIR}/memory"

# 复制基础模板
cp "${BASE_DIR}/SOUL.md" "${WORKSPACE_DIR}/"
cp "${BASE_DIR}/TOOLS.md" "${WORKSPACE_DIR}/"
cp "${BASE_DIR}/HEARTBEAT.md" "${WORKSPACE_DIR}/"

# 复制角色模板
cp "${TEMPLATE_DIR}/IDENTITY.md" "${WORKSPACE_DIR}/"
cp "${TEMPLATE_DIR}/MEMORY.md" "${WORKSPACE_DIR}/"

# 复制 skills
if [ -d "${TEMPLATE_DIR}/skills" ]; then
  cp -r "${TEMPLATE_DIR}/skills/"* "${WORKSPACE_DIR}/skills/"
fi

# 注入用户上下文 (从环境变量)
if [ -n "${USER_CONTEXT}" ]; then
  echo "${USER_CONTEXT}" > "${WORKSPACE_DIR}/USER.md"
fi

# 同步云端文件 (如果存在)
if [ -n "${CLOUD_SYNC_URL}" ]; then
  curl -s "${CLOUD_SYNC_URL}/api/workspace/${WORKSPACE_ID}/files" | \
    jq -r '.data.files[] | .path' | \
    while read path; do
      curl -s "${CLOUD_SYNC_URL}/api/workspace/${WORKSPACE_ID}/files/${path}" | \
        jq -r '.data.content' > "${WORKSPACE_DIR}/${path}"
    done
fi

echo "Workspace bootstrapped with template: ${TEMPLATE_TYPE}"
```

---

## 7. 实施计划

### 7.1 Phase 1: 数据模型 & 基础 API (Week 1)

#### Day 1-2: Prisma Schema 更新

- [ ] 添加 WorkspaceFile 模型
- [ ] 添加 WorkspaceSnapshot 模型
- [ ] 添加 LLMUsageLog 模型
- [ ] 更新 AgentInstance, Container, AgentConfig
- [ ] 运行 `npm run db:generate && npm run db:push`
- [ ] 编写模型单元测试

#### Day 3-4: Workspace Files API

- [ ] `GET /api/workspace/:id/files`
- [ ] `POST /api/workspace/:id/files`
- [ ] `GET /api/workspace/:id/files/:path`
- [ ] `PUT /api/workspace/:id/files/:path`
- [ ] `DELETE /api/workspace/:id/files/:path`
- [ ] 编写 API 测试

#### Day 5: Workspace Sync API

- [ ] `POST /api/workspace/:id/files/sync`
- [ ] 实现 diff-based 同步逻辑
- [ ] 处理冲突检测

### 7.2 Phase 2: Agent API & Orchestrator (Week 2)

#### Day 1-2: Agent CRUD API

- [ ] `GET /api/agents`
- [ ] `POST /api/agents`
- [ ] `GET /api/agents/:id`
- [ ] `PATCH /api/agents/:id`
- [ ] `DELETE /api/agents/:id`

#### Day 3-4: Container Lifecycle API

- [ ] `POST /api/agents/:id/start`
- [ ] `POST /api/agents/:id/stop`
- [ ] `POST /api/agents/:id/restart`
- [ ] `GET /api/agents/:id/status`
- [ ] `GET /api/agents/:id/logs`
- [ ] `GET /api/agents/:id/health`

#### Day 5: Docker Orchestrator

- [ ] 更新 `src/lib/container/dockerOrchestrator.ts`
- [ ] 实现 workspace 挂载
- [ ] 实现 bootstrap 脚本注入
- [ ] 测试容器生命周期

### 7.3 Phase 3: Bootstrap 模板 (Week 3)

#### Day 1-2: 基础模板

- [ ] 创建 `docker/templates/base/`
- [ ] 编写 SOUL.md, TOOLS.md, HEARTBEAT.md

#### Day 3-4: 学术模板

- [ ] 创建 academic-researcher 模板
- [ ] 创建 data-scientist 模板
- [ ] 创建 paper-reviewer 模板
- [ ] 编写各角色 skills

#### Day 5: Bootstrap 机制

- [ ] 编写 bootstrap-workspace.sh
- [ ] 更新 Dockerfile 集成模板
- [ ] 测试模板注入流程

### 7.4 Phase 4: LLM Gateway (Week 4)

#### Day 1-2: Gateway 服务

- [ ] 创建 `src/lib/llm-gateway/`
- [ ] 实现 Anthropic 代理
- [ ] 实现请求/响应日志

#### Day 3-4: 用量统计

- [ ] `POST /api/llm-gateway/chat`
- [ ] `GET /api/llm-gateway/usage`
- [ ] 实现 token 计数
- [ ] 实现成本计算

#### Day 5: OpenClaw 配置注入

- [ ] 生成 openclaw.json 配置
- [ ] 注入 Gateway URL 到容器
- [ ] 测试端到端流程

### 7.5 Phase 5: Store & UI 集成 (Week 5)

#### Day 1-2: Zustand Stores

- [ ] 创建 `src/store/agentInstanceStore.ts`
- [ ] 更新 `workspaceStore.ts` 添加 agent 状态
- [ ] 实现 selector hooks

#### Day 3-4: UI 组件

- [ ] 创建 `AgentStatusBadge.tsx`
- [ ] 创建 `AgentControlPanel.tsx`
- [ ] 更新 `ChatHeader.tsx`
- [ ] 更新 `MobileHeader.tsx`

#### Day 5: 集成测试

- [ ] 桌面端完整流程测试
- [ ] 移动端 Chat 流程测试
- [ ] 多端同步测试

### 7.6 Phase 6: K8s & 优化 (Week 6+)

#### Helm Chart

- [ ] 创建 `docker/helm/prismer-agent/`
- [ ] 定义 values.yaml
- [ ] 实现 ResourceQuota
- [ ] 实现 HPA 配置

#### 优化

- [ ] 消息 Debouncer
- [ ] 连接池优化
- [ ] 缓存策略

---

## 8. 验收标准

### 8.1 功能验收

| 功能 | 验收条件 |
|------|---------|
| Workspace 持久化 | 容器重启后文件保留 |
| Bootstrap 模板 | 新容器 5 秒内启动完成 |
| Agent 管理 | CRUD 操作正常 |
| LLM Gateway | 所有请求记录用量 |
| 多端同步 | 桌面/移动端 1 秒内同步 |

### 8.2 性能指标

| 指标 | 目标值 |
|------|--------|
| 容器启动时间 | < 5s |
| API 响应时间 | < 200ms (P95) |
| 文件同步延迟 | < 1s |
| 内存占用 (单容器) | < 512MB |

### 8.3 测试覆盖

| 类型 | 覆盖率要求 |
|------|-----------|
| 单元测试 | > 80% |
| API 测试 | 100% 端点 |
| 集成测试 | 核心流程 |
| E2E 测试 | 桌面/移动端 |

---

## 附录

### A. 文件清单

**新建文件**:
```
prisma/schema.prisma                    # 更新
src/app/api/workspace/[id]/files/
  route.ts                              # 列表 + 创建
  [path]/route.ts                       # CRUD
  sync/route.ts                         # 同步
src/app/api/workspace/[id]/snapshots/
  route.ts                              # 列表 + 创建
  [version]/route.ts                    # 详情
  [version]/restore/route.ts            # 恢复
src/app/api/agents/
  route.ts                              # 列表 + 创建
  [id]/route.ts                         # CRUD
  [id]/start/route.ts
  [id]/stop/route.ts
  [id]/restart/route.ts
  [id]/status/route.ts
  [id]/logs/route.ts
  [id]/health/route.ts
src/app/api/config-templates/
  route.ts
  presets/route.ts
  [id]/route.ts
  [id]/apply/route.ts
src/app/api/llm-gateway/
  chat/route.ts
  usage/route.ts
  usage/[agentId]/route.ts
src/lib/llm-gateway/
  index.ts
  anthropic.ts
  usage.ts
src/store/agentInstanceStore.ts
src/app/workspace/components/
  AgentStatusBadge.tsx
  AgentControlPanel.tsx
docker/templates/
  base/
  academic-researcher/
  data-scientist/
  paper-reviewer/
docker/scripts/
  bootstrap-workspace.sh
docker/helm/prismer-agent/
  Chart.yaml
  values.yaml
  templates/
```

### B. 依赖项

```json
{
  "dependencies": {
    "dockerode": "^4.0.0"
  }
}
```

### C. 环境变量

```bash
# Container
AGENT_TEMPLATE=academic-researcher
WORKSPACE_ID=cuid...
CLOUD_SYNC_URL=https://api.prismer.ai
USER_CONTEXT="Name: User\nTimezone: Asia/Shanghai"

# LLM Gateway
LLM_GATEWAY_URL=https://api.prismer.ai/llm-gateway
LLM_GATEWAY_API_KEY=pk_...
```

---

*文档结束*
