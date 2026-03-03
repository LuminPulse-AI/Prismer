/**
 * Citation Tag Mapper
 *
 * Converts AI-generated tags into full Citation objects
 */

import {
  Citation,
  TagParseResult,
  MessageContext,
  PaperAliasMap,
  createCitation,
  extractPageNumber,
  extractDetectionType,
} from '../types/citation';
import { citationTagParser } from './citationTagParser';

// ============================================================
// CitationMapper Class
// ============================================================

export class CitationMapper {
  /**
   * Convert parse results to Citation array
   *
   * @param parseResults - Tag parse results
   * @param context - Message context
   * @returns Citation array
   */
  mapToCitations(
    parseResults: TagParseResult[],
    context: MessageContext
  ): Citation[] {
    return parseResults.map((result, index) => {
      let paperId: string;
      let paperAlias: string | undefined;
      
      if (result.type === 'cross-paper' && result.paperAlias) {
        // Cross-paper mode: resolve paperId from alias map
        paperAlias = result.paperAlias;
        paperId = context.paperAliasMap?.[result.paperAlias] || result.paperAlias;
      } else {
        // Single paper mode: use default paperId
        paperId = context.defaultPaperId || 'unknown';
      }
      
      return createCitation(paperId, result.detectionId, {
        displayIndex: index + 1,
        paperAlias,
      });
    });
  }
  
  /**
   * Parse content and map directly to Citations
   *
   * @param content - Content string
   * @param context - Message context
   * @returns Citation array
   */
  parseAndMap(content: string, context: MessageContext): Citation[] {
    const parseResults = citationTagParser.parse(content);
    return this.mapToCitations(parseResults, context);
  }
  
  /**
   * Enrich Citation with additional information
   *
   * @param citation - Base Citation
   * @param enrichment - Additional information
   * @returns Enriched Citation
   */
  enrichCitation(
    citation: Citation,
    enrichment: {
      paperTitle?: string;
      excerpt?: string;
    }
  ): Citation {
    return {
      ...citation,
      ...enrichment,
    };
  }
  
  /**
   * Batch enrich Citations
   *
   * @param citations - Citation array
   * @param paperTitles - paperId -> title mapping
   * @param excerpts - detectionId -> excerpt mapping (grouped by paperId)
   */
  enrichCitations(
    citations: Citation[],
    paperTitles: Record<string, string>,
    excerpts?: Record<string, Record<string, string>>
  ): Citation[] {
    return citations.map(citation => ({
      ...citation,
      paperTitle: paperTitles[citation.paperId] || citation.paperTitle,
      excerpt: excerpts?.[citation.paperId]?.[citation.detectionId] || citation.excerpt,
    }));
  }
  
  /**
   * Reassign display indices
   *
   * Used when displaying citations in a specific order
   */
  reindexCitations(citations: Citation[]): Citation[] {
    return citations.map((citation, index) => ({
      ...citation,
      displayIndex: index + 1,
    }));
  }
  
  /**
   * Deduplicate Citations (based on URI)
   */
  deduplicateCitations(citations: Citation[]): Citation[] {
    const seen = new Set<string>();
    return citations.filter(citation => {
      if (seen.has(citation.uri)) return false;
      seen.add(citation.uri);
      return true;
    });
  }
  
  /**
   * Group Citations by paper
   */
  groupByPaper(citations: Citation[]): Record<string, Citation[]> {
    return citations.reduce((groups, citation) => {
      const key = citation.paperId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(citation);
      return groups;
    }, {} as Record<string, Citation[]>);
  }
  
  /**
   * Sort Citations by page number
   */
  sortByPage(citations: Citation[]): Citation[] {
    return [...citations].sort((a, b) => {
      // Sort by paper first
      if (a.paperId !== b.paperId) {
        return a.paperId.localeCompare(b.paperId);
      }
      // Then sort by page number
      return a.pageNumber - b.pageNumber;
    });
  }
}

// ============================================================
// Paper Alias Assigner
// ============================================================

export class PaperAliasAssigner {
  private readonly aliases = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  /**
   * Assign stable aliases to papers
   *
   * Key: within the same session, a paper's alias must remain stable.
   * Otherwise, [[A:xxx]] references in historical messages would become invalid.
   *
   * @param paperIds - List of paper IDs
   * @param existingMap - Existing alias mapping
   * @returns Updated alias mapping
   */
  assignAliases(
    paperIds: string[],
    existingMap?: PaperAliasMap
  ): PaperAliasMap {
    const map: PaperAliasMap = { ...existingMap };
    const usedAliases = new Set(Object.keys(map));
    
    for (const paperId of paperIds) {
      // Check if alias already exists
      const existingAlias = this.getAliasForPaper(paperId, map);
      if (existingAlias) continue;
      
      // Assign new alias
      const nextAlias = this.aliases.find(a => !usedAliases.has(a));
      if (nextAlias) {
        map[nextAlias] = paperId;
        usedAliases.add(nextAlias);
      } else {
        // Exceeded 26 papers, use extended aliases (AA, AB, ...)
        console.warn('Exceeded 26 papers, using extended aliases');
        const extendedAlias = `P${Object.keys(map).length + 1}`;
        map[extendedAlias] = paperId;
      }
    }
    
    return map;
  }
  
  /**
   * Reverse lookup: paperId -> alias
   */
  getAliasForPaper(paperId: string, map: PaperAliasMap): string | null {
    const entry = Object.entries(map).find(([_, id]) => id === paperId);
    return entry ? entry[0] : null;
  }
  
  /**
   * Forward lookup: alias -> paperId
   */
  getPaperForAlias(alias: string, map: PaperAliasMap): string | null {
    return map[alias] || null;
  }
  
  /**
   * Remove paper alias
   * Note: aliases should generally not be removed to keep historical messages valid
   */
  removeAlias(paperId: string, map: PaperAliasMap): PaperAliasMap {
    const alias = this.getAliasForPaper(paperId, map);
    if (!alias) return map;
    
    const newMap = { ...map };
    delete newMap[alias];
    return newMap;
  }
  
  /**
   * Check if in multi-paper mode
   */
  isMultiPaperMode(map: PaperAliasMap): boolean {
    return Object.keys(map).length > 1;
  }
  
  /**
   * Get all paper IDs
   */
  getAllPaperIds(map: PaperAliasMap): string[] {
    return Object.values(map);
  }
}

// ============================================================
// Singleton Exports
// ============================================================

export const citationMapper = new CitationMapper();
export const paperAliasAssigner = new PaperAliasAssigner();
