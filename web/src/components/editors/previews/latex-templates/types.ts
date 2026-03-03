// ============================================================
// LaTeX Template System - Type Definitions
// ============================================================

/**
 * Template category types
 */
export type TemplateCategory =
  | "conference"      // Conference papers
  | "journal"         // Journal articles
  | "thesis"          // Theses & dissertations
  | "cv"              // Resumes & CVs
  | "presentation"    // Presentations (Beamer)
  | "report"          // Reports
  | "book"            // Books
  | "letter"          // Letters
  | "poster"          // Posters
  | "other";          // Other

/**
 * Template source type
 */
export type TemplateSourceType = "builtin" | "github" | "overleaf" | "url" | "local";

/**
 * GitHub source configuration
 */
export interface GitHubSource {
  owner: string;
  repo: string;
  branch?: string;           // Defaults to main
  path?: string;             // Path within the repository, defaults to root
  mainFile?: string;         // Main file, defaults to main.tex
}

/**
 * Overleaf source configuration
 */
export interface OverleafSource {
  templateId: string;        // e.g. 'rdtrwgypxxzb'
  templateSlug: string;      // e.g. 'cvpr-2026-submission-template'
  webUrl: string;            // Full URL
}

/**
 * Template source information
 */
export interface TemplateSource {
  type: TemplateSourceType;
  github?: GitHubSource;
  overleaf?: OverleafSource;
  url?: string;              // ZIP file URL
}

/**
 * Template metadata
 */
export interface TemplateMetadata {
  id: string;                    // Unique identifier
  name: string;                  // Template name
  description: string;           // Template description
  category: TemplateCategory;    // Category
  tags: string[];                // Tags
  thumbnail?: string;            // Thumbnail URL

  // Source information
  source: TemplateSource;

  // Version information
  version?: string;
  lastUpdated?: string;

  // Metadata
  author?: string;
  license?: string;
  documentClass?: string;        // article, report, book, beamer, etc.

  // Statistics
  downloads?: number;
  stars?: number;
}

/**
 * Template file type
 */
export type TemplateFileType = "tex" | "bib" | "sty" | "cls" | "bst" | "image" | "other";

/**
 * Single template file
 */
export interface TemplateFile {
  path: string;                 // Relative path
  name: string;                 // Filename
  type: TemplateFileType;
  content?: string;             // Text content (text files only)
  binaryUrl?: string;           // Binary file URL (images, etc.)
  size?: number;                // File size
}

/**
 * Template files collection
 */
export interface TemplateFiles {
  mainFile: string;             // Main .tex filename
  files: TemplateFile[];        // All files
}

/**
 * Category information for display
 */
export interface CategoryInfo {
  id: TemplateCategory;
  name: string;
  nameZh: string;               // Chinese name
  icon: string;
  description: string;
  count?: number;
}

/**
 * Template catalog (root structure)
 */
export interface TemplateCatalog {
  version: string;
  lastUpdated: string;
  categories: CategoryInfo[];
  templates: TemplateMetadata[];
}

/**
 * Template search/filter options
 */
export interface TemplateFilters {
  category?: TemplateCategory;
  tags?: string[];
  source?: TemplateSourceType;
  documentClass?: string;
  query?: string;
}

// ============================================================
// GitHub API Types
// ============================================================

/**
 * GitHub repository information
 */
export interface GitHubRepo {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  updatedAt: string;
  defaultBranch: string;
  topics: string[];
  htmlUrl: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

/**
 * GitHub repository content item
 */
export interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  downloadUrl: string | null;
  htmlUrl: string;
}

/**
 * GitHub API search result
 */
export interface GitHubSearchResult {
  totalCount: number;
  incompleteResults: boolean;
  items: GitHubRepo[];
}

/**
 * GitHub import options
 */
export interface GitHubImportOptions {
  branch?: string;
  path?: string;
  mainFile?: string;
  includeImages?: boolean;
  maxFileSize?: number;         // Max size per file (bytes)
  maxTotalSize?: number;        // Max total size (bytes)
}

// ============================================================
// Service Response Types
// ============================================================

/**
 * Generic service response
 */
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Template download progress
 */
