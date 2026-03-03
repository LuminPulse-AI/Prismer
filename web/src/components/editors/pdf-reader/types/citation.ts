/**
 * Cross-Paper Tag System - Type Definitions
 *
 * Design goals:
 * 1. Simple AI generation logic (single paper: [[p1_text_0]], multi-paper: [[A:p1_text_0]])
 * 2. Support cross-paper unique identification
 * 3. Backward compatible with existing tag formats
 */

// ============================================================
// Base Types
// ============================================================

/**
 * Detection type enumeration
 */
export type DetectionType = 'text' | 'image' | 'table' | 'equation' | 'title' | 'sub_title' | 'reference';

/**
 * Universal Reference Identifier
 * Format: {paperId}#{detectionId}
 * Example: 2601.02346v1#p1_text_0
 */
export type UniversalReferenceId = `${string}#${string}`;

/**
 * Paper alias map
 * Example: { A: "2601.02346v1", B: "1706.03762" }
 */
export type PaperAliasMap = Record<string, string>;

// ============================================================
// Citation Structure
// ============================================================

/**
 * Unified citation structure
 * Used for ChatMessage.citations and NoteEntry.citations
 */
export interface Citation {
  /** Globally unique identifier: "{paperId}#{detectionId}" */
  uri: UniversalReferenceId;
  
  /** Paper ID (arxivId or other unique identifier) */
  paperId: string;
  
  /** Detection ID (e.g. p1_text_0) */
  detectionId: string;
  
  /** Paper title (cached to avoid redundant lookups) */
  paperTitle?: string;
  
  /** Page number */
  pageNumber: number;
  
  /** Detection type */
  type: DetectionType;
  
  /** Content excerpt (first 30-50 characters) */
  excerpt?: string;
  
  /** Display index in the current context (1, 2, 3...) */
  displayIndex?: number;
  
  /** Paper alias (A, B, C... in multi-paper mode) */
  paperAlias?: string;
}

// ============================================================
// Tag Parse Results
// ============================================================

/**
 * Tag type
 */
export type TagType = 'local' | 'cross-paper';

/**
 * Tag parse result
 */
export interface TagParseResult {
  /** Tag type */
  type: TagType;
  
  /** Paper alias in multi-paper mode (A, B, C...) */
  paperAlias?: string;
  
  /** Detection ID (e.g. p1_text_0) */
  detectionId: string;
  
  /** Original matched string */
  raw: string;
  
  /** Start position in the original content */
  startIndex: number;
  
  /** End position in the original content */
  endIndex: number;
}

// ============================================================
// Message Context
// ============================================================

/**
 * Message context - used for tag parsing and mapping
 */
export interface MessageContext {
  /** Mode: single paper or multi-paper */
  mode: 'single' | 'multi';
  
  /** Default paper ID in single-paper mode */
  defaultPaperId?: string;
  
  /** Alias map in multi-paper mode */
  paperAliasMap?: PaperAliasMap;
}

// ============================================================
// Validation Results
// ============================================================

/**
 * Citation validation result
 */
export interface CitationValidationResult {
  /** Whether valid */
  valid: boolean;
  
  /** Error type */
  error?: 'unknown_paper' | 'unknown_detection' | 'invalid_format';
  
  /** User-facing suggestion */
  suggestion?: string;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Create a universal reference identifier
 */
export function createCitationUri(paperId: string, detectionId: string): UniversalReferenceId {
  return `${paperId}#${detectionId}` as UniversalReferenceId;
}

/**
 * Parse a universal reference identifier
 */
export function parseCitationUri(uri: UniversalReferenceId): { paperId: string; detectionId: string } | null {
  const parts = uri.split('#');
  if (parts.length !== 2) return null;
  return { paperId: parts[0], detectionId: parts[1] };
}

/**
 * Extract page number from detection ID
 * @example extractPageNumber("p1_text_0") => 1
 */
export function extractPageNumber(detectionId: string): number {
  const match = detectionId.match(/p(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract type from detection ID
 * @example extractDetectionType("p1_text_0") => "text"
 */
export function extractDetectionType(detectionId: string): DetectionType {
  if (detectionId.includes('image') || detectionId.includes('figure')) return 'image';
  if (detectionId.includes('table')) return 'table';
  if (detectionId.includes('equation')) return 'equation';
  if (detectionId.includes('title')) return 'title';
  if (detectionId.includes('sub_title')) return 'sub_title';
  if (detectionId.includes('reference')) return 'reference';
  return 'text';
}

/**
 * Create a Citation object
 */
export function createCitation(
  paperId: string,
  detectionId: string,
  options?: Partial<Omit<Citation, 'uri' | 'paperId' | 'detectionId'>>
): Citation {
  return {
    uri: createCitationUri(paperId, detectionId),
    paperId,
    detectionId,
    pageNumber: options?.pageNumber ?? extractPageNumber(detectionId),
    type: options?.type ?? extractDetectionType(detectionId),
    ...options,
  };
}
