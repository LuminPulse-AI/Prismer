/**
 * Reference Parser Service
 * 
 * Parses paper references, extracts arXiv IDs, and fetches metadata.
 * Supports parsing from local OCR data with fallback to Semantic Scholar API.
 */

import {
  semanticScholarService,
  buildPaperId,
  type S2Reference,
} from './semanticScholarService';

// ============================================================================
// Types
// ============================================================================

export interface ParsedReference {
  /** Reference ID (from detection id, e.g., p22_text_0) */
  id: string;
  /** Raw text */
  rawText: string;
  /** Parsed author list */
  authors: string[];
  /** Paper title (if extractable) */
  title?: string;
  /** Publication year */
  year?: string;
  /** arXiv ID (if available) */
  arxivId?: string;
  /** DOI (if available) */
  doi?: string;
  /** Journal/conference name */
  venue?: string;
  /** URL */
  url?: string;
  /** Whether locally available (has OCR data) */
  isLocallyAvailable?: boolean;
  /** Semantic Scholar additional data */
  _s2Data?: {
    paperId: string;
    citationCount?: number;
    abstract?: string | null;
    openAccessPdf?: string;
  };
}

export interface ArxivMetadata {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  updated: string;
  pdfUrl: string;
  categories: string[];
}

// ============================================================================
// Reference Parser
// ============================================================================

/**
 * Extract references from Markdown content
 */
export function parseReferencesFromMarkdown(markdown: string): ParsedReference[] {
  const references: ParsedReference[] = [];
  
  // Find the References section
  const refSectionMatch = markdown.match(/##\s*References\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!refSectionMatch) {
    return references;
  }
  
  const refSection = refSectionMatch[1];
  
  // Split by <!--ref:xxx--> markers
  const refBlocks = refSection.split(/<!--ref:(p\d+_\w+_\d+)-->/);
  
  for (let i = 1; i < refBlocks.length; i += 2) {
    const id = refBlocks[i];
    const text = refBlocks[i + 1]?.trim();
    
    if (!text) continue;
    
    const parsed = parseReferenceText(id, text);
    if (parsed) {
      references.push(parsed);
    }
  }
  
  return references;
}

/**
 * Parse a single reference text
 *
 * Supports multiple reference formats:
 * - [1] Author, "Title," Venue, Year.
 * - [1] Author (Year). Title. Journal.
 * - Author et al., Title, arXiv:XXXX.XXXXX, Year.
 */
