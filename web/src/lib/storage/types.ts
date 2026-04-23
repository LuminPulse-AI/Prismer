/**
 * Storage Layer Type Definitions
 * 
 * Defines storage adapter interface and related types
 * All storage operations go through a unified interface, supporting Mock and IndexedDB implementations
 */

import type {
  PaperMetadata,
  PageDetection,
  PaperInsight,
  SourceCitation,
  BoundingBox,
} from '@/types/paperContext';

// ============================================================
// Paper Data Types
// ============================================================

/**
 * Paper metadata (for list display)
 */
export interface PaperMeta {
  /** Paper ID (arxiv_id or custom ID) */
  id: string;
  /** Paper title */
  title: string;
  /** Author list */
  authors: string[];
  /** ArXiv ID (if available) */
  arxivId?: string;
  /** Publication date */
  published?: string;
  /** Abstract */
  abstract?: string;
  /** Whether OCR data exists */
  hasOCRData: boolean;
  /** Total pages */
  totalPages?: number;
  /** Categories */
  categories?: string[];
  /** Local PDF route */
  pdfPath?: string;
}

/**
 * OCR result
 */
export interface OCRResult {
  success: boolean;
  total_pages: number;
  total_processing_time: number;
  markdown_content: string;
  message?: string;
  pages: Array<{
    page_number: number;
    content: string;
    meta: {
      width: number;
      height: number;
      dpi: number;
    };
    processing_time?: number;
    detection_count: number;
    image_count: number;
  }>;
}

/**
 * Full paper data
 */
export interface PaperData {
  /** Metadata */
  meta: PaperMeta;
  /** Full metadata */
  metadata: PaperMetadata;
  /** Full text in Markdown */
  markdown: string;
  /** Detection results */
  detections: PageDetection[];
  /** OCR result */
  ocrResult: OCRResult;
}

// ============================================================
// Chat Session Types
// ============================================================

/**
 * Cross-paper citation
 */
export interface CrossPaperCitation {
  /** Unique identifier */
  id: string;
  /** Paper ID */
  paperId: string;
  /** Paper title */
  paperTitle: string;
  /** Detection ID */
  detectionId: string;
  /** Page number */
  pageNumber: number;
  /** Cited text excerpt */
  excerpt: string;
  /** Bounding box */
  bbox?: BoundingBox;
  /** Creation time */
  createdAt: number;
}

/**
 * Chat message
 */
export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: CrossPaperCitation[];
  timestamp: number;
}

/**
 * Chat session
 */
export interface ChatSession {
  /** Session ID */
  id: string;
  /** Session title */
  title: string;
  /** Associated paper ID list */
  paperIds: string[];
  /** Message history */
  messages: StoredChatMessage[];
  /** Creation time */
  createdAt: number;
  /** Update time */
  updatedAt: number;
  /** Whether archived */
  archived: boolean;
}

// ============================================================
// Notebook Types
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
  /** Entry ID */
  id: string;
  /** Entry type */
  type: NoteEntryType;
  /** Content (HTML/Markdown) */
  content: string;
  /** Source citation */
  source?: CrossPaperCitation;
  /** Original Insight */
  originalInsight?: PaperInsight;
  /** Creation time */
  createdAt: number;
  /** User annotation */
  annotation?: string;
}

/**
 * Notebook
 */
export interface Notebook {
  /** Notebook ID */
  id: string;
  /** Notebook name */
  name: string;
  /** Description */
  description?: string;
  /** Note entries */
  entries: NoteEntry[];
  /** Associated paper IDs */
  paperIds: string[];
  /** Creation time */
  createdAt: number;
  /** Update time */
  updatedAt: number;
  /** Tags */
  tags: string[];
}

// ============================================================
// Reference Metadata Types
// ============================================================

/**
 * Reference metadata (fetched from external API)
 */
export interface ReferenceMetadata {
  /** Identifier (arxiv_id or doi) */
  identifier: string;
  /** Title */
  title: string;
  /** Authors */
  authors: string[];
  /** Abstract */
  abstract?: string;
  /** Year */
  year?: number;
  /** Citation count */
  citationCount?: number;
  /** Journal/conference */
  venue?: string;
  /** PDF URL */
  pdfUrl?: string;
  /** ArXiv ID */
  arxivId?: string;
  /** Fetch time */
  fetchedAt: number;
}

// ============================================================
// Storage Adapter Interface
// ============================================================

/**
 * Storage adapter interface
 *
 * Unified abstraction for all storage operations
 * Supports Mock (public/data/output) and IndexedDB implementations
 */
export interface StorageAdapter {
  // ==========================================
  // Paper Data (OCR preprocessed data)
  // ==========================================
  
  /** List all available papers */
  listPapers(): Promise<PaperMeta[]>;
  
  /** Get full paper data */
  getPaper(paperId: string): Promise<PaperData | null>;
  
  /** Check if paper exists */
  hasPaper(paperId: string): Promise<boolean>;
  
  // ==========================================
  // Chat Sessions
  // ==========================================
  
  /** List all chat sessions */
  listChatSessions(): Promise<ChatSession[]>;
  
  /** Get a single chat session */
  getChatSession(id: string): Promise<ChatSession | null>;
  
  /** Save chat session */
  saveChatSession(session: ChatSession): Promise<void>;
  
  /** Delete chat session */
  deleteChatSession(id: string): Promise<void>;
  
  // ==========================================
  // Notebooks
  // ==========================================
  
  /** List all notebooks */
  listNotebooks(): Promise<Notebook[]>;
  
  /** Get a single notebook */
  getNotebook(id: string): Promise<Notebook | null>;
  
  /** Save notebook */
  saveNotebook(notebook: Notebook): Promise<void>;
  
  /** Delete notebook */
  deleteNotebook(id: string): Promise<void>;
  
  // ==========================================
  // Paper Insights Cache
  // ==========================================
  
  /** Get cached paper Insights */
  getPaperInsights(paperId: string): Promise<PaperInsight[]>;
  
  /** Save paper Insights */
  savePaperInsights(paperId: string, insights: PaperInsight[]): Promise<void>;
  
  // ==========================================
  // Reference Metadata Cache
  // ==========================================
  
  /** Get reference metadata */
  getReferenceMetadata(identifier: string): Promise<ReferenceMetadata | null>;
  
  /** Save reference metadata */
  saveReferenceMetadata(identifier: string, metadata: ReferenceMetadata): Promise<void>;
}
