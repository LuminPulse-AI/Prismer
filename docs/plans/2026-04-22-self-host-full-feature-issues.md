# Self-Host Full-Feature Issue Templates

## Status Update — 2026-04-22

Latest progress note: [2026-04-22-self-host-progress.md](/home/willamhou/codes/Prismer/docs/plans/2026-04-22-self-host-progress.md)

Current state on branch `fix/update-org-name`:

- Issue `1` done and pushed in commit `94ff6e0`
- Issue `2` done and pushed in commit `94ff6e0`
- Issue `3` done and pushed in commit `94ff6e0`
- Issue `4` done and pushed in commit `94ff6e0`
- Issue `7` done and pushed in commit `c20bcd1`
- Issue `5` first pass implemented locally, including `/api/ocr/[paperId]/[...path]`
- Issue `6` now has a first user-facing import path locally, including `POST /api/papers/upload` and Volcengine-backed OCR normalization

Verification snapshot:

- workspace/assets local smoke was completed for issues `1-4`
- `python3 -m py_compile sdk/python/prismer/*.py` passed
- `go test ./... -run '^$'` passed
- `bash -n docker/docker-entrypoint-openclaw.sh` passed
- `jq -c . docker/config/openclaw.json` passed
- `npm run build` in `sdk/mcp` passed
- `npm run build` in `sdk/typescript` passed
- `npx tsc -p tsconfig.json --noEmit` in `sdk/openclaw-channel` passed
- `npm run test -- src/lib/ocr/volcengine.test.ts` in `web` passed
- `npm run test -- src/lib/ocr/self-host-smoke.test.ts src/lib/ocr/volcengine.test.ts` in `web` passed
- `npm run test:self-host-ocr` in `web` passed
- `npm run test:self-host-ocr-ui` in `web` passed
- `npm run build` in `web` passed after adding `/api/papers/upload`, Volcengine OCR mapping, and the Paper Library import UI
- imported papers now also register as local `paper` assets, which closes the paper-library-to-asset-browser loop for self-host
- importing a paper from a real workspace now also links that paper into the workspace collection
- Volcengine image URLs are now localized into `images/*` under the local OCR dataset when the provider returns them
- the OCR self-host smoke path is now wired into CI as a dedicated workflow job
- the browser-side self-host OCR flow now has a repeatable Playwright spec and CI job covering `workspace -> Reader -> Paper Library import -> Asset Browser reopen`
- `pdf-reader` is no longer hidden in workspace self-host mode, and dismissing the readiness gate now also clears the blocking editor overlay

Known verification gaps:

- the browser-side OCR flow is now part of CI, but it still relies on mocked provider responses rather than a live OCR backend
- Volcengine OCR currently works best when self-host is publicly reachable via `PUBLIC_APP_URL` or when importing from a public `sourceUrl`
- image extraction from Volcengine output is not fully localized yet; the first pass focuses on Markdown and text-block detections

Recommended next step tomorrow:

1. tighten the self-host docs for Volcengine requirements and localhost fallback behavior
2. continue with issue `9` and issue `10`
3. decide whether Hermes should be added as a second runtime adapter or treated as a larger runtime replacement track

## Scope

Target: a **single-machine, no-auth, self-hosted Prismer** that preserves user-visible functionality as much as possible.

Non-goals for this track:

- OAuth / auth hardening
- multi-tenant cloud control plane
- mandatory dynamic container orchestration
- default dependency on `prismer.cloud`

## Recommended Labels

- `self-host`
- `p0` / `p1` / `p2`
- `backend`
- `frontend`
- `infra`
- `docs`

## P0

### 1. Restore Multi-Workspace In Local Owner Mode

- Priority: `P0`
- Estimate: `0.5-1d`
- Depends on: none

**Problem**

The OSS build is no-auth, but it is also locked to a single default workspace. That removes legitimate workspace functionality instead of only removing auth.

**Scope**

- Keep a fixed local owner model.
- Remove forced redirect to the default workspace.
- Preserve create/list/update/delete workspace flows.

**Files**

- [web/src/app/workspace/[workspaceId]/page.tsx](/home/willamhou/codes/Prismer/web/src/app/workspace/[workspaceId]/page.tsx:1)
- [web/src/app/workspace/page.tsx](/home/willamhou/codes/Prismer/web/src/app/workspace/page.tsx:1)
- [web/src/app/api/workspace/route.ts](/home/willamhou/codes/Prismer/web/src/app/api/workspace/route.ts:1)

