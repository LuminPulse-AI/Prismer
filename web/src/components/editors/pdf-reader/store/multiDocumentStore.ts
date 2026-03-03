/**
 * Multi-Document Store
 * 
 * Manages the state of multiple open PDF documents
 * Supports: document open/close, tab switching, independent view state
 */

import { create } from "zustand";
import { PDFSource, PaperContext } from "@/types/paperContext";
import { ReadingMode } from "../components/PDFToolbar";

// ============================================================================
// Types
// ============================================================================

export interface DocumentViewState {
  pageNumber: number;
  scale: number;
  readingMode: ReadingMode;
  scrollPosition?: { x: number; y: number };
}

export interface DocumentInstance {
  /** Unique document ID */
  id: string;
  /** PDF source information */
  source: PDFSource;
  /** Paper context (populated after loading) */
  paperContext: PaperContext | null;
  /** View state */
  viewState: DocumentViewState;
  /** Total page count */
  numPages: number;
  /** Loading state */
  loadingState: "idle" | "loading" | "loaded" | "error";
  /** Error message */
  error?: string;
  /** Whether there are unsaved changes (notes, etc.) */
  isDirty: boolean;
  /** Opened timestamp */
  openedAt: number;
}

export interface MultiDocumentState {
  /** Map of opened documents */
  documents: Map<string, DocumentInstance>;
  /** Current active document ID */
  activeDocumentId: string | null;
  /** Document tab order */
  tabOrder: string[];
}

export interface MultiDocumentActions {
  /** Open a new document */
  openDocument: (source: PDFSource) => string;
  /** Close a document */
  closeDocument: (id: string) => void;
  /** Switch active document */
  setActiveDocument: (id: string) => void;
  /** Update document view state */
  updateViewState: (id: string, state: Partial<DocumentViewState>) => void;
  /** Set document total page count */
  setDocumentNumPages: (id: string, numPages: number) => void;
  /** Set document Paper Context */
  setDocumentContext: (id: string, context: PaperContext | null) => void;
  /** Set document loading state */
  setDocumentLoadingState: (id: string, state: DocumentInstance["loadingState"], error?: string) => void;
  /** Set document dirty flag */
  setDocumentDirty: (id: string, isDirty: boolean) => void;
  /** Reorder tabs */
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  /** Get current active document */
  getActiveDocument: () => DocumentInstance | null;
  /** Reset all state */
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialViewState: DocumentViewState = {
  pageNumber: 1,
  scale: 1.0,
  readingMode: "single",
};

const initialState: MultiDocumentState = {
  documents: new Map(),
  activeDocumentId: null,
  tabOrder: [],
};

// ============================================================================
// Store
// ============================================================================

export const useMultiDocumentStore = create<MultiDocumentState & MultiDocumentActions>(
  (set, get) => ({
    ...initialState,

    openDocument: (source: PDFSource) => {
      const id = source.arxivId || `doc-${Date.now()}`;
      
      // Check if already open
      const existingDoc = get().documents.get(id);
      if (existingDoc) {
        // If already open, switch to that document directly
        set({ activeDocumentId: id });
        return id;
      }

      const newDocument: DocumentInstance = {
        id,
        source,
        paperContext: null,
        viewState: { ...initialViewState },
        numPages: 0,
        loadingState: "idle",
        isDirty: false,
        openedAt: Date.now(),
      };

      set((state) => {
        const newDocuments = new Map(state.documents);
        newDocuments.set(id, newDocument);
        return {
          documents: newDocuments,
          activeDocumentId: id,
          tabOrder: [...state.tabOrder, id],
        };
      });

      return id;
    },

    closeDocument: (id: string) => {
      set((state) => {
        const newDocuments = new Map(state.documents);
        newDocuments.delete(id);
        
        const newTabOrder = state.tabOrder.filter((tabId) => tabId !== id);
        
        // If the closed document is the active one, switch to the next
        let newActiveId = state.activeDocumentId;
        if (state.activeDocumentId === id) {
          const closedIndex = state.tabOrder.indexOf(id);
          if (newTabOrder.length > 0) {
            // Prefer the one on the right, otherwise select the one on the left
            newActiveId = newTabOrder[Math.min(closedIndex, newTabOrder.length - 1)];
          } else {
            newActiveId = null;
          }
        }

        return {
          documents: newDocuments,
          activeDocumentId: newActiveId,
          tabOrder: newTabOrder,
        };
      });
    },

    setActiveDocument: (id: string) => {
      const doc = get().documents.get(id);
      if (doc) {
        set({ activeDocumentId: id });
      }
    },

    updateViewState: (id: string, state: Partial<DocumentViewState>) => {
      set((prevState) => {
        const doc = prevState.documents.get(id);
        if (!doc) return prevState;

        const newDocuments = new Map(prevState.documents);
        newDocuments.set(id, {
          ...doc,
          viewState: { ...doc.viewState, ...state },
        });
        return { documents: newDocuments };
      });
    },

    setDocumentNumPages: (id: string, numPages: number) => {
      set((prevState) => {
        const doc = prevState.documents.get(id);
        if (!doc) return prevState;

        const newDocuments = new Map(prevState.documents);
        newDocuments.set(id, { ...doc, numPages });
        return { documents: newDocuments };
      });
    },

    setDocumentContext: (id: string, context: PaperContext | null) => {
      set((prevState) => {
        const doc = prevState.documents.get(id);
        if (!doc) return prevState;

        const newDocuments = new Map(prevState.documents);
        newDocuments.set(id, { ...doc, paperContext: context });
        return { documents: newDocuments };
      });
    },

    setDocumentLoadingState: (
      id: string,
      loadingState: DocumentInstance["loadingState"],
      error?: string
    ) => {
      set((prevState) => {
        const doc = prevState.documents.get(id);
        if (!doc) return prevState;

        const newDocuments = new Map(prevState.documents);
        newDocuments.set(id, { ...doc, loadingState, error });
        return { documents: newDocuments };
      });
    },

    setDocumentDirty: (id: string, isDirty: boolean) => {
      set((prevState) => {
        const doc = prevState.documents.get(id);
        if (!doc) return prevState;

        const newDocuments = new Map(prevState.documents);
        newDocuments.set(id, { ...doc, isDirty });
        return { documents: newDocuments };
      });
    },

    reorderTabs: (fromIndex: number, toIndex: number) => {
      set((state) => {
        const newTabOrder = [...state.tabOrder];
        const [movedId] = newTabOrder.splice(fromIndex, 1);
        newTabOrder.splice(toIndex, 0, movedId);
        return { tabOrder: newTabOrder };
      });
    },

    getActiveDocument: () => {
      const { documents, activeDocumentId } = get();
      if (!activeDocumentId) return null;
      return documents.get(activeDocumentId) || null;
    },

    reset: () => {
      set(initialState);
    },
  })
);

// ============================================================================
// Selectors
// ============================================================================

export const selectActiveDocument = (state: MultiDocumentState & MultiDocumentActions) =>
  state.activeDocumentId ? state.documents.get(state.activeDocumentId) || null : null;

export const selectDocumentList = (state: MultiDocumentState & MultiDocumentActions) =>
  state.tabOrder.map((id) => state.documents.get(id)).filter(Boolean) as DocumentInstance[];

export const selectDocumentCount = (state: MultiDocumentState & MultiDocumentActions) =>
  state.documents.size;
