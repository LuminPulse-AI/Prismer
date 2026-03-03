/**
 * Research Notes - Example extended data type
 *
 * This file demonstrates how to add a new data type to the sync system.
 * "Research Notes" is a simple card-based data type supporting multi-client sync and persistence.
 *
 * Steps:
 * 1. Define the data type interface
 * 2. Create sync rules
 * 3. Add state and Actions to the Store
 * 4. Register with the sync matrix
 * 5. Add server-side persistence support
 */

import type { SyncRule, EndpointType } from '../types';
import { SyncRuleBuilder } from '../SyncMatrixEngine';

// ============================================================
// 1. Data Type Definitions
// ============================================================

/** Research note */
export interface ResearchNote {
  /** Unique ID */
  id: string;
  /** Creator */
  creatorId: string;
  /** Title */
  title: string;
  /** Content (Markdown) */
  content: string;
  /** Tags */
  tags: string[];
  /** Linked message IDs */
  linkedMessageIds?: string[];
  /** Linked task IDs */
  linkedTaskIds?: string[];
  /** Color label */
  color?: 'default' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';
  /** Whether pinned */
  pinned?: boolean;
  /** Creation time */
  createdAt: number;
  /** Update time */
  updatedAt: number;
}

/** Research notes state */
export interface ResearchNotesState {
  /** Notes list */
  notes: ResearchNote[];
  /** Currently selected note ID */
  activeNoteId: string | null;
  /** Filter tags */
  filterTags: string[];
  /** Sort field */
  sortBy: 'createdAt' | 'updatedAt' | 'title';
  /** Sort direction */
  sortOrder: 'asc' | 'desc';
}

/** Research note event */
export type ResearchNoteEvent =
  | { type: 'note_created'; note: ResearchNote }
  | { type: 'note_updated'; noteId: string; changes: Partial<ResearchNote> }
  | { type: 'note_deleted'; noteId: string }
  | { type: 'note_linked'; noteId: string; messageId?: string; taskId?: string };

// ============================================================
// 2. Sync Rule Definitions
// ============================================================

/**
 * Research notes sync rule
 *
 * Features:
 * - Server is the authoritative source
 * - Both desktop and mobile can read and write
 * - Persisted to database
 * - Bidirectional sync
 * - Supports merge conflict resolution
 */
export const researchNotesSyncRule: SyncRule = {
  dataType: 'researchNotes',
  description: 'Research note cards',
  endpoints: {
    server: { access: 'owner' },
    desktop: { access: 'readwrite' },
    mobile: { access: 'readwrite' },
    web: { access: 'readwrite' },
    agent: { access: 'read' },  // Agent can read notes but not modify them
  },
  persistence: {
    strategy: 'database',
    table: 'research_notes',
  },
  sync: {
    direction: 'bidirectional',
    conflictStrategy: 'merge',
    throttleMs: 1000,  // Notes do not need real-time sync, 1s throttle
  },
  interactionSignals: {
    canTrigger: ['desktop', 'mobile', 'web'],
    targetEndpoints: ['server', 'agent'],
    signalTypes: ['note_created', 'note_updated', 'note_deleted', 'note_linked'],
  },
};

/**
 * Create rule using SyncRuleBuilder (alternative approach)
 */
export function createResearchNotesRule(): SyncRule {
  return new SyncRuleBuilder('researchNotes', 'Research note cards')
    .serverOwned()
    .endpoint('desktop', 'readwrite')
    .endpoint('mobile', 'readwrite')
    .endpoint('web', 'readwrite')
    .endpoint('agent', 'read')
    .persist('database', { table: 'research_notes' })
    .bidirectional('merge')
    .throttle(1000)
    .interactions({
      canTrigger: ['desktop', 'mobile', 'web'],
      targetEndpoints: ['server', 'agent'],
    })
    .build();
}

// ============================================================
// 3. Store Actions Definitions
// ============================================================

/**
 * Research notes Store Actions
 *
 * These actions should be added to WorkspaceStore
 */
export interface ResearchNotesActions {
  // Batch set (for FULL_STATE)
  setResearchNotes: (notes: ResearchNote[]) => void;

  // Incremental updates (for STATE_DELTA)
  addResearchNote: (note: ResearchNote) => void;
  updateResearchNote: (id: string, changes: Partial<ResearchNote>) => void;
  deleteResearchNote: (id: string) => void;

  // Local operations
  setActiveNote: (id: string | null) => void;
  setFilterTags: (tags: string[]) => void;
  setSortBy: (sortBy: ResearchNotesState['sortBy']) => void;
  setSortOrder: (order: ResearchNotesState['sortOrder']) => void;

