/**
 * Citation Store
 * 
 * Manages bidirectional index state: detection data, citation highlights, navigation, etc.
 * Supports multi-document: each document has an independent detection data index
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  Detection,
  BoundingBox,
  PageDetection,
  PaperMetadata,
} from '@/types/paperContext';

// ============================================================
// Types
// ============================================================

/**
 * Flattened detection data (with added pageNumber and paperId)
 */
export interface FlatDetection extends Detection {
  pageNumber: number;
  paperId?: string;
}

/**
 * Detection data for a single document
 */
interface DocumentDetectionData {
  detectionIndex: Map<string, FlatDetection>;
  pageDetections: Map<number, FlatDetection[]>;
  metadata: PaperMetadata | null;
}

/**
 * Citation Store state
 */
interface CitationState {
  // Current active paper ID
  activePaperId: string | null;

  // Multi-document detection data cache: paperId -> DocumentDetectionData
  documentCache: Map<string, DocumentDetectionData>;

  // Detection index for the current document (fast access)
  detectionIndex: Map<string, FlatDetection>;

  // Detection data grouped by page for the current document
  pageDetections: Map<number, FlatDetection[]>;

  // Current document metadata
  metadata: PaperMetadata | null;

  // Currently active citations (highlighted)
  activeCitations: string[];

  // Hovered citation (preview)
  hoveredCitation: string | null;

  // Data loading state
  isLoaded: boolean;
  isLoading: boolean;
  error: string | null;

  // Page dimension cache (for coordinate conversion)
  pageDimensions: Map<number, { width: number; height: number }>;
}

/**
 * Citation Store actions
 */
interface CitationActions {
  // Multi-document management
  setActivePaper: (paperId: string) => void;
  loadDetectionsForPaper: (paperId: string, pages: PageDetection[]) => void;

  // Data loading (backward compatible)
  loadDetections: (pages: PageDetection[], paperId?: string) => void;
  setMetadata: (metadata: PaperMetadata) => void;
  setPageDimensions: (pageNumber: number, dimensions: { width: number; height: number }) => void;

  // Detection data queries
  getDetection: (id: string) => FlatDetection | undefined;
  getPageDetections: (pageNumber: number) => FlatDetection[];
  getDetectionsByLabel: (label: string) => FlatDetection[];
  searchDetections: (query: string) => FlatDetection[];

  // Cross-document detection query
  getDetectionFromAnyPaper: (detectionId: string) => { detection: FlatDetection; paperId: string } | null;

  // Citation highlight management
  setActiveCitations: (ids: string[]) => void;
  addActiveCitation: (id: string) => void;
  removeActiveCitation: (id: string) => void;
  clearActiveCitations: () => void;

  // Hover management
  setHoveredCitation: (id: string | null) => void;

  // Navigation
  scrollToDetection: (id: string) => void;

  // Temporary highlight (auto-clear)
  flashCitation: (id: string, duration?: number) => void;

  // Reset
  reset: () => void;
  resetCurrentPaper: () => void;
}

// ============================================================
// Initial State
// ============================================================

const initialState: CitationState = {
  activePaperId: null,
  documentCache: new Map(),
  detectionIndex: new Map(),
  pageDetections: new Map(),
  metadata: null,
  activeCitations: [],
  hoveredCitation: null,
  isLoaded: false,
  isLoading: false,
  error: null,
  pageDimensions: new Map(),
};

// ============================================================
// Store
// ============================================================

