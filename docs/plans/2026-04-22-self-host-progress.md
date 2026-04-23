# Self-Host Progress — 2026-04-22

## Summary

Today focused on making the OSS self-host path less cloud-dependent and documenting the current state before pausing.

Branch:

- `fix/update-org-name`

Existing pushed checkpoint from earlier today:

- `94ff6e0` `feat(web): add local assets and multi-workspace flow`

## Completed Today

### Pushed Earlier

- restored multi-workspace behavior for the local owner model
- added local asset and collection models
- added `/api/v2/assets` compatibility routes
- switched note and artifact persistence to local-first storage

### Implemented Locally Today

- changed SDK defaults to prefer local self-host base URLs instead of `prismer.cloud`
- made MCP and OpenClaw channel clients omit `Authorization` when no `PRISMER_API_KEY` is present
- aligned TypeScript, Python, and Go CLI defaults to `local`
- replaced private model gateway defaults in Docker/OpenClaw config with standard OpenAI-compatible defaults

### Continued On 2026-04-23

- installed local Node dependencies for `sdk/mcp`, `sdk/typescript`, and `sdk/openclaw-channel` validation
- verified `sdk/mcp` build and `sdk/typescript` build successfully
- adapted `sdk/openclaw-channel` to the current public `openclaw/plugin-sdk` exports and passed standalone typecheck
- added a first self-host OCR implementation:
  - `/api/papers`
  - `/api/ocr/[paperId]/[...path]`
  - local dataset root support via `web/data/ocr`
  - backward-compatible fallback to legacy `public/data/output`
- updated paper data loaders to normalize `detections.json` payloads from either array or `{ pages: [...] }`
- added a first user-facing OCR import path:
  - `POST /api/papers/upload`
  - local PDF import into `web/data/ocr/<paperId>/`
  - Volcengine LAS PDF parse integration behind `VOLCENGINE_LAS_API_KEY`
  - `PUBLIC_APP_URL` based handoff for self-host deployments that are publicly reachable
- normalized Volcengine parse results into Prismer's existing local OCR dataset contract:
  - `metadata.json`
  - `ocr_result.json`
  - `detections.json`
  - `paper.md`
- updated `PaperLibraryDialog` to:
  - load the current `/api/papers` response shape correctly
  - show imported PDF entries without incorrectly tagging them as `AI Ready`
  - support direct PDF import from the UI
- added a repeatable route-level OCR smoke test:
  - `src/lib/ocr/self-host-smoke.test.ts`
  - covers `POST /api/papers/upload`
  - verifies local OCR dataset materialization
  - verifies `/api/papers` listing
  - verifies imported papers are registered into the local asset library
  - verifies `/api/v2/assets` listing
  - verifies `/api/ocr/*` reads
- added `web/vitest.config.ts` so `@/` aliases resolve in local tests and `.next` artifacts are excluded from test discovery
- updated `/api/papers/upload` so imported papers also create or refresh a local `paper` asset with `metadata.sourceId = <paperId>`
- fixed `/api/v2/assets/[id]/file` so relative internal `externalUrl` targets like `/api/ocr/<paperId>/pdf` redirect correctly instead of failing with 500
- threaded `workspaceId` from the PDF reader import UI into `/api/papers/upload`, so imported papers can be linked into the active workspace collection
- added Volcengine figure image localization:
  - downloads `image_url` artifacts when present
  - stores them under `web/data/ocr/<paperId>/images/*`
  - rewrites detection `metadata.image_path` to local OCR files
- updated the PDF reader image loader to prefer detection-level `image_path` instead of synthetic filenames
- added `npm run test:self-host-ocr` in `web/package.json`
- wired the OCR self-host smoke path into `.github/workflows/ci.yml` as a dedicated `self-host-ocr` job
- updated CI path filtering so workflow-only changes still trigger the web validation jobs
- restored the `pdf-reader` workspace tab in self-host mode by removing it from the disabled component list
- fixed `Skip to workspace` so dismissing the readiness gate also removes the blocking editor overlay
- added a browser-side self-host OCR E2E path:
  - `web/playwright.config.ts`
  - `web/tests/layer2/self-host-ocr-ui.spec.ts`
  - browser-side API mocks for `/api/papers`, `/api/papers/upload`, `/api/v2/assets`, and `/api/ocr/*`
  - stable `data-testid` hooks for the Reader, Paper Library, Asset Browser, and document tabs