function parseReferenceText(id: string, text: string): ParsedReference | null {
  if (!text || text.length < 10) return null;
  
  const reference: ParsedReference = {
    id,
    rawText: text,
    authors: [],
  };
  
  // Remove reference numbers [1], [2], etc.
  let cleanText = text.replace(/^\s*\[\d+\]\s*/, '').trim();
  
  // Extract arXiv ID (format: arXiv:YYMM.NNNNN or arXiv preprint arXiv:YYMM.NNNNN)
  const arxivMatch = cleanText.match(/arXiv(?:\s*preprint\s*arXiv)?[:\s]*(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (arxivMatch) {
    reference.arxivId = arxivMatch[1];
  }
  
  // Extract DOI
  const doiMatch = cleanText.match(/doi[:\s]*([0-9.]+\/[^\s,]+)/i);
  if (doiMatch) {
    reference.doi = doiMatch[1];
  }
  
  // Extract year - multiple formats
  // Format 1: (2024)
  // Format 2: , 2024.
  // Format 3: Year at end
  const yearPatterns = [
    /\((\d{4})\)/,           // (2024)
    /,\s*(\d{4})\s*[.\s]*$/,  // , 2024. or , 2024
    /(\d{4})\s*$/,            // Year at end
  ];
  for (const pattern of yearPatterns) {
    const match = cleanText.match(pattern);
    if (match && parseInt(match[1]) >= 1990 && parseInt(match[1]) <= 2030) {
      reference.year = match[1];
      break;
    }
  }
  
  // Extract URL
  const urlMatch = cleanText.match(/(https?:\/\/[^\s)]+)/);
  if (urlMatch) {
    reference.url = urlMatch[1];
  }
  
  // Extract title - multiple formats
  // Format 1: "Title" or "Title," (quoted title)
  // Format 2: Author (Year). Title. (title after year)
  // Format 3: Author, Title, Venue (comma-separated)

  // Try quoted title
  const quotedTitle = cleanText.match(/"([^"]+)"/);
  if (quotedTitle) {
    reference.title = quotedTitle[1].trim();
  }
  
  // If no quoted title, try other formats
  if (!reference.title) {
    // Format: Author (Year). Title. or Author (Year), Title,
    const afterYearMatch = cleanText.match(/\(\d{4}\)[a-z]?[.,]\s*([^.]+)/);
    if (afterYearMatch) {
      const potentialTitle = afterYearMatch[1].trim();
      // Exclude content that is too short or looks like a journal name
      if (potentialTitle.length > 10 && !potentialTitle.match(/^(Proc\.|Journal|Trans\.|IEEE|ACM|ICML|NeurIPS|ICLR|ACL|EMNLP)/i)) {
        reference.title = potentialTitle;
      }
    }
  }
  
  // If still no title, try extracting from comma-separated format
  if (!reference.title) {
    // Format: Author, Title, Venue, Year
    // Skip author part before first comma, take second part as title
    const parts = cleanText.split(/,\s*/);
    if (parts.length >= 3) {
      // First part is usually the author, second part may be the title
      const potentialTitle = parts[1];
      if (potentialTitle && potentialTitle.length > 10 && 
          !potentialTitle.match(/^\d{4}$/) && 
          !potentialTitle.match(/^(Cambridge|Oxford|Springer|Elsevier|IEEE|ACM)/i)) {
        reference.title = potentialTitle;
      }
    }
  }
  
  // Extract authors
  // Format 1: Author and Author (Year)
  // Format 2: Author, Author, and Author,
  // Format 3: Author et al.

  // Try matching content before year parentheses
  let authorsStr = '';
  const authorsBeforeYear = cleanText.match(/^(.+?)\s*\(\d{4}\)/);
  if (authorsBeforeYear) {
    authorsStr = authorsBeforeYear[1];
  } else {
    // Try matching content before first quote
    const authorsBeforeQuote = cleanText.match(/^(.+?)\s*"/);
    if (authorsBeforeQuote) {
      authorsStr = authorsBeforeQuote[1].replace(/,\s*$/, ''); // Remove trailing comma
    } else {
      // Take content before first comma as author
      const firstPart = cleanText.split(',')[0];
      if (firstPart && firstPart.length < 100) {
        authorsStr = firstPart;
      }
    }
  }
  
  if (authorsStr) {
    // Parse author list
    reference.authors = authorsStr
      .replace(/\s+et\s+al\.?/gi, '') // Remove et al.
      .split(/,\s*(?:and\s*)?|\s+and\s+/)
      .map(a => a.trim())
      .filter(a => a.length > 1 && a.length < 50 && !a.match(/^\d+$/));
  }
  
  // Extract conference/journal name
  const venuePatterns = [
    /(Proc\.\s*of\s*[A-Z]+|NeurIPS|ICML|ICLR|ACL|EMNLP|NAACL|CVPR|ICCV|ECCV|AAAI|IJCAI)/i,
    /(Journal\s*of\s*[^,]+)/i,
    /(Trans\.\s*on\s*[^,]+)/i,
  ];
  for (const pattern of venuePatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      reference.venue = match[1];
      break;
    }
  }
  
  return reference;
}

// ============================================================================
// ArXiv API Service
// ============================================================================

const ARXIV_API_BASE = "https://export.arxiv.org/api/query";

/**
 * Fetch paper metadata from arXiv API
 */