export const useCitationStore = create<CitationState & CitationActions>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Set active paper
      setActivePaper: (paperId: string) => {
        const state = get();
        
        // If already the active paper, do nothing
        if (state.activePaperId === paperId) return;
        
        // Check if the cache has data for this paper
        const cached = state.documentCache.get(paperId);
        
        if (cached) {
          // Restore data from cache
          set({
            activePaperId: paperId,
            detectionIndex: cached.detectionIndex,
            pageDetections: cached.pageDetections,
            metadata: cached.metadata,
            isLoaded: true,
          });
          console.log(`[CitationStore] Switched to cached paper: ${paperId}`);
        } else {
          // Mark as needing to be loaded
          set({
            activePaperId: paperId,
            detectionIndex: new Map(),
            pageDetections: new Map(),
            metadata: null,
            isLoaded: false,
          });
        }
      },

      // Load detection data for a specific paper
      loadDetectionsForPaper: (paperId: string, pages: PageDetection[]) => {
        get().loadDetections(pages, paperId);
      },

      // Load detection data (supports multi-document)
      loadDetections: (pages: PageDetection[], paperId?: string) => {
        set({ isLoading: true, error: null });
        
        const effectivePaperId = paperId || get().activePaperId || 'default';
        
        try {
          const detectionIndex = new Map<string, FlatDetection>();
          const pageDetections = new Map<number, FlatDetection[]>();
          
          for (const page of pages) {
            const pageNumber = page.page_number;
            const flatDetections: FlatDetection[] = [];
            
            for (const detection of page.detections) {
              const flatDetection: FlatDetection = {
                ...detection,
                pageNumber,
                paperId: effectivePaperId,
              };
              
              // Add to index
              detectionIndex.set(detection.id, flatDetection);
              flatDetections.push(flatDetection);
            }
            
            // Group by page
            pageDetections.set(pageNumber, flatDetections);
          }
          
          // Save to cache
          const documentCache = new Map(get().documentCache);
          documentCache.set(effectivePaperId, {
            detectionIndex,
            pageDetections,
            metadata: get().metadata,
          });
          
          set({
            activePaperId: effectivePaperId,
            documentCache,
            detectionIndex,
            pageDetections,
            isLoaded: true,
            isLoading: false,
          });
          
          console.log(`[CitationStore] Loaded ${detectionIndex.size} detections for paper: ${effectivePaperId}`);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to load detections',
            isLoading: false,
          });
        }
      },

      // Set metadata
      setMetadata: (metadata: PaperMetadata) => {
        set({ metadata });
      },

      // Set page dimensions
      setPageDimensions: (pageNumber: number, dimensions: { width: number; height: number }) => {
        set((state) => {
          const newDimensions = new Map(state.pageDimensions);
          newDimensions.set(pageNumber, dimensions);
          return { pageDimensions: newDimensions };
        });
      },

      // Get a single detection
      getDetection: (id: string) => {
        return get().detectionIndex.get(id);
      },

      // Get page detection data
      getPageDetections: (pageNumber: number) => {
        return get().pageDetections.get(pageNumber) || [];
      },

      // Get detections by label
      getDetectionsByLabel: (label: string) => {
        const results: FlatDetection[] = [];
        get().detectionIndex.forEach((detection) => {
          if (detection.label === label) {
            results.push(detection);
          }
        });
        return results;
      },

      // Search detection content
      searchDetections: (query: string) => {
        const lowerQuery = query.toLowerCase();
        const results: FlatDetection[] = [];
        get().detectionIndex.forEach((detection) => {
          if (detection.text.toLowerCase().includes(lowerQuery)) {
            results.push(detection);
          }
        });
        return results;
      },

      // Get detection data from any paper (for cross-document citations)
      getDetectionFromAnyPaper: (detectionId: string) => {
        const state = get();
        
        // First check the current active document
        const current = state.detectionIndex.get(detectionId);
        if (current) {
          return { detection: current, paperId: state.activePaperId || 'default' };
        }
        
        // Iterate through all cached documents
        for (const [paperId, data] of state.documentCache.entries()) {
          const detection = data.detectionIndex.get(detectionId);
          if (detection) {
            return { detection, paperId };
          }
        }
        
        return null;
      },

      // Set active citations
      setActiveCitations: (ids: string[]) => {
        set({ activeCitations: ids });
      },

      // Add active citation
      addActiveCitation: (id: string) => {
        set((state) => {
          if (state.activeCitations.includes(id)) {
            return state;
          }
          return { activeCitations: [...state.activeCitations, id] };
        });
      },

      // Remove active citation
      removeActiveCitation: (id: string) => {
        set((state) => ({
          activeCitations: state.activeCitations.filter((c) => c !== id),
        }));
      },

      // Clear all active citations
      clearActiveCitations: () => {
        set({ activeCitations: [] });
      },

      // Set hovered citation
      setHoveredCitation: (id: string | null) => {
        set({ hoveredCitation: id });
      },

      // Scroll to detection position
      scrollToDetection: (id: string) => {
        const state = get();
        const detection = state.detectionIndex.get(id);
        
        console.log('[CitationStore] scrollToDetection:', { 
          requestedId: id, 
          found: !!detection,
          pageNumber: detection?.pageNumber,
          text: detection?.text?.slice(0, 50),
        });
        
        if (!detection) {
          console.warn(`[CitationStore] Detection not found: ${id}`);
          return;
        }
        
        // Dispatch event to let PDF Viewer handle scrolling
        window.dispatchEvent(
          new CustomEvent('pdf-scroll-to-detection', {
            detail: {
              detectionId: id,
              pageNumber: detection.pageNumber,
              bbox: detection.boxes[0],
            },
          })
        );
        
        // Highlight this detection
        get().flashCitation(id);
      },

      // Temporary highlight
      flashCitation: (id: string, duration = 3000) => {
        const { addActiveCitation, removeActiveCitation } = get();
        addActiveCitation(id);
        
        setTimeout(() => {
          removeActiveCitation(id);
        }, duration);
      },

      // Reset current paper data (preserve cache)
      resetCurrentPaper: () => {
        set({
          activePaperId: null,
          detectionIndex: new Map(),
          pageDetections: new Map(),
          metadata: null,
          activeCitations: [],
          hoveredCitation: null,
          isLoaded: false,
          isLoading: false,
          error: null,
        });
      },

      // Full reset (clear all caches)
      reset: () => {
        set(initialState);
      },
    }),
    { name: 'citation-store' }
  )
);

