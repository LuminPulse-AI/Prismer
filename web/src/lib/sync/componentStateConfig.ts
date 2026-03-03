/**
 * Component State Sync Configuration
 *
 * Defines the sync strategy for each component state field
 * Controls which states need syncing, persistence, and mobile access permissions
 */

import type { ComponentStates } from '@/types/workspace';

// ============================================================
// Types
// ============================================================

/** Sync mode */
export type SyncMode = 'bidirectional' | 'broadcast' | 'local';

/** Mobile access permission */
export type MobileAccess = 'read' | 'write' | 'none';

/** Field sync configuration */
export interface FieldSyncConfig {
  /** Sync mode */
  sync: SyncMode;
  /** Whether to persist */
  persistence: boolean;
  /** Mobile access permission */
  mobileAccess: MobileAccess;
}

/** Component state sync configuration */
export interface ComponentStateSyncConfig<T> {
  componentType: keyof ComponentStates;
  description: string;
  /** Whether mobile needs this component state */
  mobileRelevant: boolean;
  /** Field-level configuration */
  fields: {
    [K in keyof T]?: FieldSyncConfig;
  };
}

// ============================================================
// Component State Configurations
// ============================================================

/**
 * PDF Reader state sync configuration
 */
export const pdfReaderConfig: ComponentStateSyncConfig<ComponentStates['pdf-reader']> = {
  componentType: 'pdf-reader',
  description: 'PDF reader state',
  mobileRelevant: false, // Mobile does not have a PDF reader
  fields: {
    documentId: { sync: 'bidirectional', persistence: true, mobileAccess: 'read' },
    currentPage: { sync: 'bidirectional', persistence: true, mobileAccess: 'read' },
    highlights: { sync: 'bidirectional', persistence: true, mobileAccess: 'read' },
    totalPages: { sync: 'broadcast', persistence: false, mobileAccess: 'read' },
    zoom: { sync: 'local', persistence: false, mobileAccess: 'none' },
  },
};

/**
 * LaTeX Editor state sync configuration
 */
export const latexEditorConfig: ComponentStateSyncConfig<ComponentStates['latex-editor']> = {
  componentType: 'latex-editor',
  description: 'LaTeX editor state',
  mobileRelevant: false,
  fields: {
    activeFile: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    content: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    cursorPosition: { sync: 'local', persistence: false, mobileAccess: 'none' },
    compiledPdfUrl: { sync: 'local', persistence: false, mobileAccess: 'none' },
  },
};

/**
 * Code Playground state sync configuration
 */
export const codePlaygroundConfig: ComponentStateSyncConfig<ComponentStates['code-playground']> = {
  componentType: 'code-playground',
  description: 'Code editor state',
  mobileRelevant: false,
  fields: {
    mode: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    template: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    selectedFile: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    terminalOutput: { sync: 'local', persistence: false, mobileAccess: 'none' },
    previewUrl: { sync: 'local', persistence: false, mobileAccess: 'none' },
  },
};

/**
 * AI Editor state sync configuration
 */
export const aiEditorConfig: ComponentStateSyncConfig<ComponentStates['ai-editor']> = {
  componentType: 'ai-editor',
  description: 'AI editor state',
  mobileRelevant: false,
  fields: {
    content: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    documentId: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
  },
};

/**
 * AG Grid state sync configuration
 */
export const agGridConfig: ComponentStateSyncConfig<ComponentStates['ag-grid']> = {
  componentType: 'ag-grid',
  description: 'Data grid state',
  mobileRelevant: false,
  fields: {
    selectedRowIds: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    filterModel: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    sortModel: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
  },
};

/**
 * Jupyter Notebook state sync configuration
 */
export const jupyterNotebookConfig: ComponentStateSyncConfig<ComponentStates['jupyter-notebook']> = {
  componentType: 'jupyter-notebook',
  description: 'Jupyter Notebook state',
  mobileRelevant: false,
  fields: {
    activeCellIndex: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    cellCount: { sync: 'broadcast', persistence: false, mobileAccess: 'none' },
    kernelStatus: { sync: 'broadcast', persistence: false, mobileAccess: 'read' },
    sessionId: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    executionCount: { sync: 'broadcast', persistence: false, mobileAccess: 'none' },
    cells: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
  },
};

/**
 * Bento Gallery state sync configuration
 */
export const bentoGalleryConfig: ComponentStateSyncConfig<ComponentStates['bento-gallery']> = {
  componentType: 'bento-gallery',
  description: 'Image gallery state',
  mobileRelevant: false,
  fields: {
    selectedImageId: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
  },
};

