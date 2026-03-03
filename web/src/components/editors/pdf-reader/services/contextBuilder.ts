/**
 * Context Builder
 * 
 * Builds multi-paper context for AI conversations
 * - Supports single and multi-paper modes
 * - Token budget management
 * - Smart compression
 */

import { PaperContext, PageDetection, Detection, PaperMetadata } from '@/types/paperContext';
import { PaperAliasMap } from '../types/citation';
import { paperAliasAssigner } from './citationMapper';
import { ChatMessage } from '../store/chatSessionStore';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Paper context input
 */
export interface PaperContextInput {
  id: string;
  title: string;
  context: PaperContext;
  priority: 'primary' | 'reference';
}

/**
 * Context build options
 */
export interface ContextBuildOptions {
  /** Target paper list */
  papers: PaperContextInput[];
  
  /** User selection */
  selection?: {
    paperId: string;
    detectionIds: string[];
    expandRadius?: number;
  };
  
  /** Conversation history */
  conversationHistory?: ChatMessage[];
  historyLimit?: number;
  
  /** Token limit */
  maxTokens: number;
  
  /** Include options */
  includeFigures: boolean;
  includeEquations: boolean;
  includeReferences: boolean;
}

/**
 * Build result
 */
export interface BuiltContext {
  /** System prompt */
  systemPrompt: string;
  
  /** Paper context */
  paperContext: string;
  
  /** Paper alias mapping */
  paperAliasMap: PaperAliasMap;
  
  /** Estimated token count */
  estimatedTokens: number;
  
  /** Mode */
  mode: 'single' | 'multi';
  
  /** Detection ID to paper mapping */
  detectionToPaper: Map<string, string>;
}

// ============================================================
// Constants
// ============================================================

const TOKENS_PER_CHAR = 0.25; // Rough estimate

const SECTION_PRIORITIES: Record<string, number> = {
  title: 1.0,
  abstract: 0.95,
  introduction: 0.9,
  method: 0.8,
  methods: 0.8,
  results: 0.8,
  discussion: 0.75,
  conclusion: 0.85,
  references: 0.3,
  appendix: 0.2,
};

// ============================================================
// ContextBuilder Class
// ============================================================

export class ContextBuilder {
  /**
   * Build complete context
   */
  build(options: ContextBuildOptions): BuiltContext {
    const { papers } = options;
    const isMultiPaper = papers.length > 1;
    
    // Assign paper aliases
    const paperIds = papers.map(p => p.id);
    const paperAliasMap = paperAliasAssigner.assignAliases(paperIds);
    
    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(papers, paperAliasMap, isMultiPaper);

    // Build paper context
    const { paperContext, detectionToPaper } = this.buildPaperContext(
      papers,
      paperAliasMap,
      options
    );
    
    // Estimate tokens
    const totalChars = systemPrompt.length + paperContext.length;
    const estimatedTokens = Math.ceil(totalChars * TOKENS_PER_CHAR);
    
    return {
      systemPrompt,
      paperContext,
      paperAliasMap,
      estimatedTokens,
      mode: isMultiPaper ? 'multi' : 'single',
      detectionToPaper,
    };
  }
  