export async function fetchArxivMetadata(arxivId: string): Promise<ArxivMetadata | null> {
  try {
    const cleanId = arxivId.replace(/^arXiv:/i, "").trim();
    
    const response = await fetch(
      `${ARXIV_API_BASE}?id_list=${cleanId}&max_results=1`
    );
    
    if (!response.ok) {
      console.error(`ArXiv API error: ${response.status}`);
      return null;
    }
    
    const xmlText = await response.text();
    return parseArxivXml(xmlText, cleanId);
  } catch (error) {
    console.error("Failed to fetch arXiv metadata:", error);
    return null;
  }
}

/**
 * Parse arXiv API XML response
 */
function parseArxivXml(xmlText: string, arxivId: string): ArxivMetadata | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    
    const entry = doc.querySelector("entry");
    if (!entry) return null;
    
    const title = entry.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const abstract = entry.querySelector("summary")?.textContent?.trim() || "";
    const published = entry.querySelector("published")?.textContent || "";
    const updated = entry.querySelector("updated")?.textContent || "";
    
    const authorElements = entry.querySelectorAll("author name");
    const authors = Array.from(authorElements).map(el => el.textContent || "");
    
    const categoryElements = entry.querySelectorAll("category");
    const categories = Array.from(categoryElements)
      .map(el => el.getAttribute("term") || "")
      .filter(Boolean);
    
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    
    return {
      arxivId,
      title,
      authors,
      abstract,
      published,
      updated,
      pdfUrl,
      categories,
    };
  } catch (error) {
    console.error("Failed to parse arXiv XML:", error);
    return null;
  }
}

// ============================================================================
// Cache Management
// ============================================================================

const metadataCache = new Map<string, ArxivMetadata>();

/**
 * Get arXiv metadata (with cache)
 */
export async function getArxivMetadata(arxivId: string): Promise<ArxivMetadata | null> {
  if (metadataCache.has(arxivId)) {
    return metadataCache.get(arxivId) || null;
  }
  
  const metadata = await fetchArxivMetadata(arxivId);
  if (metadata) {
    metadataCache.set(arxivId, metadata);
  }
  
  return metadata;
}

/**
 * Batch fetch arXiv metadata
 */
