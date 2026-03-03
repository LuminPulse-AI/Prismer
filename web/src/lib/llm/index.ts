/**
 * LLM Gateway Module
 *
 * @description
 * Phase 3E: LLM gateway module
 * Provides multi-provider support, usage tracking, and cost monitoring
 */

// Types
export type {
  LLMProvider,
  ModelInfo,
  ProviderConfig,
  LLMUsage,
  UsageStats,
  ChatRequest,
  ChatMessage,
  ChatResponse,
} from './types';

export { MODEL_PRICING, calculateCost } from './types';

// Usage Logger
export {
  logLLMUsage,
  extractUsageFromOpenAI,
  logStreamingUsage,
  getUserUsageStats,
  getAgentUsageStats,
  getGlobalUsageStats,
  checkCostThreshold,
} from './usageLogger';
