# Prismer Web Codebase Review

> Date: 2026-03-03 | Branch: feat/workspace-integration
>
> Methodology: Three parallel analysis passes (frontend quality, API/data layer,
> feature completeness) followed by three independent verification passes against
> the actual codebase. All claims below have been fact-checked.

---

## Executive Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Feature completeness | ~80% | Core editors, agent chat, container orchestration working |
| Production readiness | ~40% | Missing auth, tests, error pages, a11y |
| Code quality | 65% | Good store architecture, but over-subscription + large files |
| Security | 30% | No auth, 4 XSS vectors, no CSRF, no rate limiting |

---

## 1. Performance: Store Over-Subscription

**Status: CONFIRMED (original "154+" number overstated)**

### Actual Numbers

| Component | Store Used | Hook Count |
|-----------|-----------|------------|
| WorkspaceView | `useWorkspaceStore` (aggregated) | 22 selectors |
| WorkspaceView | `useAgentInstanceStore` | 7 selectors |
| WindowViewer | `useComponentStore` (domain) | 3 selectors |
| WorkspaceChat | `useChatStore` (domain) | 5 selectors |
| ActionBar | `useWorkspaceStore` (aggregated) | 1 selector |

**Composed store total: 47 state fields + 57 actions = 104 exports**

### Root Cause

`WorkspaceView` calls `useWorkspaceStore` 22 times. This aggregated store merges
7 domain stores via `Object.assign()`. When ANY nested store field changes
(e.g. `agentInstanceStatus`), all 22 selectors re-evaluate, causing unnecessary
prop changes cascading to WindowViewer, WorkspaceChat, etc.

**Key insight**: Child components (WorkspaceChat, WindowViewer) already use domain
stores correctly — only WorkspaceView still uses the deprecated aggregated store.

### Fix

Replace 22 `useWorkspaceStore(s => s.field)` calls with direct domain store imports:

```typescript
// Before (22 aggregated hooks)
const messages = useWorkspaceStore((s) => s.messages);
const chatExpanded = useWorkspaceStore((s) => s.chatExpanded);

// After (grouped by domain)
const messages = useChatStore((s) => s.messages);
const chatExpanded = useLayoutStore((s) => s.chatExpanded);
```

This reduces subscriptions from 22 aggregated → ~7 domain-scoped hooks.

**Effort**: Low | **Impact**: High (eliminates cascading re-renders)

### References

- `web/src/app/workspace/components/WorkspaceView.tsx` lines 63-87, 152-158
- `web/src/app/workspace/stores/index.ts` lines 63-147
- Domain stores: `layoutStore.ts`, `chatStore.ts`, `taskStore.ts`, `componentStore.ts`, `timelineStore.ts`

---

## 2. Security

**Status: ALL 5 CLAIMS CONFIRMED**

### 2.1 No Authentication (CRITICAL)

Every API route uses a hardcoded `getCurrentUserId()` that auto-creates a
`dev-user` if none exists. No session validation, no JWT, no token checks.

**Affected routes:**

| Route | Pattern |
|-------|---------|
| `app/workspace/page.tsx:17-31` | Creates `dev-user` on page load |
| `api/workspace/route.ts:15-29` | Same pattern for GET/POST |
| `api/workspace/[id]/route.ts:17-31` | Same pattern for GET/PATCH/DELETE |
| `api/workspace/[id]/messages/route.ts:117` | Hardcodes sender to `'user-1'` |

**Any client can access/modify any workspace without authentication.**

### 2.2 XSS via dangerouslySetInnerHTML (HIGH)

8 total uses found — **4 unprotected, 2 properly sanitized, 2 safe (static content):**

| File | Line | Source | Sanitized? |
|------|------|--------|-----------|
| LatexEditorPreview.tsx | 1712 | LaTeX → HTML regex conversion | NO |
| AiEditorPreview.tsx | 637 | Store content (`fallbackHtml`) | NO |
| WindowViewer/index.tsx | 109 | Store content (`aiEditorHtml`) | NO |
| ArtifactsPanel.tsx | 507 | Artifact HTML | NO |
| OutputArea.tsx | 358 | Jupyter HTML output | YES (DOMPurify) |
| OutputArea.tsx | 432 | Jupyter SVG output | YES (DOMPurify) |
| siri-orb.tsx | 84, 228 | Hardcoded CSS | Safe |

**DOMPurify is in `package.json`** but only used in Jupyter OutputArea.

**Concrete attack vector**: LaTeX input like `\textbf{<img src=x onerror="alert('XSS')">}`
would execute JavaScript via the unsanitized `renderLatexPreview()` function.

### 2.3 No CSRF Protection (HIGH)

Zero CSRF token handling in the entire codebase. All POST/PATCH/DELETE routes
accept requests without origin or token validation.

### 2.4 No API Rate Limiting (MEDIUM)

Only client-side rate limiting exists (Semantic Scholar API calls at 100ms intervals).
No server-side rate limiting on any route — message creation, workspace creation,
and agent bridge endpoints are all unthrottled.

### 2.5 Summary

| Issue | Severity | Effort to Fix |
|-------|----------|---------------|
| No authentication | CRITICAL | High (need auth system) |
| 4 XSS vectors | HIGH | Low (add DOMPurify to 4 files) |
| No CSRF | HIGH | Medium (add middleware) |
| No rate limiting | MEDIUM | Medium (add middleware) |

---

## 3. Missing Test Infrastructure

**Status: CONFIRMED**

- `web/tests/` directory: **Does not exist**
- `vitest.config.ts`: **Not found**
- `playwright.config.ts`: **Not found**
- Test files in `src/`: **0 files** (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx)