export async function batchGetArxivMetadata(
  arxivIds: string[]
): Promise<Map<string, ArxivMetadata>> {
  const results = new Map<string, ArxivMetadata>();
  const toFetch: string[] = [];
  
  for (const id of arxivIds) {
    if (metadataCache.has(id)) {
      const cached = metadataCache.get(id);
      if (cached) results.set(id, cached);
    } else {
      toFetch.push(id);
    }
  }
  
  if (toFetch.length > 0) {
    for (let i = 0; i < toFetch.length; i += 10) {
      const batch = toFetch.slice(i, i + 10);
      const promises = batch.map(id => getArxivMetadata(id));
      const batchResults = await Promise.all(promises);
      
      batchResults.forEach((meta, idx) => {
        if (meta) {
          results.set(batch[idx], meta);
        }
      });
      
      if (i + 10 < toFetch.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  return results;
}

// ============================================================================
// Local Availability Cache
// ============================================================================

let localPapersCache: Set<string> | null = null;
let localPapersCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getLocalPapers(): Promise<Set<string>> {
  const now = Date.now();
  
  if (localPapersCache && (now - localPapersCacheTime) < CACHE_TTL) {
    return localPapersCache;
  }
  
  try {
    const response = await fetch('/api/papers');
    if (!response.ok) {
      console.warn('Failed to fetch papers list');
      return localPapersCache || new Set();
    }
    
    const data = await response.json();
    const papers = data.papers || data || [];
    
    const paperIds = new Set<string>();
    for (const paper of papers) {
      if (paper.arxivId) paperIds.add(paper.arxivId);
      if (paper.id) paperIds.add(paper.id);
    }
    
    localPapersCache = paperIds;
    localPapersCacheTime = now;
    
    console.log(`[ReferenceService] Cached ${paperIds.size} local papers`);
    return paperIds;
  } catch (error) {
    console.error('Failed to get local papers:', error);
    return localPapersCache || new Set();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export async function checkLocalAvailability(arxivId: string): Promise<boolean> {
  const localPapers = await getLocalPapers();
  return localPapers.has(arxivId);
}

export async function batchCheckLocalAvailability(arxivIds: string[]): Promise<Map<string, boolean>> {
  const localPapers = await getLocalPapers();
  const result = new Map<string, boolean>();
  
  for (const id of arxivIds) {
    result.set(id, localPapers.has(id));
  }
  
  return result;
}

export async function enrichReferencesWithAvailability(
  references: ParsedReference[]
): Promise<ParsedReference[]> {
  const arxivIds = references
    .filter(r => r.arxivId)
    .map(r => r.arxivId!);
  
  const availabilityMap = await batchCheckLocalAvailability(arxivIds);
  
  for (const ref of references) {
    if (ref.arxivId) {
      ref.isLocallyAvailable = availabilityMap.get(ref.arxivId) || false;
    }
  }
  
  return references;
}

// ============================================================================
// Semantic Scholar Integration
// ============================================================================

function s2ReferenceToParseReference(ref: S2Reference, index: number): ParsedReference {
  const paper = ref.citedPaper;
  
  return {
    id: `s2_ref_${index}`,
    rawText: paper.title || '',
    authors: paper.authors?.map(a => a.name) || [],
    title: paper.title || undefined,
    year: paper.year?.toString() || undefined,
    arxivId: paper.externalIds?.ArXiv || undefined,
    doi: paper.externalIds?.DOI || undefined,
    venue: paper.venue || undefined,
    url: paper.url || undefined,
    isLocallyAvailable: false,
    _s2Data: {
      paperId: paper.paperId,
      citationCount: paper.citationCount,
      abstract: paper.abstract,
      openAccessPdf: paper.openAccessPdf?.url,
    },
  };
}

export async function fetchReferencesFromS2(arxivId: string): Promise<ParsedReference[]> {
  console.log(`[ReferenceService] Fetching references from S2 for: ${arxivId}`);
  
  const paperId = buildPaperId(arxivId, 'arxiv');
  const result = await semanticScholarService.getPaperReferences(paperId);
  
  if (!result || !result.data) {
    console.warn(`[ReferenceService] No references found from S2 for: ${arxivId}`);
    return [];
  }
  
  console.log(`[ReferenceService] Found ${result.data.length} references from S2`);
  return result.data.map((ref, index) => s2ReferenceToParseReference(ref, index));
}

export async function getReferences(
  arxivId: string,
  markdown?: string
): Promise<ParsedReference[]> {
  let references: ParsedReference[] = [];
  
  if (markdown) {
    references = parseReferencesFromMarkdown(markdown);
    if (references.length > 0) {
      console.log(`[ReferenceService] Parsed ${references.length} references from local markdown`);
    }
  }
  
  if (references.length === 0 && arxivId) {
    references = await fetchReferencesFromS2(arxivId);
  }
  
  if (references.length > 0) {
    references = await enrichReferencesWithAvailability(references);
  }
  
  return references;
}

export async function getCitations(arxivId: string): Promise<ParsedReference[]> {
  console.log(`[ReferenceService] Fetching citations from S2 for: ${arxivId}`);
  
  const paperId = buildPaperId(arxivId, 'arxiv');
  const result = await semanticScholarService.getPaperCitations(paperId);
  
  if (!result || !result.data) {
    return [];
  }
  
  console.log(`[ReferenceService] Found ${result.data.length} citations from S2`);
  
  const citations: ParsedReference[] = result.data.map((citation, index) => {
    const paper = citation.citingPaper;
    return {
      id: `s2_cite_${index}`,
      rawText: paper.title || '',
      authors: paper.authors?.map(a => a.name) || [],
      title: paper.title || undefined,
      year: paper.year?.toString() || undefined,
      arxivId: paper.externalIds?.ArXiv || undefined,
      doi: paper.externalIds?.DOI || undefined,
      venue: paper.venue || undefined,
      url: paper.url || undefined,
    };
  });
  
  return enrichReferencesWithAvailability(citations);
}
