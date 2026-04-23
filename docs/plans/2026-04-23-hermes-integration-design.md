# Hermes Integration Design

## Decision

Prismer should support **Hermes as a second agent runtime**, not as an immediate drop-in replacement for the current OpenClaw-based container stack.

Recommended path:

1. keep the current workspace UI, directive queue, and self-host data plane unchanged
2. add a **Hermes adapter track**
3. use **MCP first** so Hermes can call Prismer capabilities without rewriting the runtime all at once
4. only evaluate full OpenClaw runtime removal after the Hermes path reaches feature parity

This is the lowest-risk way to get Hermes running inside self-host Prismer without breaking the existing workspace flow.

## Why

The current repo is not just “an LLM client plus tools”. It is shaped around three OpenClaw-specific layers:

- gateway protocol and chat bridge  
  - `web/src/lib/container/openclawGatewayClient.ts`
  - `web/src/app/api/v2/im/bridge/[workspaceId]/route.ts`
- runtime/container assumptions  
  - `web/src/lib/container/staticAgentConfig.ts`
  - `docker/config/openclaw.json`
  - `docker/docker-entrypoint-openclaw.sh`
  - `docker/Dockerfile.openclaw`
- workspace tool/plugin runtime  
  - `docker/plugin/prismer-workspace/index.ts`
  - `docker/plugin/prismer-workspace/src/tools.ts`

At the same time, the repo already has two good seams:

- an agent service abstraction  
  - `web/src/lib/agent/types.ts`
  - `web/src/lib/agent/AgentServiceFactory.ts`
- an MCP server package  
  - `sdk/mcp/src/index.ts`

That makes Hermes integration feasible, but it argues for **adapter-first**, not **hard swap first**.

## External Constraints

Hermes gives us two useful migration hooks:

- Hermes supports MCP and discovers external tools into its own runtime:  
  https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Hermes explicitly ships an OpenClaw migration path via `hermes claw migrate`:  
  https://hermes-agent.nousresearch.com/docs/guides/migrate-from-openclaw

But Hermes native tools are self-registered inside its own tool runtime, not OpenClaw plugins:  
https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime

That means the current `@prismer/openclaw-workspace` plugin cannot be reused as-is.

## Critical Gap

`sdk/mcp` is helpful, but it is **not yet the workspace control surface** needed for full Prismer UI parity.

Today `sdk/mcp` exposes:

- `context_load`
- `context_save`
- `parse_document`
- `discover_agents`
- `send_message`

The existing OpenClaw workspace plugin exposes 26 workspace-facing tools such as:

- `update_notes`
- `load_pdf`
- `jupyter_execute`
- `latex_project`
- `switch_component`
- `data_load`

Source:

- `sdk/mcp/src/tools/*`
- `docker/plugin/prismer-workspace/README.md`
- `docker/plugin/prismer-workspace/src/tools.ts`

So Hermes can integrate with Prismer quickly via MCP, but **cannot yet drive the full workspace UX** until we add a Prismer workspace MCP surface.

## Recommended Architecture

### Phase 1: Hermes As External Agent, Prismer As Tool Host

Goal: prove Hermes can operate against a self-hosted Prismer workspace without touching the current OpenClaw runtime.

Approach:

- run Hermes as its own process or container
- configure Hermes to load Prismer MCP
- keep Prismer web app as the system of record for:
  - workspaces
  - assets
  - OCR datasets
  - directive queue
  - UI state

Needed work:

- document a Hermes self-host profile in `docs/self-hosting`
- verify Hermes can call current MCP tools against local Prismer
- add a small Hermes bridge note to the self-host smoke checklist

This phase is low risk, but limited in UX because Hermes still cannot emit the full set of workspace directives.

### Phase 2: Add A Workspace MCP Surface

Goal: let Hermes control the same user-visible workspace flows that OpenClaw controls today.

Approach:

- create a new MCP package or extend `sdk/mcp` with workspace tools
- make those tools call existing Prismer APIs rather than re-implementing editor logic

Minimum tool set:

- `switch_component`
- `update_notes`
- `load_pdf`
- `navigate_pdf`
- `jupyter_execute`
- `latex_project`
- `latex_project_compile`
- `data_load`
- `get_workspace_state`

Implementation rule:

- tools should write through the same backend surfaces already used by the OpenClaw plugin:
  - `/api/agents/:id/directive`
  - `/api/workspace/:id/context`
  - `/api/workspace/:id/files/*`
  - `/api/v2/assets/*`
  - `/api/ocr/*`

This gives Hermes feature parity at the tool level without rewriting the frontend.

### Phase 3: Add Hermes Runtime Selection In Prismer

Goal: let a workspace bind to either OpenClaw or Hermes.

Approach:

- add `hermes` to the agent runtime types
- implement `HermesAgentService`
- extend static runtime config to describe runtime type, endpoint, and auth
- keep the bridge API stable to the frontend

Likely touched files:

- `web/src/lib/agent/types.ts`
- `web/src/lib/agent/AgentServiceFactory.ts`
- `web/src/lib/container/staticAgentConfig.ts`
- new `web/src/lib/agent/HermesAgentService.ts`

Important rule:

- do not make the frontend care whether the runtime is OpenClaw or Hermes
- keep runtime-specific details behind the service layer

### Phase 4: Optional Full Runtime Replacement

Goal: remove the OpenClaw container path entirely.

This should only happen after:

- workspace MCP tools are complete
- Hermes path covers the real self-host workflows
- self-host smoke passes with Hermes selected

This phase likely requires replacing:

- OpenClaw gateway assumptions
- OpenClaw plugin packaging
- Docker image and entrypoint layout

This is a separate migration track, not the first milestone.

## Concrete Work Packages

### Track A: Short-Term POC

1. Add `docs/self-hosting/hermes.md`
2. document Hermes + Prismer MCP local setup
3. verify `sdk/mcp` works from Hermes against self-host Prismer

### Track B: Workspace MCP

1. design tool schemas that mirror the current workspace plugin
2. implement a small first slice:
   - `switch_component`
   - `update_notes`
   - `load_pdf`
3. add smoke coverage for Hermes-facing MCP calls

### Track C: Runtime Adapter

1. add `hermes` service type
2. add `HermesAgentService`
3. add runtime selection in static config
4. preserve current bridge API contract

## What Not To Do First

- do not rewrite `docker/plugin/prismer-workspace` into Hermes native tools on day one
- do not replace `openclawGatewayClient.ts` before a Hermes tool path exists
- do not bind the frontend directly to Hermes-specific APIs
- do not remove OpenClaw support until Hermes passes self-host smoke

## Acceptance Criteria

Hermes integration is “real” only when all of these are true:

- Hermes can call Prismer MCP against local self-host
- Hermes can update at least one real workspace component in the browser
- the same workspace assets and OCR data remain reusable from the existing Prismer UI
- runtime selection is backend-controlled, not frontend-forked
- self-host smoke can run with Hermes enabled

## Recommendation For Next Implementation Step

Start with **Phase 2, not Phase 4**.

Specifically:

1. add a dedicated workspace MCP surface
2. implement `update_notes`, `load_pdf`, and `switch_component`
3. only then add `HermesAgentService`

That gets Hermes into a real Prismer workflow fastest, while keeping the existing OpenClaw path as a safety net.