  /**
   * Build system prompt
   */
  private buildSystemPrompt(
    papers: PaperContextInput[],
    aliasMap: PaperAliasMap,
    isMultiPaper: boolean
  ): string {
    const lines: string[] = [];
    
    // Role definition
    lines.push('# Role');
    lines.push('');
    lines.push('You are an expert academic paper analyst. Your task is to help users understand and analyze research papers.');
    lines.push('');
    
    // Paper identification
    lines.push('# Papers in This Session');
    lines.push('');
    
    for (const paper of papers) {
      const alias = paperAliasAssigner.getAliasForPaper(paper.id, aliasMap);
      const priority = paper.priority === 'primary' ? '(primary)' : '(reference)';
      lines.push(`- **${alias}**: "${paper.title}" ${priority}`);
    }
    lines.push('');
    
    // Citation format
    lines.push('# Citation Format');
    lines.push('');
    
    if (isMultiPaper) {
      lines.push('When citing content from papers, use this format: `[[Paper:detection_id]]`');
      lines.push('');
      lines.push('Examples:');
      lines.push('- `[[A:p1_text_0]]` - cites paragraph 0 on page 1 of Paper A');
      lines.push('- `[[B:p3_image_0]]` - cites image 0 on page 3 of Paper B');
      lines.push('');
      lines.push('**IMPORTANT**: Always include the paper identifier prefix to distinguish sources.');
    } else {
      lines.push('When citing content, use this format: `[[detection_id]]`');
      lines.push('');
      lines.push('Examples:');
      lines.push('- `[[p1_text_0]]` - cites paragraph 0 on page 1');
      lines.push('- `[[p3_image_0]]` - cites image 0 on page 3');
    }
    lines.push('');
    
    // Output guidelines
    lines.push('# Output Guidelines');
    lines.push('');
    lines.push('1. Provide accurate, well-structured responses');
    lines.push('2. Cite specific sections using the format above');
    lines.push('3. Use multiple citations when appropriate');
    lines.push('4. If information is not in the provided context, say so');
    lines.push('');
    
    return lines.join('\n');
  }
  
  /**
   * Build paper context
   */
  private buildPaperContext(
    papers: PaperContextInput[],
    aliasMap: PaperAliasMap,
    options: ContextBuildOptions
  ): { paperContext: string; detectionToPaper: Map<string, string> } {
    const lines: string[] = [];
    const detectionToPaper = new Map<string, string>();
    const isMultiPaper = papers.length > 1;
    
    // Calculate token budget per paper
    const primaryPapers = papers.filter(p => p.priority === 'primary');
    const referencePapers = papers.filter(p => p.priority === 'reference');
    
    const primaryBudget = Math.floor(options.maxTokens * 0.7 / Math.max(primaryPapers.length, 1));
    const referenceBudget = Math.floor(options.maxTokens * 0.25 / Math.max(referencePapers.length, 1));
    
    for (const paper of papers) {
      const alias = paperAliasAssigner.getAliasForPaper(paper.id, aliasMap);
      const budget = paper.priority === 'primary' ? primaryBudget : referenceBudget;
      
      lines.push('---');
      lines.push('');
      lines.push(`## [Paper ${alias}] ${paper.title}`);
      lines.push('');
      
      // Build paper content
      const content = this.buildSinglePaperContext(
        paper,
        alias || 'A',
        budget,
        options,
        isMultiPaper,
        detectionToPaper
      );
      
      lines.push(content);
      lines.push('');
    }
    
    return {
      paperContext: lines.join('\n'),
      detectionToPaper,
    };
  }
  
