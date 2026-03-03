/**
 * IndexedDB Storage Adapter
 * 
 * Uses IndexedDB for data persistence
 * Supports: Chat Sessions, Notebooks, Paper Insights cache
 */

import { StorageAdapter, ChatSession, Notebook, PaperMeta, PaperData, ReferenceMetadata } from "./types";
import { PaperInsight } from "@/types/paperContext";

// ============================================================================
// Database Configuration
// ============================================================================

const DB_NAME = "pisa_reader_db";
const DB_VERSION = 1;

// Store names
const STORES = {
  CHAT_SESSIONS: "chat_sessions",
  NOTEBOOKS: "notebooks",
  PAPER_INSIGHTS: "paper_insights",
  PAPER_CACHE: "paper_cache",
} as const;

// ============================================================================
// IndexedDB Adapter Implementation
// ============================================================================

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize on first use
    this.initPromise = this.initialize();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async initialize(): Promise<void> {
    if (typeof window === "undefined") {
      console.warn("IndexedDB is not available in server environment");
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log("[IndexedDB] Database opened successfully");
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Chat Sessions Store
        if (!db.objectStoreNames.contains(STORES.CHAT_SESSIONS)) {
          const chatStore = db.createObjectStore(STORES.CHAT_SESSIONS, {
            keyPath: "id",
          });
          chatStore.createIndex("updatedAt", "updatedAt", { unique: false });
          chatStore.createIndex("archived", "archived", { unique: false });
        }

        // Notebooks Store
        if (!db.objectStoreNames.contains(STORES.NOTEBOOKS)) {
          const notebookStore = db.createObjectStore(STORES.NOTEBOOKS, {
            keyPath: "id",
          });
          notebookStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }

        // Paper Insights Store
        if (!db.objectStoreNames.contains(STORES.PAPER_INSIGHTS)) {
          db.createObjectStore(STORES.PAPER_INSIGHTS, {
            keyPath: "paperId",
          });
        }

        // Paper Cache Store (for metadata)
        if (!db.objectStoreNames.contains(STORES.PAPER_CACHE)) {
          db.createObjectStore(STORES.PAPER_CACHE, {
            keyPath: "arxivId",
          });
        }

        console.log("[IndexedDB] Database schema created/upgraded");
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.db) {
      throw new Error("IndexedDB not initialized");
    }
    return this.db;
  }

  // ============================================================================
  // Generic CRUD Helpers
  // ============================================================================

  private async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async getOne<T>(storeName: string, key: string): Promise<T | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async put<T>(storeName: string, data: T): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteOne(storeName: string, key: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // Chat Sessions
  // ============================================================================

  async listChatSessions(): Promise<ChatSession[]> {
    try {
      const sessions = await this.getAll<ChatSession>(STORES.CHAT_SESSIONS);
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error("[IndexedDB] Failed to list chat sessions:", error);
      return [];
    }
  }

  async getChatSession(id: string): Promise<ChatSession | null> {
    try {
      return await this.getOne<ChatSession>(STORES.CHAT_SESSIONS, id);
    } catch (error) {
      console.error("[IndexedDB] Failed to get chat session:", error);
      return null;
    }
  }

  async saveChatSession(session: ChatSession): Promise<void> {
    try {
      session.updatedAt = Date.now();
      await this.put(STORES.CHAT_SESSIONS, session);
      console.log("[IndexedDB] Chat session saved:", session.id);
    } catch (error) {
      console.error("[IndexedDB] Failed to save chat session:", error);
      throw error;
    }
  }

  async deleteChatSession(id: string): Promise<void> {
    try {
      await this.deleteOne(STORES.CHAT_SESSIONS, id);
      console.log("[IndexedDB] Chat session deleted:", id);
    } catch (error) {
      console.error("[IndexedDB] Failed to delete chat session:", error);
      throw error;
    }
  }

  // ============================================================================
  // Notebooks
  // ============================================================================

  async listNotebooks(): Promise<Notebook[]> {
    try {
      const notebooks = await this.getAll<Notebook>(STORES.NOTEBOOKS);
      return notebooks.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error("[IndexedDB] Failed to list notebooks:", error);
      return [];
    }
  }

  async getNotebook(id: string): Promise<Notebook | null> {
    try {
      return await this.getOne<Notebook>(STORES.NOTEBOOKS, id);
    } catch (error) {
      console.error("[IndexedDB] Failed to get notebook:", error);
      return null;
    }
  }

  async saveNotebook(notebook: Notebook): Promise<void> {
    try {
      notebook.updatedAt = Date.now();
      await this.put(STORES.NOTEBOOKS, notebook);
      console.log("[IndexedDB] Notebook saved:", notebook.id);
    } catch (error) {
      console.error("[IndexedDB] Failed to save notebook:", error);
      throw error;
    }
  }

  async deleteNotebook(id: string): Promise<void> {
    try {
      await this.deleteOne(STORES.NOTEBOOKS, id);
      console.log("[IndexedDB] Notebook deleted:", id);
    } catch (error) {
      console.error("[IndexedDB] Failed to delete notebook:", error);
      throw error;
    }
  }

  // ============================================================================
  // Paper Insights Cache
  // ============================================================================

  async getPaperInsights(paperId: string): Promise<PaperInsight[]> {
    try {
      const result = await this.getOne<{ paperId: string; insights: PaperInsight[] }>(
        STORES.PAPER_INSIGHTS,
        paperId
      );
      return result?.insights || [];
    } catch (error) {
      console.error("[IndexedDB] Failed to get paper insights:", error);
      return [];
    }
  }

  async savePaperInsights(paperId: string, insights: PaperInsight[]): Promise<void> {
    try {
      await this.put(STORES.PAPER_INSIGHTS, { paperId, insights });
      console.log("[IndexedDB] Paper insights cached:", paperId);
    } catch (error) {
      console.error("[IndexedDB] Failed to save paper insights:", error);
      throw error;
    }
  }

  // ============================================================================
  // Paper Data (delegates to API)
  // ============================================================================

  async listPapers(): Promise<PaperMeta[]> {
    try {
      const response = await fetch("/api/papers");
      if (!response.ok) throw new Error("Failed to fetch papers");
      const data = await response.json();
      return data.papers || [];
    } catch (error) {
      console.error("[IndexedDB] Failed to list papers:", error);
      return [];
    }
  }

  async getPaper(paperId: string): Promise<PaperData | null> {
    try {
      const [metadataRes, detectionsRes, markdownRes, ocrRes] = await Promise.all([
        fetch(`/api/ocr/${paperId}/metadata.json`),
        fetch(`/api/ocr/${paperId}/detections.json`),
        fetch(`/api/ocr/${paperId}/paper.md`),
        fetch(`/api/ocr/${paperId}/ocr_result.json`),
      ]);

      if (!metadataRes.ok) return null;

      const metadata = await metadataRes.json();
      const detections = detectionsRes.ok ? await detectionsRes.json() : [];
      const markdown = markdownRes.ok ? await markdownRes.text() : "";
      const ocrResult = ocrRes.ok ? await ocrRes.json() : { success: false, total_pages: 0, pages: [] };

      return {
        meta: {
          id: paperId,
          title: metadata.title || "Untitled",
          authors: metadata.authors || [],
          arxivId: metadata.arxiv_id || paperId,
          published: metadata.published,
          abstract: metadata.abstract,
          hasOCRData: detections.length > 0,
        },
        metadata,
        markdown,
        detections,
        ocrResult,
      };
    } catch (error) {
      console.error(`[IndexedDB] Failed to get paper ${paperId}:`, error);
      return null;
    }
  }

  async hasPaper(paperId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/ocr/${paperId}/metadata.json`, {
        method: "HEAD",
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Reference Metadata Cache
  // ============================================================================

  async getReferenceMetadata(identifier: string): Promise<ReferenceMetadata | null> {
    try {
      return await this.getOne<ReferenceMetadata>(STORES.PAPER_CACHE, identifier);
    } catch (error) {
      console.error("[IndexedDB] Failed to get reference metadata:", error);
      return null;
    }
  }

  async saveReferenceMetadata(identifier: string, metadata: ReferenceMetadata): Promise<void> {
    try {
      await this.put(STORES.PAPER_CACHE, { ...metadata, arxivId: identifier });
      console.log("[IndexedDB] Reference metadata cached:", identifier);
    } catch (error) {
      console.error("[IndexedDB] Failed to save reference metadata:", error);
      throw error;
    }
  }

  // ============================================================================
  // Mock Data Loading (delegates to fetch for compatibility)
  // ============================================================================

  async loadMockPaperContext(arxivId: string): Promise<any> {
    // This method fetches from the API, same as MockStorageAdapter
    try {
      const [metadataRes, detectionsRes, markdownRes] = await Promise.all([
        fetch(`/api/ocr/${arxivId}/metadata.json`),
        fetch(`/api/ocr/${arxivId}/detections.json`),
        fetch(`/api/ocr/${arxivId}/paper.md`),
      ]);

      const metadata = metadataRes.ok ? await metadataRes.json() : null;
      const detections = detectionsRes.ok ? await detectionsRes.json() : [];
      const markdown = markdownRes.ok ? await markdownRes.text() : "";

      return {
        metadata,
        detections,
        markdown,
        hasOCRData: detections.length > 0,
        loadingState: metadata ? "loaded" : "error",
        error: metadata ? null : `Failed to load data for ${arxivId}`,
      };
    } catch (error) {
      console.error(`Failed to load paper context for ${arxivId}:`, error);
      return {
        metadata: null,
        detections: [],
        markdown: "",
        hasOCRData: false,
        loadingState: "error",
        error: `Failed to load data for ${arxivId}`,
      };
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    const storeNames = Object.values(STORES);
    
    for (const storeName of storeNames) {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    console.log("[IndexedDB] All data cleared");
  }

  async getStorageStats(): Promise<{ sessions: number; notebooks: number; insights: number }> {
    try {
      const sessions = await this.getAll<ChatSession>(STORES.CHAT_SESSIONS);
      const notebooks = await this.getAll<Notebook>(STORES.NOTEBOOKS);
      const insights = await this.getAll<{ paperId: string }>(STORES.PAPER_INSIGHTS);
      
      return {
        sessions: sessions.length,
        notebooks: notebooks.length,
        insights: insights.length,
      };
    } catch {
      return { sessions: 0, notebooks: 0, insights: 0 };
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: IndexedDBAdapter | null = null;

export function getIndexedDBAdapter(): IndexedDBAdapter {
  if (!instance) {
    instance = new IndexedDBAdapter();
  }
  return instance;
}

/**
 * Reset IndexedDB adapter instance
 * Used to re-initialize after user logout
 */
export function resetIndexedDBAdapter(): void {
  if (instance) {
    instance = null;
    console.log('[IndexedDB] Adapter instance reset');
  }
}

/**
 * Delete the entire IndexedDB database
 * Used for complete data cleanup on user logout
 */
export async function deleteIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  return new Promise((resolve) => {
    try {
      // Reset instance first
      if (instance) {
        instance = null;
      }
      
      const request = indexedDB.deleteDatabase(DB_NAME);
      
      request.onsuccess = () => {
        console.log('[IndexedDB] Database deleted successfully');
        resolve();
      };
      
      request.onerror = () => {
        console.error('[IndexedDB] Failed to delete database');
        resolve();
      };
      
      request.onblocked = () => {
        console.warn('[IndexedDB] Database deletion blocked - connections still open');
        resolve();
      };
    } catch (error) {
      console.error('[IndexedDB] Delete database error:', error);
      resolve();
    }
  });
}
