/**
 * Insight Store
 * 
 * Paper-level Quick Insights management
 * - Caches insights per paper
 * - Supports automatic switching when switching papers
 * - Persists to IndexedDB
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { PaperContext, PaperInsight } from '@/types/paperContext';
import { Citation } from '../types/citation';
import { createUserIsolatedStorage } from '@/lib/storage/userStorageManager';

// Stable empty array to avoid infinite loop
const EMPTY_INSIGHTS: PaperInsight[] = [];

// ============================================================
// Type Definitions
// ============================================================

/**
 * Paper Insights cache
 */
export interface PaperInsightsCache {
  paperId: string;
  paperTitle?: string;
  insights: PaperInsight[];
  generatedAt: number;
  version: string;
}

// ============================================================
// Store State
// ============================================================

interface InsightState {
  /** Insights cached per paper */
  paperInsightsCache: Record<string, PaperInsightsCache>;

  /** Current active paper ID */
  currentPaperId: string | null;

  /** Loading state */
  isLoading: boolean;

  /** Error message */
  error: string | null;
}

interface InsightActions {
  // Paper switching
  setCurrentPaper: (paperId: string) => void;

  // Insights management
  setInsights: (paperId: string, insights: PaperInsight[], paperTitle?: string) => void;
  addInsight: (paperId: string, insight: PaperInsight) => void;
  clearInsights: (paperId: string) => void;

  // Cache management
  getCachedInsights: (paperId: string) => PaperInsightsCache | null;
  hasValidCache: (paperId: string, maxAge?: number) => boolean;
  clearCache: (paperId?: string) => void;

  // Quick access for current paper
  getCurrentInsights: () => PaperInsight[];

  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ============================================================
// Constants
// ============================================================

/** Cache version, used to invalidate old caches */
const CACHE_VERSION = '1.0';

/** Default cache TTL (24 hours) */
const DEFAULT_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

// ============================================================
// Store Implementation
// ============================================================

export const useInsightStore = create<InsightState & InsightActions>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        paperInsightsCache: {},
        currentPaperId: null,
        isLoading: false,
        error: null,
        
        // ============================================================
        // Paper switching
        // ============================================================
        
        setCurrentPaper: (paperId) => {
          const { currentPaperId } = get();
          
          // If the same paper, do nothing
          if (currentPaperId === paperId) return;
          
          set({ currentPaperId: paperId, error: null });
          
          console.log(`[InsightStore] Switched to paper: ${paperId}`);
        },
        
        // ============================================================
        // Insights management
        // ============================================================
        
        setInsights: (paperId, insights, paperTitle) => {
          const cache: PaperInsightsCache = {
            paperId,
            paperTitle,
            insights,
            generatedAt: Date.now(),
            version: CACHE_VERSION,
          };
          
          set(state => ({
            paperInsightsCache: {
              ...state.paperInsightsCache,
              [paperId]: cache,
            },
            error: null,
          }));
          
          console.log(`[InsightStore] Cached ${insights.length} insights for paper: ${paperId}`);
        },
        
        addInsight: (paperId, insight) => {
          set(state => {
            const existing = state.paperInsightsCache[paperId];
            if (!existing) {
              return {
                paperInsightsCache: {
                  ...state.paperInsightsCache,
                  [paperId]: {
                    paperId,
                    insights: [insight],
                    generatedAt: Date.now(),
                    version: CACHE_VERSION,
                  },
                },
              };
            }
            
            return {
              paperInsightsCache: {
                ...state.paperInsightsCache,
                [paperId]: {
                  ...existing,
                  insights: [...existing.insights, insight],
                },
              },
            };
          });
        },
        
        clearInsights: (paperId) => {
          set(state => {
            const newCache = { ...state.paperInsightsCache };
            delete newCache[paperId];
            return { paperInsightsCache: newCache };
          });
        },
        
        // ============================================================
        // Cache management
        // ============================================================
        
        getCachedInsights: (paperId) => {
          return get().paperInsightsCache[paperId] || null;
        },
        
        hasValidCache: (paperId, maxAge = DEFAULT_CACHE_MAX_AGE) => {
          const cache = get().paperInsightsCache[paperId];
          if (!cache) return false;
          
          // Version check
          if (cache.version !== CACHE_VERSION) return false;
          
          // Time check
          const age = Date.now() - cache.generatedAt;
          if (age > maxAge) return false;
          
          // Content check
          if (!cache.insights || cache.insights.length === 0) return false;
          
          return true;
        },
        
        clearCache: (paperId) => {
          if (paperId) {
            get().clearInsights(paperId);
          } else {
            set({ paperInsightsCache: {} });
          }
        },
        
        // ============================================================
        // Quick access for current paper
        // ============================================================
        
        getCurrentInsights: () => {
          const { currentPaperId, paperInsightsCache } = get();
          if (!currentPaperId) return [];
          return paperInsightsCache[currentPaperId]?.insights || [];
        },
        
        // ============================================================
        // State management
        // ============================================================
        
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),
      }),
      {
        name: 'insight-storage',
        version: 1,
        // Use user-isolated storage; unauthenticated users do not persist insights cache
        storage: createUserIsolatedStorage('insight-storage', true),
        partialize: (state) => ({
          paperInsightsCache: state.paperInsightsCache,
          currentPaperId: state.currentPaperId,
        }),
        migrate: (persistedState: any, version: number) => {
          // Handle migration from older versions
          if (version === 0) {
            // Clear old data if structure is incompatible
            return { paperInsightsCache: {}, currentPaperId: null };
          }
          return persistedState as InsightState;
        },
      }
    ),
    { name: 'InsightStore' }
  )
);

// ============================================================
// Hooks
// ============================================================

/**
 * Get Insights for the current paper
 */
export function useCurrentInsights(): PaperInsight[] {
  return useInsightStore(
    useShallow(state => {
      if (!state.currentPaperId) return EMPTY_INSIGHTS;
      return state.paperInsightsCache[state.currentPaperId]?.insights ?? EMPTY_INSIGHTS;
    })
  );
}

/**
 * Get Insight loading state
 */
export function useInsightLoading(): boolean {
  return useInsightStore(state => state.isLoading);
}

/**
 * Get Insight error message
 */
export function useInsightError(): string | null {
  return useInsightStore(state => state.error);
}

/**
 * Get Insights for a specific paper
 */
export function usePaperInsights(paperId: string): PaperInsight[] {
  return useInsightStore(
    useShallow(state =>
      state.paperInsightsCache[paperId]?.insights ?? EMPTY_INSIGHTS
    )
  );
}

/**
 * Check if a specific paper has a valid cache
 */
export function useHasInsightCache(paperId: string): boolean {
  return useInsightStore(state => {
    const cache = state.paperInsightsCache[paperId];
    if (!cache) return false;
    if (cache.version !== CACHE_VERSION) return false;
    return cache.insights && cache.insights.length > 0;
  });
}

/**
 * Clear all Insights cache (used on logout)
 */
export function clearAllInsights(): void {
  useInsightStore.setState({
    paperInsightsCache: {},
    currentPaperId: null,
    isLoading: false,
    error: null,
  });
}
