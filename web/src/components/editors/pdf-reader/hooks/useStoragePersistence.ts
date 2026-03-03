/**
 * Storage Persistence Hook
 * 
 * Automatically syncs Zustand stores to IndexedDB
 * - Auto-save
 * - Load on startup
 * - Debounced writes
 */

import { useEffect, useRef, useCallback } from 'react';
import { useChatSessionStore, ChatSession } from '../store/chatSessionStore';
import { useNotebookStore, Notebook } from '../store/notebookStore';
import { useInsightStore, PaperInsightsCache } from '../store/insightStore';
import { useStorage, getUserStorageManager } from '@/lib/storage';
import { ChatSession as StorageChatSession, Notebook as StorageNotebook } from '@/lib/storage/types';

// ============================================================
// Type Conversion
// ============================================================

/**
 * Convert Store ChatSession to Storage format
 */
function toStorageChatSession(session: ChatSession): StorageChatSession {
  return {
    id: session.id,
    title: session.title,
    paperIds: session.paperIds,
    messages: session.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.rawContent,
      citations: m.citations.map(c => ({
        id: c.uri,
        paperId: c.paperId,
        paperTitle: c.paperTitle || '',
        detectionId: c.detectionId,
        pageNumber: c.pageNumber,
        excerpt: c.excerpt || '',
        createdAt: m.timestamp,
      })),
      timestamp: m.timestamp,
    })),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
  };
}

/**
 * Convert Storage ChatSession to Store format
 */
function fromStorageChatSession(session: StorageChatSession): ChatSession {
  return {
    id: session.id,
    title: session.title,
    paperIds: session.paperIds,
    paperAliasMap: {}, // Will be recalculated after loading
    messages: session.messages.map(m => ({
      id: m.id,
      role: m.role,
      rawContent: m.content,
      citations: (m.citations || []).map(c => ({
        uri: `${c.paperId}#${c.detectionId}` as const,
        paperId: c.paperId,
        detectionId: c.detectionId,
        paperTitle: c.paperTitle,
        pageNumber: c.pageNumber,
        type: 'text' as const, // Default type
        excerpt: c.excerpt,
      })),
      messageContext: {
        mode: session.paperIds.length > 1 ? 'multi' : 'single',
        defaultPaperId: session.paperIds[0],
      },
      timestamp: m.timestamp,
    })),
    contextConfig: {
      mode: session.paperIds.length > 1 ? 'multi' : 'single',
      maxContextLength: 50000,
      includeFigures: true,
    },
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archived: session.archived,
  };
}

/**
 * Convert Store Notebook to Storage format
 */
function toStorageNotebook(notebook: Notebook): StorageNotebook {
  return {
    id: notebook.id,
    name: notebook.name,
    description: notebook.description,
    entries: notebook.entries.map(e => ({
      id: e.id,
      type: e.type,
      content: e.rawContent,
      source: e.source ? {
        id: e.source.uri,
        paperId: e.source.paperId,
        paperTitle: e.source.paperTitle || '',
        detectionId: e.source.detectionId,
        pageNumber: e.source.pageNumber,
        excerpt: e.source.excerpt || '',
        createdAt: e.createdAt,
      } : undefined,
      createdAt: e.createdAt,
      annotation: e.annotation,
    })),
    paperIds: notebook.paperIds,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    tags: notebook.tags,
  };
}

/**
 * Convert Storage Notebook to Store format
 */
function fromStorageNotebook(notebook: StorageNotebook): Notebook {
  return {
    id: notebook.id,
    name: notebook.name,
    description: notebook.description,
    entries: notebook.entries.map(e => ({
      id: e.id,
      type: e.type,
      rawContent: e.content,
      citations: [], // Can be re-parsed later
      source: e.source ? {
        uri: `${e.source.paperId}#${e.source.detectionId}` as const,
        paperId: e.source.paperId,
        detectionId: e.source.detectionId,
        paperTitle: e.source.paperTitle,
        pageNumber: e.source.pageNumber,
        type: 'text' as const,
        excerpt: e.source.excerpt,
      } : undefined,
      annotation: e.annotation,
      createdAt: e.createdAt,
    })),
    paperIds: notebook.paperIds,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    tags: notebook.tags,
  };
}

// ============================================================
// Persistence Hook
// ============================================================

/**
 * Auto-persistence hook
 *
 * Usage:
 * ```tsx
 * function App() {
 *   useStoragePersistence();
 *   // ...
 * }
 * ```
 */