**Acceptance Criteria**

- Multiple workspaces can be created and opened locally.
- Visiting `/workspace/:id` no longer rewrites to the default workspace.
- No auth flow is introduced.

### 2. Add Local Asset And Collection Models

- Priority: `P0`
- Estimate: `1.5-2.5d`
- Depends on: none

**Problem**

Asset and collection services are stubs, but multiple UI and API flows assume they exist.

**Scope**

- Add local Prisma-backed models for assets and collections.
- Preserve current numeric `assetId` and `collectionId` API expectations where feasible.
- Store enough metadata for notes, papers, generated artifacts, and collection membership.

**Files**

- [web/prisma/schema.prisma](/home/willamhou/codes/Prismer/web/prisma/schema.prisma:1)
- [web/src/lib/services/asset.service.ts](/home/willamhou/codes/Prismer/web/src/lib/services/asset.service.ts:1)
- [web/src/lib/services/collection.service.ts](/home/willamhou/codes/Prismer/web/src/lib/services/collection.service.ts:1)

**Acceptance Criteria**

- Local DB persists paper and note assets.
- Workspace collection binding works without remote services.
- Existing routes that expect `assetId` or `collectionId` continue to function.

**Risk**

- ID type mismatches will cascade into API and UI changes if not handled deliberately.

### 3. Add `/api/v2/assets` Compatibility API

- Priority: `P0`
- Estimate: `1-1.5d`
- Depends on: issue `2`

**Problem**

The frontend already relies on `/api/v2/assets` and `/api/v2/assets/:id/file`, but those routes do not exist in this repo.

**Scope**

- Implement list/search endpoint for Asset Browser.
- Implement file/content endpoint for asset opening.
- Match the current response shape expected by callers.

**Files**

- [web/src/components/shared/AssetBrowser.tsx](/home/willamhou/codes/Prismer/web/src/components/shared/AssetBrowser.tsx:1)
- [web/src/components/editors/pdf-reader/PDFReaderWrapper.tsx](/home/willamhou/codes/Prismer/web/src/components/editors/pdf-reader/PDFReaderWrapper.tsx:1)
- `web/src/app/api/v2/assets/*`

**Acceptance Criteria**

- Asset Browser lists local assets.
- Selecting a note or paper asset opens it successfully.
- PDF Reader can open paper assets from the asset browser.

### 4. Replace Default S3 Sync With Local File Storage

- Priority: `P0`
- Estimate: `1.5-2d`
- Depends on: issues `2`, `3`

**Problem**

Generated outputs and notes still assume `S3 + remote asset service` as the primary storage path.

**Scope**

- Introduce a local storage backend for generated files and uploaded content.
- Make S3 optional instead of mandatory.
- Rewire note save, artifact save, and directive-triggered sync flows to use local storage by default.

**Files**

- [web/src/app/api/workspace/[id]/notes/route.ts](/home/willamhou/codes/Prismer/web/src/app/api/workspace/[id]/notes/route.ts:1)
- [web/src/app/api/agents/[id]/artifacts/route.ts](/home/willamhou/codes/Prismer/web/src/app/api/agents/[id]/artifacts/route.ts:1)
- [web/src/app/api/agents/[id]/directive/route.ts](/home/willamhou/codes/Prismer/web/src/app/api/agents/[id]/directive/route.ts:1)
- [web/src/lib/services/workspace-file-sync.service.ts](/home/willamhou/codes/Prismer/web/src/lib/services/workspace-file-sync.service.ts:1)

**Acceptance Criteria**

- Notes persist locally and reopen after restart.
- LaTeX compile outputs are saved locally and show up in assets.
- Jupyter or gallery artifacts can be reopened locally.

### 5. Add Read-Only `/api/ocr/*` Routes

- Priority: `P0`
- Estimate: `1-1.5d`
- Depends on: none

**Problem**

The PDF reader expects an OCR API contract, but the repo does not expose the corresponding routes.

**Scope**

- Add route handlers for `metadata.json`, `ocr_result.json`, `detections.json`, `paper.md`, `pdf`, and image assets.
- Serve local OCR datasets in the shape expected by the reader.

**Files**

