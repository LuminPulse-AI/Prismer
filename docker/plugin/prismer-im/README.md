# prismer-im

> OpenClaw Channel Plugin for Prismer.AI IM Server

**Version:** 0.2.0
**Package:** `prismer-im`
**Type:** OpenClaw Channel Plugin

## Overview

Bridges the Prismer Cloud IM system with the OpenClaw agent running inside a container. Messages flow bidirectionally:

- **Inbound:** IM Server → Plugin → Agent (user messages routed to agent)
- **Outbound:** Agent → Plugin → IM Server (agent responses posted back)

Uses `@prismer/sdk` v1.7 for all IM operations (WebSocket, REST, file uploads).

## Architecture

```
Prismer Cloud IM                    Container
┌──────────────┐      SDK v1.7     ┌───────────────────┐
│  IM Server   │ ←──────────────── │  prismer-im        │
│  (WebSocket) │ ──────────────→   │  (Channel Plugin)  │
└──────────────┘                   │       ↕             │
                                   │  OpenClaw Agent     │
                                   └───────────────────┘
```

### Channel Plugin Model

- **Accounts:** Multi-account support — each account connects to one IM conversation
- **Outbound Delivery:** Direct mode, text chunking at 4000 chars
- **Heartbeat:** Periodic ready-state checks with status snapshots
- **Gateway Monitor:** Autonomous message monitoring loop with AbortSignal

## Message Types

| Type | Description |
|------|-------------|
| `text` | Plain text messages |
| `markdown` | Formatted markdown content |
| `code` | Code blocks with language hints |
| `image` | Image attachments |
| `file` | File attachments |
| `tool_call` | Agent tool invocation metadata |
| `tool_result` | Tool execution results |
| `system_event` | System lifecycle events |
| `thinking` | Agent reasoning traces |

## Extensions

Beyond standard IM messaging, the plugin provides two Prismer-specific extensions:

### `sendDirective(directive)`
Sends UI control directives to the frontend via IM message metadata:
- `SWITCH_COMPONENT` — switch active workspace tab
- `JUPYTER_ADD_CELL` — inject code into Jupyter
- `LATEX_COMPILE` — trigger LaTeX compilation
- `PDF_NAVIGATE_TO_PAGE` — scroll PDF reader
- 15+ directive types total (see `src/types.ts`)

### `sendSkillEvent(event)`
Reports skill lifecycle events (start, progress, complete, error) with artifact tracking.

## Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.ts` | Entry | Plugin registration and export |
| `src/channel.ts` | 468 | OpenClaw channel implementation (config, outbound, lifecycle) |
| `src/runtime.ts` | 675 | SDK integration (accounts, WebSocket, message routing) |
| `src/types.ts` | 770 | TypeScript types (messages, directives, skill events, config) |

## Configuration

In `openclaw.json` → `channels.prismer-im`:

```json
{
  "accounts": {
    "default": {
      "imServerUrl": "https://prismer.cloud",
      "conversationId": "workspace-default",
      "agentToken": "<JWT>",
      "capabilities": ["chat", "directive", "skill_event"]
    }
  }
}
```

Environment variables (set by container orchestrator):
- `PRISMER_IM_SERVER_URL` — IM server URL
- `PRISMER_AGENT_TOKEN` — JWT auth token
- `PRISMER_CONVERSATION_ID` — Default conversation binding

## Build

```bash
cd docker/plugin/prismer-im
npm install
npm run build    # → dist/
```

Output: `dist/index.js` + `dist/index.d.ts` + `dist/src/{channel,runtime,types}.js`

## Dependencies

- `@prismer/sdk` ^1.7.0 — Prismer Cloud SDK (IM, Context, Parse APIs)
- `openclaw` (peer) — OpenClaw runtime

## Changelog

### 0.2.0 (2026-02-24)
- Migrate to `@prismer/sdk` v1.7 (replaced custom WebSocket with SDK's `im.realtime.connectWS()`)
- Add `sendDirective()` and `sendSkillEvent()` extensions
- Add message type support for thinking, tool_call, tool_result

### 0.1.0 (2026-02-09)
- Initial channel plugin with basic text messaging
- Custom WebSocket implementation
