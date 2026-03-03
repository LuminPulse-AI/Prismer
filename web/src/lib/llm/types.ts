/**
 * LLM Gateway Types
 *
 * @description
 * Phase 3E: LLM gateway type definitions
 * Supports multi-provider, usage tracking, and cost monitoring
 */

// ============================================================
// Provider Types
// ============================================================

/**
 * Supported LLM providers
 */
export type LLMProvider = 'anthropic' | 'openai' | 'prismer' | 'custom';

/**
 * Model information
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: LLMProvider;
  /** Input price (USD per 1M tokens) */
  inputPricePerM: number;
  /** Output price (USD per 1M tokens) */
  outputPricePerM: number;
  /** Context window size */
  contextWindow: number;
  /** Max output tokens */
  maxOutputTokens: number;
  /** Whether reasoning mode is supported */
  reasoning?: boolean;
  /** Whether vision is supported */
  vision?: boolean;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  enabled: boolean;
}

// ============================================================
// Usage Types
// ============================================================

/**
 * LLM usage record
 */
export interface LLMUsage {
  /** Request ID */
  requestId: string;
  /** Agent Instance ID */
  agentInstanceId?: string;
  /** User ID */
  userId?: string;
  /** Provider */
  provider: LLMProvider;
  /** Model */
  model: string;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Cost (USD) */
  costUsd: number;
  /** Latency (ms) */
  latencyMs: number;
  /** Source component */
  component?: string;
  /** Success/failure */
  success: boolean;
  /** Error message */
  error?: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Usage statistics
 */
export interface UsageStats {
  /** Time period */
  period: {
    start: Date;
    end: Date;
  };
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total tokens */
  totalTokens: number;
  /** Total cost (USD) */
  totalCostUsd: number;
  /** Average latency (ms) */
  avgLatencyMs: number;
  /** Statistics by model */
  byModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
  /** Statistics by component */
  byComponent: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }>;
}

// ============================================================
// Request/Response Types
// ============================================================

/**
 * Chat request
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Source component (for tracking) */
  component?: string;
  /** Agent Instance ID */
  agentInstanceId?: string;
  /** User ID */
  userId?: string;
}

/**
 * Chat message
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat response
 */
export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

// ============================================================
// Cost Calculation
// ============================================================

/**
 * Model pricing table (USD per 1M tokens)
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'o1': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 12.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // Default fallback
  'default': { input: 1.0, output: 3.0 },
};

/**
 * Calculate API call cost
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal precision
}
