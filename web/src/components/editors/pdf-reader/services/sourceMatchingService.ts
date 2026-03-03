/**
 * Source Matching Service
 * 
 * Matches citation text from AI responses to PDF source locations.
 * Implements precise source tracing functionality.
 */

import {
  PaperContext,
  SourceCitation,
  BoundingBox,
  PageDetection,
  ISourceMatchingService,
} from '@/types/paperContext';

/**
 * Fuzzy match options
 */
interface FuzzyMatchOptions {
  /** Minimum match score (0-1) */
  minScore?: number;
  /** Whether to ignore case */
  ignoreCase?: boolean;
  /** Whether to ignore whitespace differences */
  ignoreWhitespace?: boolean;
}

/**
 * Match result
 */
interface MatchResult {
  pageNumber: number;
  score: number;
  matchedText: string;
  bbox?: BoundingBox;
  detection?: PageDetection['detections'][0];
}

/**
 * Source Matching Service implementation
 */
export class SourceMatchingService implements ISourceMatchingService {
  private defaultOptions: FuzzyMatchOptions = {
    minScore: 0.6,
    ignoreCase: true,
    ignoreWhitespace: true,
  };

  /**
   * Match text to PDF location
   */
  matchTextToSource(
    text: string,
    context: PaperContext,
    options?: FuzzyMatchOptions
  ): SourceCitation | null {
    const opts = { ...this.defaultOptions, ...options };
    const normalizedText = this.normalizeText(text, opts);
    
    if (!normalizedText || normalizedText.length < 10) {
      return null;
    }

    // First search in markdown
    const pageHits = this.searchInMarkdown(normalizedText, context, opts);
    
    if (pageHits.length === 0) {
      return null;
    }

    // Take best match
    const bestHit = pageHits.reduce((best, current) => 
      current.score > best.score ? current : best
    );

    // Try to find precise location in detections
    const bbox = this.findBboxForText(
      text,
      bestHit.pageNumber,
      context.detections,
      opts
    );

    return {
      id: `citation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: bestHit.matchedText || text,
      pageNumber: bestHit.pageNumber,
      bbox,
      confidence: bestHit.score,
    };
  }

  /**
   * Batch matching
   */
  matchMultiple(
    texts: string[],
    context: PaperContext,
    options?: FuzzyMatchOptions
  ): SourceCitation[] {
    return texts
      .map(text => this.matchTextToSource(text, context, options))
      .filter((citation): citation is SourceCitation => citation !== null);
  }

  /**
   * Get text by page number and coordinates
   */
  getTextAtPosition(
    pageNumber: number,
    bbox: BoundingBox,
    context: PaperContext
  ): string | null {
    const pageDetections = context.detections.find(
      d => d.page_number === pageNumber
    );
    
    if (!pageDetections) {
      return null;
    }

    // Find detection overlapping with bbox
    for (const detection of pageDetections.detections) {
      for (const box of detection.boxes) {
        if (this.boxesOverlap(bbox, box)) {
          return detection.raw_text ?? null;
        }
      }
    }

    return null;
  }

  /**
   * Search in markdown content
   */
  private searchInMarkdown(
    text: string,
    context: PaperContext,
    options: FuzzyMatchOptions
  ): MatchResult[] {
    const results: MatchResult[] = [];

    // Search by page
    for (const page of context.pages) {
      const pageContent = this.normalizeText(page.content, options);
      const score = this.calculateMatchScore(text, pageContent);
      
      if (score >= (options.minScore || 0.6)) {
        // Try to find the best matching substring
        const matchedText = this.findBestMatchingSubstring(text, page.content);
        
        results.push({
          pageNumber: page.page_number,
          score,
          matchedText: matchedText || text,
        });
      }
    }

    // Sort by score
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Find precise bbox in detections
   */
  private findBboxForText(
    text: string,
    pageNumber: number,
    detections: PageDetection[],
    options: FuzzyMatchOptions
  ): BoundingBox | undefined {
    const pageDetections = detections.find(d => d.page_number === pageNumber);
    if (!pageDetections) return undefined;

    const normalizedText = this.normalizeText(text, options);
    let bestMatch: { detection: PageDetection['detections'][0]; score: number } | null = null;

    for (const detection of pageDetections.detections) {
      // Skip non-text types or detections without text content
      if (!['text', 'title', 'sub_title'].includes(detection.label) || !detection.raw_text) {
        continue;
      }

      const detectionText = this.normalizeText(detection.raw_text, options);
      const score = this.calculateMatchScore(normalizedText, detectionText);

      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { detection, score };
      }
    }

    if (bestMatch && bestMatch.detection.boxes.length > 0) {
      return bestMatch.detection.boxes[0];
    }

    return undefined;
  }

  /**
   * Normalize text
   */
  private normalizeText(text: string, options: FuzzyMatchOptions): string {
    let normalized = text;
    
    if (options.ignoreCase) {
      normalized = normalized.toLowerCase();
    }
    
    if (options.ignoreWhitespace) {
      // Replace multiple whitespace characters with a single space
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }

    // Remove special characters
    normalized = normalized.replace(/[^\w\s]/g, '');

    return normalized;
  }

  /**
   * Calculate match score (using Jaccard similarity)
   */
  private calculateMatchScore(query: string, target: string): number {
    if (!query || !target) return 0;

    // For short text, check containment
    if (query.length < 50) {
      if (target.includes(query)) {
        return 1.0;
      }
    }

    // Use n-gram similarity
    const queryGrams = this.getNGrams(query, 3);
    const targetGrams = this.getNGrams(target, 3);

    const intersection = queryGrams.filter(g => targetGrams.includes(g));
    const union = new Set([...queryGrams, ...targetGrams]);

    return union.size > 0 ? intersection.length / union.size : 0;
  }

  /**
   * Get n-grams
   */
  private getNGrams(text: string, n: number): string[] {
    const grams: string[] = [];
    for (let i = 0; i <= text.length - n; i++) {
      grams.push(text.slice(i, i + n));
    }
    return grams;
  }

  /**
   * Find best matching substring
   */
  private findBestMatchingSubstring(query: string, content: string): string | null {
    // Simple implementation: return the sentence containing query words
    const sentences = content.split(/[.!?]+/);
    const queryWords = query.toLowerCase().split(/\s+/).slice(0, 5);

    let bestSentence: string | null = null;
    let bestScore = 0;

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      let score = 0;
      
      for (const word of queryWords) {
        if (lowerSentence.includes(word)) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence.trim();
      }
    }

    return bestSentence;
  }

  /**
   * Check if two bounding boxes overlap
   */
  private boxesOverlap(box1: BoundingBox, box2: BoundingBox): boolean {
    // Using pixel coordinates
    return !(
      box1.x2_px < box2.x1_px ||
      box1.x1_px > box2.x2_px ||
      box1.y2_px < box2.y1_px ||
      box1.y1_px > box2.y2_px
    );
  }
}

/**
 * Create Source Matching Service instance
 */
export function createSourceMatchingService(): ISourceMatchingService {
  return new SourceMatchingService();
}

/**
 * Singleton instance
 */
let defaultMatchingService: ISourceMatchingService | null = null;

export function getDefaultSourceMatchingService(): ISourceMatchingService {
  if (!defaultMatchingService) {
    defaultMatchingService = new SourceMatchingService();
  }
  return defaultMatchingService;
}


