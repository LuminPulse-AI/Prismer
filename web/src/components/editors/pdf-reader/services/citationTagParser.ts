/**
 * Citation Tag Parser
 *
 * Supports two formats:
 * 1. Single paper tags: [[p1_text_0]]
 * 2. Cross-paper tags: [[A:p1_text_0]]
 */

import { TagParseResult, TagType } from '../types/citation';

// ============================================================
// Regular Expression Patterns
// ============================================================

/**
 * Cross-paper tag pattern: [[A:p1_text_0]] or [[A:p1_image_0]]
 * Capture groups: [1] = paper alias (A, B, C...), [2] = detection ID
 */
const CROSS_PAPER_PATTERN = /\[\[([A-Z]):(p\d+_\w+_\d+)\]\]/g;

/**
 * Single paper tag pattern: [[p1_text_0]]
 * Capture groups: [1] = detection ID
 */
const LOCAL_PATTERN = /\[\[(p\d+_\w+_\d+)\]\]/g;

/**
 * Universal tag pattern (for replacement): matches any [[...]] format
 */
const ANY_TAG_PATTERN = /\[\[([A-Z]:)?(p\d+_\w+_\d+)\]\]/g;

// ============================================================
// CitationTagParser Class
// ============================================================

export class CitationTagParser {
  /**
   * Parse all tags from content
   *
   * @param content - Content to parse
   * @returns Array of parse results
   */
  parse(content: string): TagParseResult[] {
    const results: TagParseResult[] = [];
    const processedRanges: Array<{ start: number; end: number }> = [];
    
    // 1. Parse cross-paper tags first (higher priority)
    const crossPaperRegex = new RegExp(CROSS_PAPER_PATTERN.source, 'g');
    let match: RegExpExecArray | null;
    
    while ((match = crossPaperRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;
      
      results.push({
        type: 'cross-paper',
        paperAlias: match[1],
        detectionId: match[2],
        raw: match[0],
        startIndex,
        endIndex,
      });
      
      processedRanges.push({ start: startIndex, end: endIndex });
    }
    
    // 2. Then parse single paper tags (excluding already processed ranges)
    const localRegex = new RegExp(LOCAL_PATTERN.source, 'g');
    
    while ((match = localRegex.exec(content)) !== null) {
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;
      
      // Check if it overlaps with already processed cross-paper tags
      const isOverlapping = processedRanges.some(
        range => startIndex >= range.start && endIndex <= range.end
      );
      
      if (!isOverlapping) {
        results.push({
          type: 'local',
          detectionId: match[1],
          raw: match[0],
          startIndex,
          endIndex,
        });
      }
    }
    
    // 3. Sort by position
    results.sort((a, b) => a.startIndex - b.startIndex);
    
    return results;
  }
  
  /**
   * Parse and replace tags in content
   *
   * @param content - Content to process
   * @param replacer - Replacement function
   * @returns Content with replacements applied
   */
  parseAndReplace(
    content: string,
    replacer: (tag: TagParseResult, index: number) => string
  ): string {
    const tags = this.parse(content);
    
    if (tags.length === 0) return content;
    
    // Replace back-to-front to avoid index offset issues
    let result = content;
    for (let i = tags.length - 1; i >= 0; i--) {
      const tag = tags[i];
      const replacement = replacer(tag, i);
      result = result.slice(0, tag.startIndex) + replacement + result.slice(tag.endIndex);
    }
    
    return result;
  }
  
  /**
   * Check if content contains tags
   */
  hasTag(content: string): boolean {
    return ANY_TAG_PATTERN.test(content);
  }
  
  /**
   * Count tags
   */
  countTags(content: string): { local: number; crossPaper: number; total: number } {
    const tags = this.parse(content);
    const local = tags.filter(t => t.type === 'local').length;
    const crossPaper = tags.filter(t => t.type === 'cross-paper').length;
    return { local, crossPaper, total: tags.length };
  }
  
  /**
   * Extract all unique detection IDs
   */
  extractDetectionIds(content: string): string[] {
    const tags = this.parse(content);
    const ids = new Set(tags.map(t => t.detectionId));
    return Array.from(ids);
  }
  
  /**
   * Extract all unique paper aliases
   */
  extractPaperAliases(content: string): string[] {
    const tags = this.parse(content);
    const aliases = new Set(
      tags
        .filter(t => t.type === 'cross-paper' && t.paperAlias)
        .map(t => t.paperAlias!)
    );
    return Array.from(aliases);
  }
}

// ============================================================
// Error Handler
// ============================================================

export class CitationErrorHandler {
  /**
   * Sanitize and fix formatting errors in AI-generated tags
   */
  sanitize(content: string): string {
    let sanitized = content;
    
    // Error 1: Missing brackets -> cite:p1_text_0 or ref:p1_text_0
    // Fix: Wrap with double brackets
    sanitized = sanitized.replace(
      /(?<!\[)(?:cite|ref):(p\d+_\w+_\d+)(?!\])/gi,
      '[[$1]]'
    );
    
    // Error 2: Consecutive tags without space -> [[p1]][[p2]]
    // Fix: Add space between tags
    sanitized = sanitized.replace(
      /\]\]\[\[/g,
      ']] [['
    );
    
    // Error 3: Wrong prefix format -> [A:p1_text_0] (single brackets)
    // Fix: Double brackets
    sanitized = sanitized.replace(
      /(?<!\[)\[([A-Z]:(p\d+_\w+_\d+))\](?!\])/g,
      '[[$1]]'
    );
    
    // Error 4: Single paper format missing bracket -> [p1_text_0]
    // Fix: Double brackets
    sanitized = sanitized.replace(
      /(?<!\[)\[(p\d+_\w+_\d+)\](?!\])/g,
      '[[$1]]'
    );
    
    // Error 5: Extra whitespace -> [[ p1_text_0 ]] or [[ A:p1_text_0 ]]
    // Fix: Remove whitespace
    sanitized = sanitized.replace(
      /\[\[\s*([A-Z]:)?\s*(p\d+_\w+_\d+)\s*\]\]/g,
      (_, prefix, id) => prefix ? `[[${prefix}${id}]]` : `[[${id}]]`
    );
    
    // Error 6: Spaces around colon -> [[A : p1_text_0]]
    // Fix: Remove spaces
    sanitized = sanitized.replace(
      /\[\[([A-Z])\s*:\s*(p\d+_\w+_\d+)\]\]/g,
      '[[$1:$2]]'
    );
    
    return sanitized;
  }
  
  /**
   * Validate tag format
   */
  validateFormat(tag: string): boolean {
    // Cross-paper format
    if (/^\[\[[A-Z]:p\d+_\w+_\d+\]\]$/.test(tag)) return true;
    // Single paper format
    if (/^\[\[p\d+_\w+_\d+\]\]$/.test(tag)) return true;
    return false;
  }
}

// ============================================================
// Singleton Exports
// ============================================================

export const citationTagParser = new CitationTagParser();
export const citationErrorHandler = new CitationErrorHandler();