  /**
   * Build context for a single paper
   */
  private buildSinglePaperContext(
    paper: PaperContextInput,
    alias: string,
    tokenBudget: number,
    options: ContextBuildOptions,
    isMultiPaper: boolean,
    detectionToPaper: Map<string, string>
  ): string {
    const lines: string[] = [];
    const charBudget = Math.floor(tokenBudget / TOKENS_PER_CHAR);
    let currentChars = 0;
    
    const { context } = paper;
    
    // Add metadata
    if (context.metadata) {
      const meta = context.metadata;
      lines.push(`**Authors**: ${meta.authors?.join(', ') || 'Unknown'}`);
      if (meta.arxivId) lines.push(`**ArXiv**: ${meta.arxivId}`);
      lines.push('');
      currentChars += 200; // Estimate
    }
    
    // Process detections
    if (context.detections && context.detections.length > 0) {
      const allDetections: Array<{ detection: Detection; pageNum: number }> = [];
      
      for (const pageDetection of context.detections) {
        for (const detection of pageDetection.detections) {
          allDetections.push({
            detection,
            pageNum: pageDetection.page_number,
          });
        }
      }
      
      // Sort by priority
      const sortedDetections = this.prioritizeDetections(allDetections, options);
      
      // Add detections
      let currentSection = '';
      
      for (const { detection, pageNum } of sortedDetections) {
        if (currentChars >= charBudget) break;
        
        // Filter by type
        if (!options.includeFigures && detection.label === 'image') continue;
        if (!options.includeEquations && detection.label === 'equation') continue;
        if (!options.includeReferences && detection.label === 'reference') continue;
        
        // Get content
        const text = detection.raw_text || detection.text || '';
        if (!text || text.length < 10) continue;
        
        // Build ID
        const detectionId = detection.id || `p${pageNum}_${detection.label}_0`;
        const fullId = isMultiPaper ? `${alias}:${detectionId}` : detectionId;
        
        // Record mapping
        detectionToPaper.set(detectionId, paper.id);
        
        // Check if a new section heading is needed
        const sectionLabel = this.getSectionLabel(detection.label);
        if (sectionLabel && sectionLabel !== currentSection) {
          currentSection = sectionLabel;
          lines.push(`### ${sectionLabel}`);
          lines.push('');
        }
        
        // Add content
        const truncatedText = text.slice(0, 1000); // Max length per detection
        lines.push(`${fullId}: ${truncatedText}`);
        lines.push('');
        
        currentChars += truncatedText.length + 50;
      }
    } else if (context.markdown) {
      // Use markdown as fallback
      const truncated = context.markdown.slice(0, charBudget);
      lines.push(truncated);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Sort detections by priority
   */
  private prioritizeDetections(
    detections: Array<{ detection: Detection; pageNum: number }>,
    options: ContextBuildOptions
  ): Array<{ detection: Detection; pageNum: number }> {
    return [...detections].sort((a, b) => {
      // If there is a selection, prioritize selected items
      if (options.selection) {
        const aSelected = options.selection.detectionIds.includes(a.detection.id || '');
        const bSelected = options.selection.detectionIds.includes(b.detection.id || '');
        if (aSelected && !bSelected) return -1;
        if (bSelected && !aSelected) return 1;
      }
      
      // By type priority
      const aPriority = this.getLabelPriority(a.detection.label);
      const bPriority = this.getLabelPriority(b.detection.label);
      if (aPriority !== bPriority) return bPriority - aPriority;
      
      // By page number
      return a.pageNum - b.pageNum;
    });
  }
  
  /**
   * Get label priority
   */
  private getLabelPriority(label: string): number {
    switch (label) {
      case 'title': return 1.0;
      case 'sub_title': return 0.9;
      case 'text': return 0.7;
      case 'equation': return 0.6;
      case 'table': return 0.6;
      case 'image': return 0.5;
      case 'reference': return 0.2;
      default: return 0.5;
    }
  }
  
  /**
   * Get section label
   */
  private getSectionLabel(label: string): string | null {
    switch (label) {
      case 'title': return 'Title';
      case 'sub_title': return null; // Use the actual title
      case 'text': return null;
      case 'equation': return 'Equations';
      case 'table': return 'Tables';
      case 'image': return 'Figures';
      case 'reference': return 'References';
      default: return null;
    }
  }
  
  /**
   * Build conversation history context
   */
  buildConversationContext(
    messages: ChatMessage[],
    limit: number = 10
  ): string {
    const recentMessages = messages.slice(-limit);
    
    const lines: string[] = [];
    lines.push('# Conversation History');
    lines.push('');
    
    for (const msg of recentMessages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      // Strip tags to save tokens
      const content = msg.rawContent.replace(/\[\[.*?\]\]/g, '[citation]');
      const truncated = content.slice(0, 500);
      lines.push(`**${role}**: ${truncated}`);
      lines.push('');
    }
    
    return lines.join('\n');
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const contextBuilder = new ContextBuilder();