- added `npm run test:self-host-ocr-ui` in `web/package.json`
- wired `npm run test:self-host-ocr-ui` into `.github/workflows/ci.yml` as a dedicated Playwright job
- switched Playwright projects to bundled Chromium so local runs and CI use the same browser runtime
- drafted `docs/plans/2026-04-23-hermes-integration-design.md` with an MCP-first Hermes adapter plan instead of a direct OpenClaw replacement

## Validation

Passed:

- `python3 -m py_compile sdk/python/prismer/*.py`
- `go test ./... -run '^$'`
- `bash -n docker/docker-entrypoint-openclaw.sh`
- `jq -c . docker/config/openclaw.json`
- `npm run build` in `sdk/mcp`
- `npm run build` in `sdk/typescript`
- `npx tsc -p tsconfig.json --noEmit` in `sdk/openclaw-channel`
- `npm run build` in `web` after the first OCR route pass
- `npm run test -- src/lib/ocr/volcengine.test.ts` in `web`
- `npm run test -- src/lib/ocr/self-host-smoke.test.ts src/lib/ocr/volcengine.test.ts` in `web`
- `npm run test:self-host-ocr` in `web`
- `npm run test:self-host-ocr-ui` in `web`
- `npm run build` in `web` after adding `/api/papers/upload` and the Volcengine dataset mapper

Previously passed for the workspace/data-plane checkpoint:

- `npm run build` in `web`
- local smoke for workspace creation, notes save, assets listing, asset file fetch, collection lookup, and `/workspace` redirect

## Current Gaps

- OCR import now exists, but local/public input constraints still need clearer product docs and better UX around skipped OCR
- self-host smoke now exists at both the route/test level and the browser-interaction level, and both paths are wired into CI
- skills installation behavior is still not fully honest for self-host users
- local IM/API completeness beyond the current workspace scope is still pending

## Suggested Resume Point

Suggested next step:

1. tighten OCR docs and edge-case UX for `localhost` vs public self-host deployments
2. move on to skills semantics and then local IM completeness
3. evaluate whether the agent runtime should stay OpenClaw-based or gain a second Hermes adapter

## Files Touched Today

- `sdk/mcp/src/*`
- `sdk/openclaw-channel/src/*`
- `sdk/typescript/src/*`
- `sdk/python/prismer/*`
- `sdk/golang/*`
- `docker/docker-entrypoint-openclaw.sh`
- `docker/config/openclaw.json`
- `web/src/app/api/papers/route.ts`
- `web/src/app/api/papers/upload/route.ts`
- `web/src/app/api/ocr/[paperId]/[...path]/route.ts`
- `web/src/lib/ocr/*`
- `web/src/lib/services/asset.service.ts`
- `web/src/lib/storage/*`
- `web/vitest.config.ts`
- `web/src/components/editors/pdf-reader/PDFReaderWrapper.tsx`
- `web/src/components/editors/pdf-reader/index.tsx`
- `web/src/components/editors/pdf-reader/components/PaperLibraryDialog.tsx`
- `web/src/components/editors/pdf-reader/components/DocumentTabs.tsx`
- `web/src/components/editors/pdf-reader/services/paperContextProvider.ts`
- `web/src/app/workspace/components/WorkspaceView.tsx`
- `web/src/app/workspace/components/WindowViewer/ComponentTabs.tsx`
- `web/src/types/workspace.ts`
- `web/playwright.config.ts`
- `web/tests/helpers/*`
- `web/tests/layer2/*`
- `.github/workflows/ci.yml`
- `docs/self-hosting/README.md`
- `docs/plans/*`
