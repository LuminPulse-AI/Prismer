/**
 * Workspace Types
 *
 * Component state definitions and workspace entity types.
 * Used by sync layer, workspace stores, and editor components.
 */

import type { ComponentType } from '@/lib/events/types';
import type { AgentActionType } from './message';
import type { TaskStatus } from './task';
import type { Highlight } from './timeline';

// ============================================================
// Layout Types
// ============================================================

export type TaskPanelHeight = 'collapsed' | '30%' | '80%';

export interface LayoutConfig {
  chatPanelWidth: number;
  taskPanelHeight: TaskPanelHeight;
}

// ============================================================
// Workspace Entity
// ============================================================

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Component State Definitions
// ============================================================

export interface PdfReaderState {
  documentId: string;
  currentPage: number;
  totalPages?: number;
  highlights?: Highlight[];
  zoom?: number;
  bookmarks?: Array<{ page: number; label: string; createdAt: number }>;
  annotations?: Array<{
    id: string;
    page: number;
    type: 'highlight' | 'note' | 'underline' | 'strikethrough';
    content?: string;
    color: string;
    range: { start: number; end: number };
  }>;
  searchQuery?: string;
  searchResults?: Array<{ page: number; index: number }>;
  ocrStatus?: 'not_started' | 'processing' | 'completed' | 'failed';
  selectedText?: string;
}

export interface LatexEditorState {
  activeFile: string;
  content?: string;
  cursorPosition?: { line: number; column: number };
  compiledPdfUrl?: string;
  files?: Array<{ path: string; type: 'tex' | 'bib' | 'sty' | 'cls' | 'image' }>;
  compileStatus?: 'idle' | 'compiling' | 'success' | 'error';
  compileErrors?: Array<{ file: string; line: number; message: string; severity: 'error' | 'warning' }>;
  bibtexEntries?: Array<{ key: string; type: string; title: string }>;
  lastSavedAt?: number;
  /** Whether project mode is active (multi-file from /workspace/latex/) */
  projectMode?: boolean;
  /** Main .tex file for project compilation */
  mainFile?: string;
  /** LaTeX engine preference */
  engine?: 'pdflatex' | 'xelatex' | 'lualatex';
}

export interface CodePlaygroundState {
  mode?: 'frontend' | 'script';
  template: string;
  selectedFile: string;
  terminalOutput?: string;
  previewUrl?: string;
  files?: Array<{ path: string; content: string; language: string }>;
  openFiles?: string[];
  runningProcesses?: Array<{ pid: string; command: string; status: 'running' | 'exited' }>;
  buildStatus?: 'idle' | 'building' | 'success' | 'error';
  buildErrors?: Array<{ file: string; line: number; message: string }>;
  dependencies?: Record<string, string>;
  installingDeps?: boolean;
}

export interface JupyterNotebookState {
  activeCellIndex: number;
  cellCount: number;
  kernelStatus?: 'idle' | 'busy' | 'starting' | 'restarting' | 'dead' | 'not_connected';
  sessionId?: string;
  executionCount?: number;
  cells?: Array<{
    id: string;
    type: 'code' | 'markdown' | 'raw';
    source: string;
    outputs?: unknown[];
    executionCount?: number;
    status: 'idle' | 'running' | 'error' | 'queued';
  }>;
  variables?: Array<{ name: string; type: string; shape?: string; value?: string }>;
}

export interface AiEditorState {
  content: string;
  cursorPosition?: { line: number; column: number };
  documentId?: string;
  wordCount?: number;
  characterCount?: number;
  lastSavedAt?: number;
  aiSuggestion?: { content: string; position: number; status: 'pending' | 'accepted' | 'rejected' };
  aiProcessing?: boolean;
  collaborators?: Array<{ id: string; name: string; cursorPosition?: { line: number; column: number } }>;
}

export interface AgGridState {
  selectedRowIds?: string[];
  dataSourceId?: string;
  rowCount?: number;
  columnDefs?: Array<{ field: string; headerName: string; type?: string }>;
  filterModel?: Record<string, unknown>;
  sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  columnState?: Array<{ colId: string; width?: number; hide?: boolean }>;
  editingCell?: { rowIndex: number; colId: string };
  filename?: string;
  totalRows?: number;
  truncated?: boolean;
  columnInfo?: Array<{ name: string; dtype: string; nonNullCount: number; nullCount: number }>;
}

/** Component state mapping — maps component type to its state interface */
export interface ComponentStates {
  'pdf-reader'?: PdfReaderState;
  'latex-editor'?: LatexEditorState;
  'code-playground'?: CodePlaygroundState;
  'jupyter-notebook'?: JupyterNotebookState;
  'ai-editor'?: AiEditorState;
  'bento-gallery'?: { selectedImageId?: string; images?: Array<{ title: string; description?: string; url: string }> };
  'three-viewer'?: { modelId?: string; cameraPosition?: number[] };
  'ag-grid'?: AgGridState;
}

// ============================================================
// Agent Workflow State
// ============================================================

export interface AgentWorkflowState {
  status: 'idle' | 'planning' | 'executing' | 'waiting_user' | 'waiting_tool' | 'error' | 'completed';
  workflowId?: string;
  workflowType?: 'research' | 'analysis' | 'writing' | 'review' | 'coding' | 'custom';
  plan?: {
    steps: Array<{
      id: string;
      title: string;
      description: string;
      type: AgentActionType;
      status: TaskStatus;
      dependencies?: string[];
      output?: unknown;
    }>;
    currentStepId?: string;
  };
  activeToolCalls?: Array<{
    id: string;
    tool: string;
    input: Record<string, unknown>;
    status: 'calling' | 'streaming' | 'completed' | 'failed';
    output?: unknown;
    startedAt: number;
  }>;
  reasoningTrace?: Array<{
    type: 'thought' | 'observation' | 'decision' | 'action';
    content: string;
    timestamp: number;
  }>;
  contextUsage?: {
    tokenCount: number;
    maxTokens: number;
    summarizedAt?: number;
  };
}

// ============================================================
// Async Operation Tracking
// ============================================================

export type AsyncOperationType =
  | 'jupyter_execute' | 'latex_compile' | 'ai_request'
  | 'code_execute' | 'file_upload' | 'ocr_process';

export interface AsyncOperation {
  id: string;
  type: AsyncOperationType;
  component: ComponentType;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  startedAt: number;
  completedAt?: number;
  cancellable?: boolean;
  error?: string;
}

// ============================================================
// Component Availability
// ============================================================

// Components disabled for the current release.
// PDF Reader is enabled in self-host mode; the remaining editors stay hidden
// until their backing runtime paths are fully restored.
// Re-enable by removing entries as each component reaches production readiness.
const DISABLED_COMPONENT_LIST = [
  'code-playground',
  'bento-gallery',
  'three-viewer',
  'ag-grid',
  'jupyter-notebook',
] as const;

export type DisabledComponentType = (typeof DISABLED_COMPONENT_LIST)[number];
export type ActiveComponentType = Exclude<ComponentType, DisabledComponentType>;
export const DISABLED_COMPONENTS: ReadonlySet<ComponentType> = new Set<ComponentType>(DISABLED_COMPONENT_LIST);