  // Linking
  linkNoteToMessage: (noteId: string, messageId: string) => void;
  linkNoteToTask: (noteId: string, taskId: string) => void;
}

/**
 * Create research notes Store slice
 *
 * Example: how to add this data type to a Zustand Store
 *
 * ```typescript
 * // In workspaceStore.ts:
 * import { createResearchNotesSlice } from '@/lib/sync/examples/researchNotes';
 *
 * export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>((set, get) => ({
 *   ...initialState,
 *   ...createResearchNotesSlice(set, get),
 *   // ... other actions
 * }));
 * ```
 */
export function createResearchNotesSlice(
  set: (state: any) => void,
  get: () => any
): ResearchNotesState & ResearchNotesActions {
  return {
    // Initial state
    notes: [],
    activeNoteId: null,
    filterTags: [],
    sortBy: 'updatedAt',
    sortOrder: 'desc',

    // Actions
    setResearchNotes: (notes) => {
      set({ notes });
    },

    addResearchNote: (note) => {
      set((state: any) => {
        // Deduplicate by ID
        if (state.notes.some((n: ResearchNote) => n.id === note.id)) {
          return state;
        }
        return { notes: [...state.notes, note] };
      });
    },

    updateResearchNote: (id, changes) => {
      set((state: any) => ({
        notes: state.notes.map((n: ResearchNote) =>
          n.id === id ? { ...n, ...changes, updatedAt: Date.now() } : n
        ),
      }));
    },

    deleteResearchNote: (id) => {
      set((state: any) => ({
        notes: state.notes.filter((n: ResearchNote) => n.id !== id),
        activeNoteId: state.activeNoteId === id ? null : state.activeNoteId,
      }));
    },

    setActiveNote: (id) => {
      set({ activeNoteId: id });
    },

    setFilterTags: (tags) => {
      set({ filterTags: tags });
    },

    setSortBy: (sortBy) => {
      set({ sortBy });
    },

    setSortOrder: (order) => {
      set({ sortOrder: order });
    },

    linkNoteToMessage: (noteId, messageId) => {
      set((state: any) => ({
        notes: state.notes.map((n: ResearchNote) =>
          n.id === noteId
            ? {
                ...n,
                linkedMessageIds: [...(n.linkedMessageIds || []), messageId],
                updatedAt: Date.now(),
              }
            : n
        ),
      }));
    },

    linkNoteToTask: (noteId, taskId) => {
      set((state: any) => ({
        notes: state.notes.map((n: ResearchNote) =>
          n.id === noteId
            ? {
                ...n,
                linkedTaskIds: [...(n.linkedTaskIds || []), taskId],
                updatedAt: Date.now(),
              }
            : n
        ),
      }));
    },
  };
}

// ============================================================
// 4. Helper Functions
// ============================================================

/**
 * Create a new note
 */
export function createResearchNote(
  title: string,
  content: string = '',
  options: Partial<Omit<ResearchNote, 'id' | 'createdAt' | 'updatedAt'>> = {}
): ResearchNote {
  const now = Date.now();
  return {
    id: `note-${now}-${Math.random().toString(36).slice(2, 9)}`,
    creatorId: 'user',
    title,
    content,
    tags: [],
    color: 'default',
    pinned: false,
    ...options,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get all tags from notes
 */
export function getAllTags(notes: ResearchNote[]): string[] {
  const tagSet = new Set<string>();
  notes.forEach(note => {
    note.tags.forEach(tag => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Filter and sort notes
 */
export function filterAndSortNotes(
  notes: ResearchNote[],
  state: Pick<ResearchNotesState, 'filterTags' | 'sortBy' | 'sortOrder'>
): ResearchNote[] {
  let result = [...notes];

  // Filter
  if (state.filterTags.length > 0) {
    result = result.filter(note =>
      state.filterTags.some(tag => note.tags.includes(tag))
    );
  }

  // Pinned items first
  result.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  // Sort
  result.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    let comparison = 0;
    switch (state.sortBy) {
      case 'createdAt':
        comparison = a.createdAt - b.createdAt;
        break;
      case 'updatedAt':
        comparison = a.updatedAt - b.updatedAt;
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
    }

    return state.sortOrder === 'asc' ? comparison : -comparison;
  });

  return result;
}

// ============================================================
// 5. Exports
// ============================================================

export default {
  // Types
  // (exported at top level)

  // Sync Rule
  researchNotesSyncRule,
  createResearchNotesRule,

  // Store
  createResearchNotesSlice,

  // Helpers
  createResearchNote,
  getAllTags,
  filterAndSortNotes,
};
