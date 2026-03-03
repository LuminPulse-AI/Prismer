/**
 * Paper Context Types
 *
 * Core type definitions for paper context, used by the AI-Native PDF Reader.
 * All types are interface-based, supporting extension and customization.
 */

// ============================================================
// PDF Source Types - Supports files and URLs
// ============================================================

/**
 * PDF source type
 */
export type PDFSourceType = 'file' | 'url' | 'arxiv' | 'blob';

/**
 * PDF source interface - Unified access for files and URLs
 */
export interface PDFSource {
  type: PDFSourceType;
  /** File path or URL */
  path: string;
  /** ArXiv ID (optional, used to load preprocessed OCR data) */
  arxivId?: string;
  /** Blob data (when type is 'blob') */
  blob?: Blob;
}

/**
 * Factory function types for creating PDFSource from different sources
 */
export interface PDFSourceFactory {
  fromFile: (filePath: string, arxivId?: string) => PDFSource;
  fromUrl: (url: string, arxivId?: string) => PDFSource;
  fromArxiv: (arxivId: string) => PDFSource;
  fromBlob: (blob: Blob) => PDFSource;
}

// ============================================================
// OCR Data Types - From the preprocessing pipeline
// ============================================================

/**
 * Bounding box coordinates
 */
export interface BoundingBox {
  /** Original coordinates (PDF units) */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Pixel coordinates (for rendering) */
  x1_px: number;
  y1_px: number;
  x2_px: number;
  y2_px: number;
}

/**
 * Detection label type
 */
export type DetectionLabel = 
  | 'title' 
  | 'sub_title' 
  | 'text' 
  | 'image' 
  | 'image_caption'
  | 'table'
  | 'table_caption'
  | 'equation'
  | 'reference'
  | 'footer'
  | 'header'
  | 'figure'
  | 'chart'
  | 'diagram';

/**
 * Detection metadata - For special content such as images, tables, and equations
 */
export interface DetectionMetadata {
  image_path?: string | null;
  latex?: string | null;
  table_html?: string | null;
  caption?: string | null;
  caption_id?: string | null;
}

/**
 * Single detection result (with unique ID, supports bidirectional indexing)
 */
export interface Detection {
  /** Unique identifier - Format: p{page}_{type}_{index} */
  id: string;
  label: DetectionLabel;
  boxes: BoundingBox[];
  /** Actual text content (Markdown/LaTeX/HTML table) */
  text: string;
  /** Raw text format (backward compatible) */
  raw_text?: string;
  /** Detection metadata */
  metadata?: DetectionMetadata;
}

/**
 * Extracted image information
 */
export interface ExtractedImage {
  detection_id: string;
  index: number;
  bbox: BoundingBox;
  width: number;
  height: number;
  image_path: string;
}

/**
 * Page detection results
 */
export interface PageDetection {
  page_number: number;
  detections: Detection[];
  /** List of extracted images */
  extracted_images?: ExtractedImage[];
  image_count?: number;
}

/**
 * Page metadata
 */
export interface PageMeta {
  page: number;
  width: number;
  height: number;
  dpi: number;
}

/**
 * Bidirectional indexing information
 */
export interface BidirectionalIndexingInfo {
  detection_ids_count: number;
  ref_markers_count: number;
  enabled: boolean;
}

/**
 * Paper metadata
 */
export interface PaperMetadata {
  arxiv_id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  updated?: string;
  pdf_url?: string;
  categories: string[];
  /** OCR processing timestamp */
  ocr_timestamp?: string;
  total_pages: number;
  total_processing_time?: number;
  total_detections?: number;
  total_images_extracted?: number;
  page_metas: PageMeta[];
  /** Bidirectional indexing information */
  bidirectional_indexing?: BidirectionalIndexingInfo;
  /** Extension fields */
  [key: string]: unknown;
}

/**
 * Page content (OCR results)
 */
export interface PageContent {
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
}

/**
 * Full OCR result
 */