- [web/src/components/editors/pdf-reader/services/paperContextProvider.ts](/home/willamhou/codes/Prismer/web/src/components/editors/pdf-reader/services/paperContextProvider.ts:1)
- [web/src/lib/storage/mockAdapter.ts](/home/willamhou/codes/Prismer/web/src/lib/storage/mockAdapter.ts:1)
- `web/src/app/api/ocr/*`

**Acceptance Criteria**

- PDF reader can load OCR metadata, markdown, detections, and images through `/api/ocr/*`.
- Missing OCR data degrades gracefully to raw PDF mode.

### 6. Add Local OCR Dataset Import And Indexing

- Priority: `P0`
- Estimate: `1-2d`
- Depends on: issue `5`

**Problem**

Read-only OCR routes are not enough unless users have a standard place to drop self-host OCR datasets and have them indexed.

**Scope**

- Define one local dataset directory layout.
- Add indexing for available papers.
- Support sample dataset import or discovery.

**Files**

- [web/src/lib/storage/mockAdapter.ts](/home/willamhou/codes/Prismer/web/src/lib/storage/mockAdapter.ts:80)
- `web/public/data/output` or replacement local data root
- any helper scripts under `web/scripts/` if needed

**Acceptance Criteria**

- A user can place a dataset under the documented path and see papers appear in the library.
- Paper index no longer depends on hardcoded fallback IDs.

### 7. Remove Cloud And Private Defaults

- Priority: `P0`
- Estimate: `0.5-1d`
- Depends on: none

**Problem**

Several modules still default to `prismer.cloud` or a private model gateway address, which breaks the self-host promise.

**Scope**

- Remove or neutralize cloud defaults.
- Prefer explicit env vars and documented local defaults.
- Audit SDKs and runtime config for self-host-safe defaults.

**Files**

- [docker/docker-entrypoint-openclaw.sh](/home/willamhou/codes/Prismer/docker/docker-entrypoint-openclaw.sh:95)
- [sdk/mcp/src/lib/client.ts](/home/willamhou/codes/Prismer/sdk/mcp/src/lib/client.ts:1)
- [sdk/openclaw-channel/src/api-client.ts](/home/willamhou/codes/Prismer/sdk/openclaw-channel/src/api-client.ts:1)
- [sdk/openclaw-channel/src/accounts.ts](/home/willamhou/codes/Prismer/sdk/openclaw-channel/src/accounts.ts:1)

**Acceptance Criteria**

- Default runtime config does not point to `prismer.cloud`.
- Default model gateway config does not point to a private IP.
- Self-host docs are consistent with runtime defaults.

### 8. Add Self-Host Smoke Test

- Priority: `P0`
- Estimate: `1d`
- Depends on: issues `1-7`

**Problem**

Without an explicit self-host smoke test, regressions toward cloud-only assumptions will reappear quickly.

**Scope**

- Add one automated smoke path for local deployment.
- Cover at least workspace creation, agent response, artifact creation, asset opening, and OCR read.

**Files**

- `.github/workflows/*`
- `web/tests/*`
- `docker/*`

**Acceptance Criteria**

- A documented or CI-backed smoke test exists.
- The smoke test can run against local services without external cloud dependencies.

## P1

### 9. Make Skill Installation Honest

- Priority: `P1`
- Estimate: `1-2d`
- Depends on: none

**Problem**

Skill installation currently updates DB state but does not necessarily install anything usable into the runtime.

**Scope**

- Either implement real local install behavior.
- Or clearly limit the product to builtin skills and adjust UI/API messaging.

**Files**

- [web/src/app/api/skills/[id]/install/route.ts](/home/willamhou/codes/Prismer/web/src/app/api/skills/[id]/install/route.ts:1)
- [web/src/app/api/skills/route.ts](/home/willamhou/codes/Prismer/web/src/app/api/skills/route.ts:1)
- skill manager UI under `web/src/app/workspace/components/SkillManager/*`

**Acceptance Criteria**

- A successful install means the skill is actually usable.
- Or the UI only exposes builtin skills and no misleading install path remains.

### 10. Expose Local IM API And WS/SSE Compatibility Layer

- Priority: `P1`
- Estimate: `2-4d`
- Depends on: none

**Problem**

The repo has IM models and service logic, but not the full local API surface that SDKs and self-host integrations expect.

**Scope**