CLAUDE.md documents a 4-layer test architecture (unit + L1/L2/L3 Playwright) with
59+ test cases, but **none of these files exist in the repository**.

**The gap between documented testing and actual testing is complete.**

---

## 4. Internationalization (i18n)

**Status: CONFIRMED — widespread mixed language**

- **211 files** contain Chinese text
- **33,597 Chinese characters** across the codebase

**Top affected areas:**

| File | Chinese chars |
|------|-------------|
| pdf-reader/index.tsx | 1,297 |
| CustomSelectionLayer.tsx | 970 |
| demoOrchestrator.ts | 660 |
| paperContext.ts | 635 |
| SyncMatrixEngine.ts | 521 |

Chinese appears in: code comments, JSDoc descriptions, UI strings, error messages,
Prisma schema comments, and console.log outputs.

---

## 5. Missing Error Pages

**Status: CONFIRMED**

| File | Exists? |
|------|---------|
| `app/error.tsx` | NO |
| `app/not-found.tsx` | NO |
| `app/workspace/error.tsx` | NO |
| `app/workspace/[id]/error.tsx` | NO |

The only error boundary is `ComponentErrorBoundary` in WindowViewer (component-level),
which shows Chinese error messages. No application-level error handling exists.

---

## 6. Bundle Size

**Status: PARTIALLY VERIFIED (heavy deps confirmed, no build analysis available)**

Key heavy dependencies:

| Package | Estimated Size |
|---------|---------------|
| plotly.js-dist-min | ~3MB |
| react-pdf | ~1.2MB |
| ag-grid-community | ~850KB |
| aieditor | ~800KB |
| three | ~600KB |
| katex | ~500KB |
| @jupyterlab/services | ~500KB |
| codemirror + submodules | ~400KB |
| lucide-react | ~350KB |
| framer-motion | ~250KB |

No bundle analyzer configured. Next.js standalone mode is enabled but no size report
available. Note: `ag-grid`, `three`, `plotly.js`, and `react-pdf` are currently
disabled via `DISABLED_COMPONENTS` but may still be bundled unless tree-shaken by
dynamic imports.

---

## 7. Large File / Code Quality

**Status: CONFIRMED (with correction)**

| File | Lines | Issue |
|------|-------|-------|
| LatexEditorPreview.tsx | **1,844** | Monolithic (editor + preview + toolbar + sidebar) |
| syncActions.ts | ~875 | Should split by domain (chat, component, task) |
| agentInstanceStore.ts | ~520 | Health monitor + startup mixed in |
| pdf-reader/index.tsx | ~500+ | Heavy with inline Chinese comments |

**Correction**: Original analysis stated LatexEditorPreview was "68K lines" — actual
count is **1,844 lines**. The "68K" figure was the file size in bytes.

---

## Roadmap Recommendation

### Phase 1: Security & Stability (Week 1-2)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Add DOMPurify to 4 unprotected `dangerouslySetInnerHTML` uses | P0 | 1 day |
| 2 | Add Next.js error pages (`error.tsx`, `not-found.tsx`) | P0 | 1 day |
| 3 | Refactor WorkspaceView to use domain stores | P0 | 2 days |
| 4 | Design auth system (NextAuth / custom session) | P0 | 3-5 days |
| 5 | Add Zod validation to API route inputs | P1 | 2-3 days |

### Phase 2: Quality & Testing (Week 2-4)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 6 | Set up vitest + playwright configs | P1 | 1 day |
| 7 | Write unit tests for stores (target 80%+ on stores) | P1 | 3-5 days |
| 8 | Write E2E tests for core flows | P1 | 3-5 days |
| 9 | Split syncActions.ts by domain | P1 | 2 days |
| 10 | Add CSRF middleware | P1 | 1 day |

### Phase 3: Open-Source Readiness (Week 4-6)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 11 | Translate all Chinese comments/strings to English | P2 | 3-5 days |
| 12 | Introduce i18n framework (next-intl) for UI strings | P2 | 3 days |
| 13 | Add ARIA labels to core components | P2 | 2-3 days |
| 14 | Write user documentation (Getting Started, FAQ) | P2 | 3 days |
| 15 | Add API rate limiting middleware | P2 | 1 day |

### Phase 4: Optimization (Week 6-8)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 16 | Configure bundle analyzer, optimize imports | P3 | 2 days |
| 17 | Split LatexEditorPreview into sub-components | P3 | 2 days |
| 18 | Add database indexes for common queries | P3 | 1 day |
| 19 | Implement offline/degraded mode (read-only without agent) | P3 | 3 days |
| 20 | Add OpenAPI documentation for API routes | P3 | 2-3 days |

---

## Corrections from Original Analysis

| Original Claim | Verified Finding | Status |
|----------------|-----------------|--------|
| "154+ re-render triggers" | 29 direct hooks (22 workspace + 7 agent) on a 104-export merged store | Overstated |
| "LatexEditorPreview 68K lines" | 1,844 lines (68K was file size in bytes) | Corrected |
| "~5.5MB bundle" | Heavy deps confirmed but no actual measurement | Unverified |
| Missing auth middleware | Confirmed — hardcoded `dev-user` everywhere | Accurate |
| 3 XSS vectors | Actually 4 unprotected files (added ArtifactsPanel.tsx) | Understated |
| Missing tests | Confirmed — 0 test files in repo | Accurate |
| 211 files with Chinese | Confirmed — 33,597 characters | Accurate |
| Missing error pages | Confirmed — 0 Next.js error boundaries | Accurate |
| No CSRF / no rate limiting | Confirmed | Accurate |