export interface OCRResult {
  success: boolean;
  total_pages: number;
  total_processing_time: number;
  markdown_content: string;
  message?: string;
  pages: PageContent[];
}

/**
 * Image asset
 */
export interface ImageAsset {
  id: string;
  page: number;
  filename: string;
  path: string;
  bbox?: BoundingBox;
  caption?: string;
}

// ============================================================
// Paper Context - Complete paper context
// ============================================================

/**
 * OCR data availability level
 * - L3_hires: Full detection overlay + image extraction + bidirectional indexing + full-text markdown
 * - L2_fast: Full-text markdown available, no detection overlay
 * - L1_raw: No OCR data, PDF.js direct rendering
 */
export type OCRLevel = 'L3_hires' | 'L2_fast' | 'L1_raw';

/**
 * Paper context - Contains all preprocessed data
 */
export interface PaperContext {
  /** Source information */
  source: PDFSource;
  /** Metadata */
  metadata: PaperMetadata | null;
  /** Full-text markdown */
  markdown: string;
  /** Paginated content */
  pages: PageContent[];
  /** Detection results */
  detections: PageDetection[];
  /** Image assets */
  images: ImageAsset[];
  /** Whether preprocessed data is available */
  hasOCRData: boolean;
  /** OCR data availability level */
  ocrLevel: OCRLevel;
  /** Loading state */
  loadingState: PaperLoadingState;
  /** Error message */
  error?: string;
}

/**
 * Loading state
 */
export type PaperLoadingState = 
  | 'idle'
  | 'loading_pdf'
  | 'loading_ocr'
  | 'ready'
  | 'error';

// ============================================================
// AI Response Types
// ============================================================

/**
 * Insight type
 */
export type InsightType = 
  | 'core_problem'
  | 'main_method'
  | 'key_results'
  | 'limitations'
  | 'future_work'
  | 'custom';

/**
 * Source citation (supports bidirectional indexing)
 */
export interface SourceCitation {
  id: string;
  /** Detection ID - Used for bidirectional indexing */
  detection_id?: string;
  /** Cited original text */
  text: string;
  /** Page number */
  pageNumber: number;
  /** Precise position */
  bbox?: BoundingBox;
  /** Section hint */
  sectionHint?: string;
  /** Match confidence */
  confidence?: number;
}

/**
 * Citation in AI-generated content (for bidirectional indexing)
 */
export interface Citation {
  /** Detection ID */
  detection_id: string;
  /** Page number */
  page_number: number;
  /** Original text excerpt */
  excerpt: string;
  /** Relevance score 0-1 */
  relevance: number;
}

/**
 * Paper insight
 */
export interface PaperInsight {
  id: string;
  type: InsightType;
  title: string;
  content: string;
  citations: SourceCitation[];
  confidence: number;
  generatedAt: number;
  /** Whether details are expanded */
  expanded?: boolean;
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: SourceCitation[];
  timestamp: number;
  /** Whether streaming output is in progress */
  streaming?: boolean;
  /** Tool call records */
  toolCalls?: ToolCallRecord[];
}

/**
 * Tool call record
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'success' | 'error';
}

/**
 * Extract type
 */
export type ExtractType = 
  | 'highlight'
  | 'figure'
  | 'table'
  | 'equation'
  | 'ai_insight';

/**
 * Extracted content
 */
export interface Extract {
  id: string;
  type: ExtractType;
  content: string;
  source: SourceCitation;
  aiExplanation?: string;
  createdAt: number;
  tags: string[];
  /** User annotation */
  note?: string;
  /** Highlight color (for highlight type) */
  color?: string;
}

// ============================================================
// Agent Service Interface
// ============================================================

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Model name */
  model: string;
  /** API Base URL */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** System instructions */
  instructions?: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
}

/**
 * Streaming event type
 */
export type StreamEventType = 
  | 'text_delta'
  | 'text_done'
  | 'tool_call_start'
  | 'tool_call_done'
  | 'citation_found'
  | 'error'
  | 'done';

/**
 * Streaming event
 */
