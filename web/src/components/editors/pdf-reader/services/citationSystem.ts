/**
 * Cross-Paper Citation Tag System - Unified Exports
 *
 * Usage:
 * ```typescript
 * import {
 *   Citation,
 *   citationTagParser,
 *   citationMapper,
 *   citationNavigator,
 *   paperAliasAssigner,
 * } from './services/citationSystem';
 *
 * // Parse tags
 * const tags = citationTagParser.parse(content);
 *
 * // Map to Citations
 * const citations = citationMapper.mapToCitations(tags, context);
 *
 * // Navigate to citation
 * await citationNavigator.navigate(citation);
 * ```
 */

// Type exports
export type {
  Citation,
  TagParseResult,
  MessageContext,
  PaperAliasMap,
  DetectionType,
  UniversalReferenceId,
  CitationValidationResult,
  TagType,
} from '../types/citation';

// Utility function exports
export {
  createCitationUri,
  parseCitationUri,
  extractPageNumber,
  extractDetectionType,
  createCitation,
} from '../types/citation';

// Parser exports
export {
  CitationTagParser,
  CitationErrorHandler,
  citationTagParser,
  citationErrorHandler,
} from './citationTagParser';

// Mapper exports
export {
  CitationMapper,
  PaperAliasAssigner,
  citationMapper,
  paperAliasAssigner,
} from './citationMapper';

// Navigator exports
export type {
  NavigationTarget,
  NavigationResult,
  DocumentStateChecker,
  PDFScrollController,
} from './citationNavigator';

export {
  CitationNavigator,
  citationNavigator,
  emitScrollToDetection,
  emitScrollToPage,
} from './citationNavigator';