// ============================================================
// Selectors
// ============================================================

/**
 * Selector: get active citations for a specific page
 */
export const selectActiveCitationsForPage = (pageNumber: number) => (state: CitationState) => {
  const pageDetectionIds = state.pageDetections.get(pageNumber)?.map((d) => d.id) || [];
  return state.activeCitations.filter((id) => pageDetectionIds.includes(id));
};

/**
 * Selector: check if a detection is active
 */
export const selectIsDetectionActive = (id: string) => (state: CitationState) => {
  return state.activeCitations.includes(id);
};

/**
 * Selector: check if a detection is hovered
 */
export const selectIsDetectionHovered = (id: string) => (state: CitationState) => {
  return state.hoveredCitation === id;
};

/**
 * Selector: get detection statistics
 */
export const selectDetectionStats = (state: CitationState) => {
  const stats = {
    total: state.detectionIndex.size,
    byLabel: {} as Record<string, number>,
    byPage: {} as Record<number, number>,
  };
  
  state.detectionIndex.forEach((detection) => {
    // Count by label
    stats.byLabel[detection.label] = (stats.byLabel[detection.label] || 0) + 1;
    // Count by page
    stats.byPage[detection.pageNumber] = (stats.byPage[detection.pageNumber] || 0) + 1;
  });
  
  return stats;
};

// ============================================================
// Utilities
// ============================================================

/**
 * Parse page number from detection ID
 * @example "p1_text_0" -> 1
 */
export function parsePageFromDetectionId(id: string): number | null {
  const match = id.match(/^p(\d+)_/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse type from detection ID
 * @example "p1_text_0" -> "text"
 */
export function parseTypeFromDetectionId(id: string): string | null {
  const match = id.match(/^p\d+_(\w+)_\d+$/);
  return match ? match[1] : null;
}

/**
 * Check if the detection ID format is valid
 */
export function isValidDetectionId(id: string): boolean {
  return /^p\d+_\w+_\d+$/.test(id);
}