- Add local `/api/im/*` routes for core messaging flows.
- Expose WS/SSE endpoints for local realtime.
- Keep scope to single-machine self-host compatibility.

**Files**

- [web/src/lib/services/im.service.ts](/home/willamhou/codes/Prismer/web/src/lib/services/im.service.ts:1)
- `web/src/app/api/im/*`

**Acceptance Criteria**

- Local agent and local user messaging work without external IM services.
- Core SDK examples can target the self-host base URL.

### 11. Make SDKs And Plugins First-Class For Self-Host

- Priority: `P1`
- Estimate: `1-2d`
- Depends on: issue `10` if local IM endpoints are included

**Problem**

Even after self-host runtime improvements, SDK docs and defaults still assume cloud deployment.

**Scope**

- Update SDK defaults and examples.
- Add self-host examples for TypeScript, Python, Go, and OpenClaw channel usage.

**Files**

- `sdk/typescript/*`
- `sdk/python/*`
- `sdk/golang/*`
- `sdk/openclaw-channel/*`

**Acceptance Criteria**

- A self-host user can follow docs and target the local deployment directly.
- No SDK README implies cloud is the only supported mode.

## P2

### 12. Hide Or Gate Demo/Mock Paths

- Priority: `P2`
- Estimate: `1-2d`
- Depends on: P0 stability

**Problem**

Several components still surface demo or mock behaviors that can be confused with real product capability.

**Scope**

- Move demo-only behaviors behind an explicit flag.
- Keep default user paths on real functionality.

**Files**

- [web/src/components/editors/jupyter/components/JupyterNotebook.tsx](/home/willamhou/codes/Prismer/web/src/components/editors/jupyter/components/JupyterNotebook.tsx:1)
- [web/src/components/editors/previews/latex-agent/components/AgentChatPanel.tsx](/home/willamhou/codes/Prismer/web/src/components/editors/previews/latex-agent/components/AgentChatPanel.tsx:1)
- [web/src/components/playground/registry.ts](/home/willamhou/codes/Prismer/web/src/components/playground/registry.ts:1)

**Acceptance Criteria**

- Default self-host flows do not rely on mock data.
- Demo functionality is still available for development when explicitly enabled.

### 13. Rewrite OSS Self-Host Documentation

- Priority: `P2`
- Estimate: `0.5-1d`
- Depends on: completion of P0

**Problem**

Current docs still blur the line between the OSS self-host package and cloud/platform capabilities.

**Scope**

- Rewrite README and self-hosting docs around the actual local product.
- Document local storage, OCR dataset path, asset behavior, and skill limitations.

**Files**

- [README.md](/home/willamhou/codes/Prismer/README.md:1)
- [docs/self-hosting/README.md](/home/willamhou/codes/Prismer/docs/self-hosting/README.md:1)
- [docs/CONTRIB.md](/home/willamhou/codes/Prismer/docs/CONTRIB.md:1)

**Acceptance Criteria**

- Docs clearly describe what works in self-host mode.
- Setup instructions do not assume cloud services or private infrastructure.

## Milestones

### Milestone A: Local Workspace And Data Plane

- Issue `1`
- Issue `2`
- Issue `3`
- Issue `4`

### Milestone B: Local OCR And Self-Host Safety

- Issue `5`
- Issue `6`
- Issue `7`
- Issue `8`

### Milestone C: Local Platform Completeness

- Issue `9`
- Issue `10`
- Issue `11`

### Milestone D: Product Cleanup

- Issue `12`
- Issue `13`

## Recommended Execution Order

1. `2` Add local asset and collection models
2. `3` Add `/api/v2/assets` compatibility API
3. `4` Replace default S3 sync with local storage
4. `5` Add read-only `/api/ocr/*` routes
5. `6` Add local OCR dataset import and indexing
6. `1` Restore multi-workspace local owner mode
7. `7` Remove cloud and private defaults
8. `8` Add self-host smoke test
9. `9-13` Complete P1 and P2 items

## Definition Of Done

The self-host track is complete when all of the following are true:

- `docker compose up` yields a usable local product without auth.
- Notes, PDFs, OCR data, LaTeX outputs, notebooks, and generated artifacts persist locally.
- The UI no longer requires cloud-only asset or OCR routes.
- Default config does not point to `prismer.cloud` or private infrastructure.
- A local smoke test covers the main user journey.