/**
 * Three Viewer state sync configuration
 */
export const threeViewerConfig: ComponentStateSyncConfig<ComponentStates['three-viewer']> = {
  componentType: 'three-viewer',
  description: '3D viewer state',
  mobileRelevant: false,
  fields: {
    modelId: { sync: 'bidirectional', persistence: true, mobileAccess: 'none' },
    cameraPosition: { sync: 'local', persistence: false, mobileAccess: 'none' },
  },
};

// ============================================================
// Registry
// ============================================================

/** All component state configurations */
export const componentStateConfigs: Record<string, ComponentStateSyncConfig<any>> = {
  'pdf-reader': pdfReaderConfig,
  'latex-editor': latexEditorConfig,
  'code-playground': codePlaygroundConfig,
  'jupyter-notebook': jupyterNotebookConfig,
  'ai-editor': aiEditorConfig,
  'ag-grid': agGridConfig,
  'bento-gallery': bentoGalleryConfig,
  'three-viewer': threeViewerConfig,
};

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get sync configuration for a component
 */
export function getComponentConfig(componentType: string): ComponentStateSyncConfig<any> | undefined {
  return componentStateConfigs[componentType];
}

/**
 * Check if a field needs syncing
 */
export function shouldSyncField(
  componentType: string,
  fieldName: string
): boolean {
  const config = getComponentConfig(componentType);
  if (!config) return false;
  
  const fieldConfig = config.fields[fieldName];
  return fieldConfig?.sync !== 'local';
}

/**
 * Check if a field needs persistence
 */
export function shouldPersistField(
  componentType: string,
  fieldName: string
): boolean {
  const config = getComponentConfig(componentType);
  if (!config) return false;
  
  const fieldConfig = config.fields[fieldName];
  return fieldConfig?.persistence ?? false;
}

/**
 * Check if mobile can access a field
 */
export function canMobileAccess(
  componentType: string,
  fieldName: string,
  mode: 'read' | 'write'
): boolean {
  const config = getComponentConfig(componentType);
  if (!config) return false;
  
  const fieldConfig = config.fields[fieldName];
  if (!fieldConfig) return false;
  
  if (fieldConfig.mobileAccess === 'none') return false;
  if (mode === 'read') return true;
  if (mode === 'write') return fieldConfig.mobileAccess === 'write';
  return false;
}

/**
 * Filter component state, keeping only fields that need syncing
 */
export function filterSyncableState<T extends Record<string, any>>(
  componentType: string,
  state: T
): Partial<T> {
  const config = getComponentConfig(componentType);
  if (!config) return state;
  
  const filtered: Partial<T> = {};
  for (const [key, value] of Object.entries(state)) {
    if (shouldSyncField(componentType, key)) {
      (filtered as any)[key] = value;
    }
  }
  return filtered;
}

/**
 * Filter component state, keeping only fields that need persistence
 */
export function filterPersistableState<T extends Record<string, any>>(
  componentType: string,
  state: T
): Partial<T> {
  const config = getComponentConfig(componentType);
  if (!config) return state;
  
  const filtered: Partial<T> = {};
  for (const [key, value] of Object.entries(state)) {
    if (shouldPersistField(componentType, key)) {
      (filtered as any)[key] = value;
    }
  }
  return filtered;
}

/**
 * Filter component state, keeping only fields accessible by mobile
 */
export function filterMobileAccessibleState<T extends Record<string, any>>(
  componentType: string,
  state: T
): Partial<T> {
  const config = getComponentConfig(componentType);
  if (!config || !config.mobileRelevant) return {};
  
  const filtered: Partial<T> = {};
  for (const [key, value] of Object.entries(state)) {
    if (canMobileAccess(componentType, key, 'read')) {
      (filtered as any)[key] = value;
    }
  }
  return filtered;
}

/**
 * Get mobile-relevant component types
 */
export function getMobileRelevantComponents(): string[] {
  return Object.entries(componentStateConfigs)
    .filter(([_, config]) => config.mobileRelevant)
    .map(([type]) => type);
}

/**
 * Filter entire ComponentStates, keeping only mobile-relevant state
 */
export function filterComponentStatesForMobile(
  states: Record<string, any>
): Record<string, any> {
  const filtered: Record<string, any> = {};
  
  for (const [componentType, state] of Object.entries(states)) {
    const mobileState = filterMobileAccessibleState(componentType, state);
    if (Object.keys(mobileState).length > 0) {
      filtered[componentType] = mobileState;
    }
  }
  
  return filtered;
}

export default componentStateConfigs;
