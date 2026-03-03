"use client";

/**
 * Storage Hooks
 * 
 * Provides convenient storage data access hooks
 */

import { useState, useEffect, useCallback } from 'react';
import type { PaperMeta, PaperData, ChatSession, Notebook } from './types';
import { useStorage } from './provider';

// ============================================================
// Paper Hooks
// ============================================================

/**
 * Get paper list
 */
export function usePaperList() {
  const storage = useStorage();
  const [papers, setPapers] = useState<PaperMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storage.listPapers();
      setPapers(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load papers'));
    } finally {
      setLoading(false);
    }
  }, [storage]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  return { papers, loading, error, refresh };
}

/**
 * Get single paper data
 */
export function usePaper(paperId: string | null) {
  const storage = useStorage();
  const [paper, setPaper] = useState<PaperData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    if (!paperId) {
      setPaper(null);
      return;
    }
    
    let cancelled = false;
    
    const loadPaper = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await storage.getPaper(paperId);
        if (!cancelled) {
          setPaper(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error('Failed to load paper'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadPaper();
    
    return () => {
      cancelled = true;
    };
  }, [storage, paperId]);
  
  return { paper, loading, error };
}

// ============================================================
// Chat Session Hooks
// ============================================================

/**
 * Get chat session list
 */
export function useChatSessionList() {
  const storage = useStorage();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storage.listChatSessions();
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load chat sessions'));
    } finally {
      setLoading(false);
    }
  }, [storage]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  const createSession = useCallback(async (
    title: string,
    paperIds: string[] = []
  ): Promise<ChatSession> => {
    const session: ChatSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      title,
      paperIds,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
    };
    
    await storage.saveChatSession(session);
    await refresh();
    
    return session;
  }, [storage, refresh]);
  
  const deleteSession = useCallback(async (id: string) => {
    await storage.deleteChatSession(id);
    await refresh();
  }, [storage, refresh]);
  
  return { sessions, loading, error, refresh, createSession, deleteSession };
}

/**
 * Get and manage a single chat session
 */
export function useChatSession(sessionId: string | null) {
  const storage = useStorage();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    
    let cancelled = false;
    
    const loadSession = async () => {
      setLoading(true);
      try {
        const data = await storage.getChatSession(sessionId);
        if (!cancelled) {
          setSession(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadSession();
    
    return () => {
      cancelled = true;
    };
  }, [storage, sessionId]);
  
  const updateSession = useCallback(async (updates: Partial<ChatSession>) => {
    if (!session) return;
    
    const updated: ChatSession = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };
    
    await storage.saveChatSession(updated);
    setSession(updated);
  }, [storage, session]);
  
  return { session, loading, updateSession };
}

// ============================================================
// Notebook Hooks
// ============================================================

/**
 * Get notebook list
 */
export function useNotebookList() {
  const storage = useStorage();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storage.listNotebooks();
      setNotebooks(data);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load notebooks'));
    } finally {
      setLoading(false);
    }
  }, [storage]);
  
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  const createNotebook = useCallback(async (name: string): Promise<Notebook> => {
    const notebook: Notebook = {
      id: `notebook_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      entries: [],
      paperIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };
    
    await storage.saveNotebook(notebook);
    await refresh();
    
    return notebook;
  }, [storage, refresh]);
  
  const deleteNotebook = useCallback(async (id: string) => {
    await storage.deleteNotebook(id);
    await refresh();
  }, [storage, refresh]);
  
  return { notebooks, loading, error, refresh, createNotebook, deleteNotebook };
}

/**
 * Get and manage a single notebook
 */
export function useNotebook(notebookId: string | null) {
  const storage = useStorage();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!notebookId) {
      setNotebook(null);
      return;
    }
    
    let cancelled = false;
    
    const loadNotebook = async () => {
      setLoading(true);
      try {
        const data = await storage.getNotebook(notebookId);
        if (!cancelled) {
          setNotebook(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadNotebook();
    
    return () => {
      cancelled = true;
    };
  }, [storage, notebookId]);
  
  const updateNotebook = useCallback(async (updates: Partial<Notebook>) => {
    if (!notebook) return;
    
    const updated: Notebook = {
      ...notebook,
      ...updates,
      updatedAt: Date.now(),
    };
    
    await storage.saveNotebook(updated);
    setNotebook(updated);
  }, [storage, notebook]);
  
  return { notebook, loading, updateNotebook };
}