export interface DownloadProgress {
  total: number;
  loaded: number;
  percentage: number;
  currentFile?: string;
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean;
  files: TemplateFiles;
  warnings?: string[];
  skippedFiles?: string[];
}

// ============================================================
// Constants
// ============================================================

/**
 * Category definitions with metadata
 */
export const CATEGORIES: CategoryInfo[] = [
  {
    id: "conference",
    name: "Conference Papers",
    nameZh: "Conference Papers",
    icon: "🎯",
    description: "Templates for academic conference submissions",
  },
  {
    id: "journal",
    name: "Journal Articles",
    nameZh: "Journal Articles",
    icon: "📰",
    description: "Templates for journal paper submissions",
  },
  {
    id: "thesis",
    name: "Thesis & Dissertation",
    nameZh: "Thesis & Dissertation",
    icon: "🎓",
    description: "Templates for bachelor, master, and PhD theses",
  },
  {
    id: "cv",
    name: "CV & Resume",
    nameZh: "CV & Resume",
    icon: "📋",
    description: "Professional CV and resume templates",
  },
  {
    id: "presentation",
    name: "Presentations",
    nameZh: "Presentations",
    icon: "📊",
    description: "Beamer and other presentation templates",
  },
  {
    id: "report",
    name: "Reports",
    nameZh: "Reports",
    icon: "📝",
    description: "Technical reports and project documentation",
  },
  {
    id: "book",
    name: "Books",
    nameZh: "Books",
    icon: "📚",
    description: "Book and textbook templates",
  },
  {
    id: "letter",
    name: "Letters",
    nameZh: "Letters",
    icon: "✉️",
    description: "Formal and cover letter templates",
  },
  {
    id: "poster",
    name: "Posters",
    nameZh: "Posters",
    icon: "🖼️",
    description: "Academic poster templates",
  },
  {
    id: "other",
    name: "Other",
    nameZh: "Other",
    icon: "📄",
    description: "Miscellaneous LaTeX templates",
  },
];

/**
 * Supported text file extensions
 */
export const TEXT_FILE_EXTENSIONS = [
  ".tex", ".bib", ".sty", ".cls", ".bst", 
  ".txt", ".md", ".json", ".yaml", ".yml",
  ".cfg", ".def", ".dtx", ".ins", ".ltx"
];

/**
 * Supported image file extensions
 */
export const IMAGE_FILE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".svg", 
  ".pdf", ".eps", ".ps"
];

/**
 * Files to ignore when importing
 */
export const IGNORED_FILES = [
  ".git", ".gitignore", ".github",
  "node_modules", "__pycache__",
  ".DS_Store", "Thumbs.db",
  "*.aux", "*.log", "*.out", "*.toc",
  "*.bbl", "*.blg", "*.fls", "*.fdb_latexmk",
  "*.synctex.gz"
];

/**
 * Default import options
 */
export const DEFAULT_IMPORT_OPTIONS: GitHubImportOptions = {
  branch: "main",
  path: "",
  mainFile: "main.tex",
  includeImages: true,
  maxFileSize: 5 * 1024 * 1024,      // 5MB per file
  maxTotalSize: 50 * 1024 * 1024,    // 50MB total
};

/**
 * Get file type from extension
 */
export function getFileType(filename: string): TemplateFileType {
  const ext = filename.toLowerCase().split(".").pop() || "";
  
  if (ext === "tex" || ext === "ltx") return "tex";
  if (ext === "bib") return "bib";
  if (ext === "sty") return "sty";
  if (ext === "cls") return "cls";
  if (ext === "bst") return "bst";
  if (IMAGE_FILE_EXTENSIONS.some(e => e.slice(1) === ext)) return "image";
  
  return "other";
}

/**
 * Check if file is a text file
 */
export function isTextFile(filename: string): boolean {
  const ext = "." + (filename.toLowerCase().split(".").pop() || "");
  return TEXT_FILE_EXTENSIONS.includes(ext);
}

/**
 * Check if file should be ignored
 */
export function shouldIgnoreFile(filename: string): boolean {
  const name = filename.split("/").pop() || filename;
  
  return IGNORED_FILES.some(pattern => {
    if (pattern.startsWith("*.")) {
      return name.endsWith(pattern.slice(1));
    }
    return name === pattern || filename.includes(`/${pattern}/`);
  });
}
