// ============================================================
// LaTeX Templates Module - Main Export
// ============================================================
//
// Unified entry point for the LaTeX template system.
//
// Usage example:
// ```typescript
// import {
//   templateService,      // Template management service
//   TemplateManager,      // Template manager component
//   useTemplates,         // Template data hook
// } from "@/components/editors/previews/latex-templates";
// ```
//
// For detailed API documentation, see: ./API.md
// For design documentation, see: ./TEMPLATE_SYSTEM_DESIGN.md
// ============================================================

// Types
export * from "./types";

// Services
export { GitHubService, githubService } from "./services/GitHubService";
export { TemplateService, templateService } from "./services/TemplateService";
export { CacheService, cacheService } from "./services/CacheService";

// Components
export {
  // Basic components
  TemplateCard,
  TemplateSearch,
  TemplateFilters,

  // Core components
  TemplatePreview,
  GitHubImporter,
  TemplateManager,

  // Utility components
  DownloadProgress,
  useDownloadProgress,
  ToastProvider,
  useToast,
  StandaloneToast,
} from "./components";

// Component Types
export type { DownloadState, Toast, ToastType } from "./components";

// Hooks
export { useTemplates } from "./hooks";

// Data - Preset catalog data
export { default as catalogData } from "./data/catalog.json";
