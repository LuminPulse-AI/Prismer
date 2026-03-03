/**
 * Notebook Store
 *
 * Document-independent notebook management
 * - Supports cross-paper notes
 * - Source tracing
 * - Notebook persistence
 *
 * Data strategy: API-first + IndexedDB fallback
 * - Primarily syncs with backend via /api/v2/notebooks
 * - Falls back to local IndexedDB when backend is unavailable
 * - Optimistic updates: update local state first, sync to API in background
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import { Citation } from '../types/citation';
import { citationMapper, citationTagParser } from '../services/citationSystem';
import { createUserIsolatedStorage } from '@/lib/storage/userStorageManager';

// Stable empty arrays to avoid infinite loop in selectors
const EMPTY_ENTRIES: NoteEntry[] = [];
const EMPTY_NOTEBOOKS: Notebook[] = [];

// ============================================================
// Type Definitions
// ============================================================

/**
 * Note entry type
 */
export type NoteEntryType =
  | 'text'
  | 'highlight'
  | 'figure'
  | 'table'
  | 'equation'
  | 'insight'
  | 'chat_excerpt';

/**
 * Note entry
 */
export interface NoteEntry {
  id: string;
  type: NoteEntryType;

  /** Content (HTML/Markdown) */
  rawContent: string;

  /** Parsed citation list */
  citations: Citation[];

  /** Primary source */
  source?: Citation;

  /** User annotation */
  annotation?: string;

  createdAt: number;
  updatedAt?: number;
}

/**
 * Notebook
 */
export interface Notebook {
  id: string;
  name: string;
  description?: string;

  /** Associated paper ID list (source tracing) */
  paperIds: string[];

  /** Note entries */
  entries: NoteEntry[];

  /** Tags */
  tags: string[];

  createdAt: number;
  updatedAt: number;
}

/** Backend Notebook response */
interface BackendNotebook {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isPublic?: boolean;
  noteCount?: number;
  createdAt: string;
  updatedAt: string;
  notes?: BackendNote[];
}

