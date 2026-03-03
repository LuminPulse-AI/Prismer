import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface PDFState {
  // Document state
  numPages: number;
  currentPage: number;
  loading: boolean;
  error: string | null;
  
  // View state
  scale: number;
  rotation: number;
  pageSize: { width: number; height: number };
  
  // Interaction state
  selectedText: string;
  annotations: Array<{
    id: string;
    type: 'highlight' | 'note' | 'drawing';
    page: number;
    position: { x: number; y: number; width?: number; height?: number };
    content: string;
    timestamp: number;
  }>;
  
  // Search state
  searchQuery: string;
  searchResults: Array<{
    page: number;
    text: string;
    position: { x: number; y: number };
  }>;
  currentSearchIndex: number;
}

interface PDFActions {
  // Document actions
  setNumPages: (pages: number) => void;
  setCurrentPage: (page: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // View actions
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setRotation: (rotation: number) => void;
  rotate: () => void;
  setPageSize: (size: { width: number; height: number }) => void;
  
  // Interaction actions
  setSelectedText: (text: string) => void;
  clearSelectedText: () => void;
  addAnnotation: (annotation: Omit<PDFState['annotations'][0], 'id' | 'timestamp'>) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, updates: Partial<PDFState['annotations'][0]>) => void;
  
  // Search actions
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: PDFState['searchResults']) => void;
  goToNextSearchResult: () => void;
  goToPrevSearchResult: () => void;
  clearSearch: () => void;
  
  // Reset state
  reset: () => void;
}

const initialState: PDFState = {
  numPages: 0,
  currentPage: 1,
  loading: false,
  error: null,
  scale: 1.0,
  rotation: 0,
  pageSize: { width: 0, height: 0 },
  selectedText: '',
  annotations: [],
  searchQuery: '',
  searchResults: [],
  currentSearchIndex: -1,
};

export const usePDFStore = create<PDFState & PDFActions>()(
  devtools(
    (set, get) => ({
      ...initialState,
      
      // Document actions
      setNumPages: (pages) => set({ numPages: pages }),
      setCurrentPage: (page) => set({ currentPage: Math.max(1, Math.min(page, get().numPages)) }),
      goToNextPage: () => {
        const { currentPage, numPages } = get();
        if (currentPage < numPages) {
          set({ currentPage: currentPage + 1 });
        }
      },
      goToPrevPage: () => {
        const { currentPage } = get();
        if (currentPage > 1) {
          set({ currentPage: currentPage - 1 });
        }
      },
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      
      // View actions
      setScale: (scale) => set({ scale: Math.max(0.1, Math.min(5.0, scale)) }),
      zoomIn: () => {
        const { scale } = get();
        set({ scale: Math.min(scale + 0.2, 5.0) });
      },
      zoomOut: () => {
        const { scale } = get();
        set({ scale: Math.max(scale - 0.2, 0.1) });
      },
      resetZoom: () => set({ scale: 1.0 }),
      setRotation: (rotation) => set({ rotation: rotation % 360 }),
      rotate: () => {
        const { rotation } = get();
        set({ rotation: (rotation + 90) % 360 });
      },
      setPageSize: (size) => set({ pageSize: size }),
      
      // Interaction actions
      setSelectedText: (text) => set({ selectedText: text }),
      clearSelectedText: () => set({ selectedText: '' }),
      addAnnotation: (annotation) => set((state) => ({
        annotations: [
          ...state.annotations,
          {
            ...annotation,
            id: `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
          }
        ]
      })),
      removeAnnotation: (id) => set((state) => ({
        annotations: state.annotations.filter(ann => ann.id !== id)
      })),
      updateAnnotation: (id, updates) => set((state) => ({
        annotations: state.annotations.map(ann => 
          ann.id === id ? { ...ann, ...updates } : ann
        )
      })),
      
      // Search actions
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchResults: (results) => set({ 
        searchResults: results,
        currentSearchIndex: results.length > 0 ? 0 : -1
      }),
      goToNextSearchResult: () => {
        const { searchResults, currentSearchIndex } = get();
        if (searchResults.length > 0) {
          const nextIndex = (currentSearchIndex + 1) % searchResults.length;
          set({ currentSearchIndex: nextIndex });
          // Jump to the corresponding page
          const result = searchResults[nextIndex];
          if (result) {
            set({ currentPage: result.page });
          }
        }
      },
      goToPrevSearchResult: () => {
        const { searchResults, currentSearchIndex } = get();
        if (searchResults.length > 0) {
          const prevIndex = currentSearchIndex <= 0 ? searchResults.length - 1 : currentSearchIndex - 1;
          set({ currentSearchIndex: prevIndex });
          // Jump to the corresponding page
          const result = searchResults[prevIndex];
          if (result) {
            set({ currentPage: result.page });
          }
        }
      },
      clearSearch: () => set({ 
        searchQuery: '', 
        searchResults: [], 
        currentSearchIndex: -1 
      }),
      
      // Reset state
      reset: () => set(initialState),
    }),
    {
      name: 'pdf-store',
      partialize: (state: PDFState) => ({
        scale: state.scale,
        rotation: state.rotation,
        annotations: state.annotations,
      }),
    }
  )
); 