export interface StreamEvent {
  type: StreamEventType;
  data: unknown;
  timestamp: number;
}

/**
 * Paper Agent service interface
 */
export interface IPaperAgentService {
  /** Initialize the agent */
  initialize(config: AgentConfig): Promise<void>;

  /** Send a question and receive a streaming response */
  askPaper(
    question: string,
    context: PaperContext,
    onEvent: (event: StreamEvent) => void,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void>;
  
  /** Generate paper insights */
  generateInsights(
    context: PaperContext,
    types?: InsightType[]
  ): Promise<PaperInsight[]>;
  
  /** Explain a figure */
  explainFigure(
    figureId: string,
    context: PaperContext
  ): Promise<string>;
  
  /** Cancel the current request */
  cancel(): void;
  
  /** Whether processing is in progress */
  isProcessing: boolean;
}

// ============================================================
// Source Matching Interface
// ============================================================

/**
 * Source matching service interface
 */
export interface ISourceMatchingService {
  /**
   * Match text to a PDF location
   */
  matchTextToSource(
    text: string,
    context: PaperContext
  ): SourceCitation | null;
  
  /**
   * Batch matching
   */
  matchMultiple(
    texts: string[],
    context: PaperContext
  ): SourceCitation[];
  
  /**
   * Get text at a specific page and coordinates
   */
  getTextAtPosition(
    pageNumber: number,
    bbox: BoundingBox,
    context: PaperContext
  ): string | null;
}

// ============================================================
// Paper Context Provider Interface
// ============================================================

/**
 * Paper Context Provider interface
 */
export interface IPaperContextProvider {
  /** Load context from a PDF source */
  loadContext(source: PDFSource): Promise<PaperContext>;
  
  /** Load OCR data (if available) */
  loadOCRData(arxivId: string): Promise<{
    metadata: PaperMetadata | null;
    ocrResult: OCRResult | null;
    detections: PageDetection[];
  } | null>;
  
  /** Check whether preprocessed data is available */
  hasPreprocessedData(arxivId: string): Promise<boolean>;
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Factory functions for creating PDF sources
 */
export const createPDFSource: PDFSourceFactory = {
  fromFile: (filePath: string, arxivId?: string): PDFSource => ({
    type: 'file',
    path: filePath,
    arxivId,
  }),
  
  fromUrl: (url: string, arxivId?: string): PDFSource => ({
    type: 'url',
    path: url,
    arxivId,
  }),
  
  fromArxiv: (arxivId: string): PDFSource => ({
    type: 'arxiv',
    // Use local API route to avoid CORS issues
    // The API route will serve the PDF from public/data/output/{arxivId}/
    path: `/api/ocr/${arxivId}/pdf`,
    arxivId,
  }),
  
  fromBlob: (blob: Blob): PDFSource => ({
    type: 'blob',
    path: '',
    blob,
  }),
};

/**
 * Create an empty Paper Context
 */
export function createEmptyPaperContext(source: PDFSource): PaperContext {
  return {
    source,
    metadata: null,
    markdown: '',
    pages: [],
    detections: [],
    images: [],
    hasOCRData: false,
    ocrLevel: 'L1_raw',
    loadingState: 'idle',
  };
}

/**
 * Check whether a detection label is an interactive type
 */
export function isInteractiveLabel(label: DetectionLabel): boolean {
  return ['image', 'table', 'equation'].includes(label);
}

/**
 * Get the display name for a detection label
 */
export function getLabelDisplayName(label: DetectionLabel): string {
  const names: Record<DetectionLabel, string> = {
    title: 'Title',
    sub_title: 'Section',
    text: 'Text',
    image: 'Figure',
    image_caption: 'Caption',
    table: 'Table',
    table_caption: 'Table Caption',
    equation: 'Equation',
    reference: 'Reference',
    footer: 'Footer',
    header: 'Header',
    figure: 'Figure',
    chart: 'Chart',
    diagram: 'Diagram',
  };
  return names[label] || label;
}