/** Backend Note response */
interface BackendNote {
  id: string;
  title?: string;
  content: string;
  contentFormat?: 'html' | 'markdown' | 'text';
  tags?: string;
  citations?: Array<{
    id: string;
    paperArxivId: string;
    pageNumber?: number;
    excerpt?: string;
    type?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// API Helpers
// ============================================================

const API_BASE = '/api/v2/notebooks';

async function apiCall<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

function backendNoteToEntry(note: BackendNote): NoteEntry {
  return {
    id: note.id,
    type: 'text',
    rawContent: note.content,
    citations: (note.citations || []).map(c => ({
      paperId: c.paperArxivId,
      pageNumber: c.pageNumber,
      excerpt: c.excerpt,
      type: c.type || 'reference',
    })) as Citation[],
    createdAt: new Date(note.createdAt).getTime(),
    updatedAt: new Date(note.updatedAt).getTime(),
  };
}

function backendToNotebook(bn: BackendNotebook): Notebook {
  return {
    id: bn.id,
    name: bn.name,
    description: bn.description,
    paperIds: [],
    entries: (bn.notes || []).map(backendNoteToEntry),
    tags: [],
    createdAt: new Date(bn.createdAt).getTime(),
    updatedAt: new Date(bn.updatedAt).getTime(),
  };
}

// ============================================================
// Store State
// ============================================================

interface NotebookState {
  /** Notebook list */
  notebooks: Notebook[];

  /** Current active notebook ID */
  activeNotebookId: string | null;

  /** Import queue */
  importQueue: Array<{
    id: string;
    type: NoteEntryType;
    content: string;
    source?: Citation;
    timestamp: number;
  }>;

  /** Loading state */
  isLoading: boolean;

  /** Whether there are unsaved changes */
  isDirty: boolean;

  /** Sync status */
  _synced: boolean;
}

interface NotebookActions {
  // Notebook management
  createNotebook: (name: string, description?: string) => Notebook;
  deleteNotebook: (id: string) => void;
  updateNotebook: (id: string, updates: Partial<Notebook>) => void;
  renameNotebook: (id: string, name: string) => void;

  // Switch notebook
  setActiveNotebook: (id: string | null) => void;
  getActiveNotebook: () => Notebook | null;

  // Note entry management
  addEntry: (entry: Omit<NoteEntry, 'id' | 'createdAt' | 'citations'>) => void;
  updateEntry: (entryId: string, updates: Partial<NoteEntry>) => void;
  removeEntry: (entryId: string) => void;
  moveEntry: (entryId: string, direction: 'up' | 'down') => void;

  // Import queue
  addToImportQueue: (item: Omit<NotebookState['importQueue'][0], 'id' | 'timestamp'>) => void;
  removeFromImportQueue: (id: string) => void;
  importFromQueue: (id: string) => void;
  importAllFromQueue: () => void;
  clearImportQueue: () => void;

  // State management
  setLoading: (loading: boolean) => void;
  setDirty: (dirty: boolean) => void;

  // Utility methods
  getNotebooksByPaper: (paperId: string) => Notebook[];
  createOrGetDefaultNotebook: () => Notebook;

  // Sync
  fetchNotebooks: () => Promise<void>;
}

// ============================================================
// Store Implementation
// ============================================================

export const useNotebookStore = create<NotebookState & NotebookActions>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        notebooks: [],
        activeNotebookId: null,
        importQueue: [],
        isLoading: false,
        isDirty: false,
        _synced: false,

        // ============================================================
        // Sync
        // ============================================================

        fetchNotebooks: async () => {
          set({ isLoading: true });
          const data = await apiCall<BackendNotebook[]>(API_BASE);
          if (data) {
            // Fetch full details for each notebook (with notes)
            const fullNotebooks = await Promise.all(
              data.map(async (nb) => {
                const full = await apiCall<BackendNotebook>(`${API_BASE}/${nb.id}`);
                return full ? backendToNotebook(full) : backendToNotebook(nb);
              })
            );
            set({ notebooks: fullNotebooks, _synced: true, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        },

        // ============================================================
        // Notebook management
        // ============================================================

        createNotebook: (name, description) => {
          const id = uuidv4();
          const now = Date.now();

          const newNotebook: Notebook = {
            id,
            name,
            description,
            paperIds: [],
            entries: [],
            tags: [],
            createdAt: now,
            updatedAt: now,
          };

          set(state => ({
            notebooks: [...state.notebooks, newNotebook],
            activeNotebookId: id,
          }));

          // Background API sync
          apiCall<BackendNotebook>(API_BASE, {
            method: 'POST',
            body: JSON.stringify({ name, description }),
          }).then((data) => {
            if (data) {
              set(state => ({
                notebooks: state.notebooks.map(n =>
                  n.id === id ? { ...n, id: data.id } : n
                ),
                activeNotebookId: state.activeNotebookId === id ? data.id : state.activeNotebookId,
              }));
            }
          });

          return newNotebook;
        },

        deleteNotebook: (id) => {
          set(state => ({
            notebooks: state.notebooks.filter(n => n.id !== id),
            activeNotebookId: state.activeNotebookId === id ? null : state.activeNotebookId,
          }));

          // Background API sync
          apiCall(`${API_BASE}/${id}`, { method: 'DELETE' });
        },

        updateNotebook: (id, updates) => {
          set(state => ({
            notebooks: state.notebooks.map(n =>
              n.id === id ? { ...n, ...updates, updatedAt: Date.now() } : n
            ),
            isDirty: true,
          }));

          // Background API sync (only metadata fields)
          const { name, description } = updates;
          if (name !== undefined || description !== undefined) {
            apiCall(`${API_BASE}/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
              }),
            });
          }
        },

        renameNotebook: (id, name) => {
          get().updateNotebook(id, { name });
        },

        // ============================================================
        // Switch notebook
        // ============================================================

        setActiveNotebook: (id) => {
          set({ activeNotebookId: id });
        },

        getActiveNotebook: () => {
          const { notebooks, activeNotebookId } = get();
          if (!activeNotebookId) return null;
          return notebooks.find(n => n.id === activeNotebookId) || null;
        },

        // ============================================================
        // Note entry management
        // ============================================================

        addEntry: (entryData) => {
          const notebook = get().getActiveNotebook();
          if (!notebook) {
            console.warn('[NotebookStore] No active notebook');
            return;
          }

          // Parse citations
          const tags = citationTagParser.parse(entryData.rawContent);
          const citations = tags.length > 0
            ? citationMapper.mapToCitations(tags, {
                mode: 'single',
                defaultPaperId: entryData.source?.paperId,
              })
            : [];

          const entry: NoteEntry = {
            ...entryData,
            id: uuidv4(),
            citations,
            createdAt: Date.now(),
          };

          // Update associated paper list
          const paperIds = new Set(notebook.paperIds);
          if (entry.source?.paperId) {
            paperIds.add(entry.source.paperId);
          }
          citations.forEach(c => paperIds.add(c.paperId));

          set(state => ({
            notebooks: state.notebooks.map(n => {
              if (n.id !== notebook.id) return n;
              return {
                ...n,
                entries: [...n.entries, entry],
                paperIds: Array.from(paperIds),
                updatedAt: Date.now(),
              };
            }),
            isDirty: true,
          }));

          // Background API sync — create note on backend
          apiCall(`${API_BASE}/${notebook.id}/notes`, {
            method: 'POST',
            body: JSON.stringify({
              content: entryData.rawContent,
              contentFormat: 'html',
            }),
          }).then((data) => {
            if (data && typeof data === 'object' && 'id' in data) {
              const backendNote = data as BackendNote;
              set(state => ({
                notebooks: state.notebooks.map(n => {
                  if (n.id !== notebook.id) return n;
                  return {
                    ...n,
                    entries: n.entries.map(e =>
                      e.id === entry.id ? { ...e, id: backendNote.id } : e
                    ),
                  };
                }),
              }));
            }
          });
        },

        updateEntry: (entryId, updates) => {
          const notebook = get().getActiveNotebook();
          if (!notebook) return;

          // If content was updated, re-parse citations
          let updatedCitations = updates.citations;
          if (updates.rawContent && !updates.citations) {
            const tags = citationTagParser.parse(updates.rawContent);
            const existingEntry = notebook.entries.find(e => e.id === entryId);
            updatedCitations = citationMapper.mapToCitations(tags, {
              mode: 'single',
              defaultPaperId: existingEntry?.source?.paperId,
            });
          }

          set(state => ({
            notebooks: state.notebooks.map(n => {
              if (n.id !== notebook.id) return n;
              return {
                ...n,
                entries: n.entries.map(e =>
                  e.id === entryId
                    ? {
                        ...e,
                        ...updates,
                        ...(updatedCitations ? { citations: updatedCitations } : {}),
                        updatedAt: Date.now(),
                      }
                    : e
                ),
                updatedAt: Date.now(),
              };
            }),
            isDirty: true,
          }));

          // Note: Individual note PATCH API will be available after P1 Task 8
        },

        removeEntry: (entryId) => {
          const notebook = get().getActiveNotebook();
          if (!notebook) return;

          set(state => ({
            notebooks: state.notebooks.map(n => {
              if (n.id !== notebook.id) return n;
              return {
                ...n,
                entries: n.entries.filter(e => e.id !== entryId),
                updatedAt: Date.now(),
              };
            }),
            isDirty: true,
          }));

          // Note: Individual note DELETE API will be available after P1 Task 8
        },

        moveEntry: (entryId, direction) => {
          const notebook = get().getActiveNotebook();
          if (!notebook) return;

          const index = notebook.entries.findIndex(e => e.id === entryId);
          if (index === -1) return;

          const newIndex = direction === 'up' ? index - 1 : index + 1;
          if (newIndex < 0 || newIndex >= notebook.entries.length) return;

          const newEntries = [...notebook.entries];
          [newEntries[index], newEntries[newIndex]] = [newEntries[newIndex], newEntries[index]];

          set(state => ({
            notebooks: state.notebooks.map(n => {
              if (n.id !== notebook.id) return n;
              return { ...n, entries: newEntries, updatedAt: Date.now() };
            }),
            isDirty: true,
          }));
        },

        // ============================================================
        // Import queue
        // ============================================================

        addToImportQueue: (item) => {
          set(state => ({
            importQueue: [
              ...state.importQueue,
              { ...item, id: uuidv4(), timestamp: Date.now() },
            ],
          }));
        },

        removeFromImportQueue: (id) => {
          set(state => ({
            importQueue: state.importQueue.filter(item => item.id !== id),
          }));
        },

        importFromQueue: (id) => {
          const item = get().importQueue.find(i => i.id === id);
          if (!item) return;

          get().addEntry({
            type: item.type,
            rawContent: item.content,
            source: item.source,
          });

          get().removeFromImportQueue(id);
        },

        importAllFromQueue: () => {
          const { importQueue } = get();
          importQueue.forEach(item => {
            get().addEntry({
              type: item.type,
              rawContent: item.content,
              source: item.source,
            });
          });
          set({ importQueue: [] });
        },

        clearImportQueue: () => {
          set({ importQueue: [] });
        },

        // ============================================================
        // State management
        // ============================================================

        setLoading: (loading) => set({ isLoading: loading }),
        setDirty: (dirty) => set({ isDirty: dirty }),

        // ============================================================
        // Utility methods
        // ============================================================

        getNotebooksByPaper: (paperId) => {
          return get().notebooks.filter(n => n.paperIds.includes(paperId));
        },

        createOrGetDefaultNotebook: () => {
          let notebook = get().getActiveNotebook();

          if (!notebook) {
            // Find the most recently updated notebook
            const notebooks = get().notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
            notebook = notebooks[0];
          }

          if (!notebook) {
            // Create default notebook
            notebook = get().createNotebook('Research Notes', 'Default notebook for research notes');
          } else {
            get().setActiveNotebook(notebook.id);
          }

          return notebook;
        },
      }),
      {
        name: 'notebook-storage',
        version: 1,
        // Use user-isolated storage; unauthenticated users do not persist notebooks
        storage: createUserIsolatedStorage('notebook-storage', true),
        partialize: (state) => ({
          notebooks: state.notebooks,
          activeNotebookId: state.activeNotebookId,
        }),
        migrate: (persistedState: any, version: number) => {
          // Handle migration from older versions
          if (version === 0) {
            // Clear old data if structure is incompatible
            return { notebooks: [], activeNotebookId: null };
          }
          return persistedState as NotebookState;
        },
      }
    ),
    { name: 'NotebookStore' }
  )
);

// ============================================================
// Hooks
// ============================================================

/**
 * Get active notebook
 */
export function useActiveNotebook(): Notebook | null {
  return useNotebookStore(state => {
    if (!state.activeNotebookId) return null;
    return state.notebooks.find(n => n.id === state.activeNotebookId) || null;
  });
}

/**
 * Get entries for the active notebook
 */
export function useNotebookEntries(): NoteEntry[] {
  return useNotebookStore(
    useShallow(state => {
      if (!state.activeNotebookId) return EMPTY_ENTRIES;
      const notebook = state.notebooks.find(n => n.id === state.activeNotebookId);
      return notebook?.entries ?? EMPTY_ENTRIES;
    })
  );
}

/**
 * Get import queue
 */
export function useImportQueue() {
  return useNotebookStore(state => state.importQueue);
}

/**
 * Get all notebooks
 */
export function useNotebooks(): Notebook[] {
  return useNotebookStore(
    useShallow(state => {
      if (state.notebooks.length === 0) return EMPTY_NOTEBOOKS;
      return [...state.notebooks].sort((a, b) => b.updatedAt - a.updatedAt);
    })
  );
}

/**
 * Clear all notebooks (used on logout)
 */
export function clearAllNotebooks(): void {
  useNotebookStore.setState({
    notebooks: [],
    activeNotebookId: null,
    importQueue: [],
    _synced: false,
  });
}
