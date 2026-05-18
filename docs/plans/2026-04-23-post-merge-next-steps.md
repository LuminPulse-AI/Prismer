# Post-Merge Next Steps

## Current State

- `main` is synced to `a2b57ef`
- PR `#46` is merged
- the self-host workspace and OCR baseline are now on `main`
- the Hermes adapter-first design is documented in `2026-04-23-hermes-integration-design.md`

## Recommended Order

### 1. OCR Self-Host Polish

Close the remaining OCR UX and deployment gaps:

- improve `localhost` fallback behavior when `PUBLIC_APP_URL` is unavailable
- make skipped-OCR states clearer in the UI
- tighten `docs/self-hosting/README.md` with explicit local vs public deployment guidance

### 2. Skills Semantics

Make self-host skills behavior honest:

- either implement real local install
- or explicitly limit self-host to builtin skills in UI and docs

### 3. Local IM Completeness

Reduce dependence on the current bridge path for self-host:

- review `/api/v2/im/bridge/[workspaceId]`
- identify what is still runtime-specific versus truly workspace-local
- add a clearer self-host local messaging contract

### 4. Hermes Track

Follow the adapter-first plan in `2026-04-23-hermes-integration-design.md`:

1. add a workspace MCP surface
2. start with `switch_component`, `update_notes`, and `load_pdf`
3. only then add `HermesAgentService`

## Non-Goals For The Next Pass

- do not reopen the SDK conflict set intentionally excluded from `#46`
- do not replace the OpenClaw runtime first
- do not fork frontend behavior by runtime type