export function useStoragePersistence() {
  const storage = useStorage();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedRef = useRef(false);
  
  // Store states
  const chatSessions = useChatSessionStore(s => s.sessions);
  const notebooks = useNotebookStore(s => s.notebooks);
  const paperInsightsCache = useInsightStore(s => s.paperInsightsCache);
  
  // Get user authentication state
  const storageManager = getUserStorageManager();
  const isLoggedIn = storageManager.isLoggedIn();
  
  // ============================================================
  // Initial load (logged-in users only)
  // ============================================================
  
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    
    // Skip loading persisted data for unauthenticated users
    if (!isLoggedIn) {
      console.log('[Persistence] Skip loading: user not logged in');
      return;
    }
    
    async function loadFromStorage() {
      try {
        console.log('[Persistence] Loading from IndexedDB...');
        
        // Load Chat Sessions
        const storedSessions = await storage.listChatSessions();
        if (storedSessions.length > 0) {
          const sessions = storedSessions.map(fromStorageChatSession);
          // Set directly to store (bypass persist middleware to avoid loops)
          useChatSessionStore.setState({ sessions });
          console.log(`[Persistence] Loaded ${sessions.length} chat sessions`);
        }
        
        // Load Notebooks
        const storedNotebooks = await storage.listNotebooks();
        if (storedNotebooks.length > 0) {
          const nbs = storedNotebooks.map(fromStorageNotebook);
          useNotebookStore.setState({ notebooks: nbs });
          console.log(`[Persistence] Loaded ${nbs.length} notebooks`);
        }
        
        // Insights are loaded on demand by paperId, not bulk-loaded here
        
      } catch (error) {
        console.error('[Persistence] Failed to load from storage:', error);
      }
    }
    
    loadFromStorage();
  }, [storage, isLoggedIn]);
  
  // ============================================================
  // Auto-save Chat Sessions (debounced)
  // ============================================================
  
  const saveChatSessions = useCallback(async () => {
    // Skip saving for unauthenticated users
    if (!storageManager.isLoggedIn()) {
      console.log('[Persistence] Skip saving chat sessions: user not logged in');
      return;
    }
    
    try {
      const sessions = useChatSessionStore.getState().sessions;
      for (const session of sessions) {
        await storage.saveChatSession(toStorageChatSession(session));
      }
      console.log(`[Persistence] Saved ${sessions.length} chat sessions`);
    } catch (error) {
      console.error('[Persistence] Failed to save chat sessions:', error);
    }
  }, [storage, storageManager]);
  
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveChatSessions();
    }, 2000); // 2-second debounce
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [chatSessions, saveChatSessions]);
  
  // ============================================================
  // Auto-save Notebooks (debounced)
  // ============================================================
  
  const saveNotebooks = useCallback(async () => {
    // Skip saving for unauthenticated users
    if (!storageManager.isLoggedIn()) {
      console.log('[Persistence] Skip saving notebooks: user not logged in');
      return;
    }
    
    try {
      const nbs = useNotebookStore.getState().notebooks;
      for (const nb of nbs) {
        await storage.saveNotebook(toStorageNotebook(nb));
      }
      console.log(`[Persistence] Saved ${nbs.length} notebooks`);
    } catch (error) {
      console.error('[Persistence] Failed to save notebooks:', error);
    }
  }, [storage, storageManager]);
  
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveNotebooks();
    }, 2000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [notebooks, saveNotebooks]);
  
  // ============================================================
  // Auto-save Insights (per paper)
  // ============================================================
  
  const saveInsights = useCallback(async () => {
    try {
      const cache = useInsightStore.getState().paperInsightsCache;
      for (const [paperId, data] of Object.entries(cache)) {
        await storage.savePaperInsights(paperId, data.insights);
      }
      console.log(`[Persistence] Saved insights for ${Object.keys(cache).length} papers`);
    } catch (error) {
      console.error('[Persistence] Failed to save insights:', error);
    }
  }, [storage]);
  
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveInsights();
    }, 3000); // Insights saved less frequently
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [paperInsightsCache, saveInsights]);
  
  // ============================================================
  // Save immediately on page unload
  // ============================================================
  
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Sync save may be incomplete, but try our best
      // Zustand persist middleware handles most cases
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}

// ============================================================
// Standalone Insight Loading Hook
// ============================================================

/**
 * Load insights for a specific paper.
 * Note: Only loads from persistent storage for logged-in users.
 */
export function useLoadPaperInsights(paperId: string | null) {
  const storage = useStorage();
  const setInsights = useInsightStore(s => s.setInsights);
  const getCachedInsights = useInsightStore(s => s.getCachedInsights);
  const storageManager = getUserStorageManager();
  
  useEffect(() => {
    if (!paperId) return;
    
    // Skip loading from persistent storage for unauthenticated users
    if (!storageManager.isLoggedIn()) return;
    
    // If cache already exists, skip reloading
    if (getCachedInsights(paperId)) return;
    
    const currentPaperId = paperId; // Capture for async closure
    
    async function loadInsights() {
      try {
        const insights = await storage.getPaperInsights(currentPaperId);
        if (insights && insights.length > 0) {
          setInsights(currentPaperId, insights);
          console.log(`[Persistence] Loaded ${insights.length} insights for paper: ${currentPaperId}`);
        }
      } catch (error) {
        console.error(`[Persistence] Failed to load insights for paper ${currentPaperId}:`, error);
      }
    }
    
    loadInsights();
  }, [paperId, storage, setInsights, getCachedInsights, storageManager]);
}
