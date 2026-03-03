/**
 * LLM Usage Logger
 *
 * @description
 * Phase 3E: LLM usage logger
 * Records usage and cost of all LLM API calls
 */

import { prisma } from '@/lib/prisma';
import { calculateCost, type LLMUsage, type LLMProvider } from './types';

// ============================================================
// Usage Logger
// ============================================================

/**
 * Log LLM usage
 */
export async function logLLMUsage(usage: LLMUsage): Promise<void> {
  try {
    // Skip database logging if no agentInstanceId is present
    if (!usage.agentInstanceId || !usage.userId) {
      console.log('[LLMUsageLogger] Skipping DB log (no agent/user):', {
        model: usage.model,
        tokens: usage.totalTokens,
        cost: usage.costUsd,
      });
      return;
    }

    await prisma.lLMUsageLog.create({
      data: {
        agentInstanceId: usage.agentInstanceId,
        userId: usage.userId,
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        costUsd: usage.costUsd,
        latencyMs: usage.latencyMs,
        requestId: usage.requestId,
        createdAt: usage.timestamp,
      },
    });

    console.log('[LLMUsageLogger] Logged:', {
      model: usage.model,
      tokens: usage.totalTokens,
      cost: `$${usage.costUsd.toFixed(6)}`,
      latency: `${usage.latencyMs}ms`,
    });
  } catch (error) {
    console.error('[LLMUsageLogger] Failed to log usage:', error);
  }
}

/**
 * Extract usage from OpenAI-format response
 */
export function extractUsageFromOpenAI(
  response: {
    id?: string;
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  },
  metadata: {
    provider?: LLMProvider;
    component?: string;
    agentInstanceId?: string;
    userId?: string;
    latencyMs: number;
  }
): LLMUsage {
  const model = response.model || 'unknown';
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const totalTokens = response.usage?.total_tokens ?? (inputTokens + outputTokens);

  return {
    requestId: response.id || `req-${Date.now()}`,
    agentInstanceId: metadata.agentInstanceId,
    userId: metadata.userId,
    provider: metadata.provider || 'openai',
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd: calculateCost(model, inputTokens, outputTokens),
    latencyMs: metadata.latencyMs,
    component: metadata.component,
    success: true,
    timestamp: new Date(),
  };
}

/**
 * Log streaming response usage
 * Must be called after the stream ends
 */
export async function logStreamingUsage(
  model: string,
  estimatedInputTokens: number,
  outputContent: string,
  metadata: {
    provider?: LLMProvider;
    component?: string;
    agentInstanceId?: string;
    userId?: string;
    latencyMs: number;
  }
): Promise<void> {
  // Estimate output tokens (rough: 4 characters = 1 token)
  const estimatedOutputTokens = Math.ceil(outputContent.length / 4);

  const usage: LLMUsage = {
    requestId: `stream-${Date.now()}`,
    agentInstanceId: metadata.agentInstanceId,
    userId: metadata.userId,
    provider: metadata.provider || 'openai',
    model,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    totalTokens: estimatedInputTokens + estimatedOutputTokens,
    costUsd: calculateCost(model, estimatedInputTokens, estimatedOutputTokens),
    latencyMs: metadata.latencyMs,
    component: metadata.component,
    success: true,
    timestamp: new Date(),
  };

  await logLLMUsage(usage);
}

// ============================================================
// Usage Statistics
// ============================================================

/**
 * Get user usage statistics
 */
export async function getUserUsageStats(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  const logs = await prisma.lLMUsageLog.findMany({
    where: {
      userId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return aggregateUsageLogs(logs, startDate, endDate);
}

/**
 * Get Agent usage statistics
 */
export async function getAgentUsageStats(
  agentInstanceId: string,
  startDate: Date,
  endDate: Date
) {
  const logs = await prisma.lLMUsageLog.findMany({
    where: {
      agentInstanceId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return aggregateUsageLogs(logs, startDate, endDate);
}

/**
 * Get global usage statistics
 */
export async function getGlobalUsageStats(startDate: Date, endDate: Date) {
  const logs = await prisma.lLMUsageLog.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return aggregateUsageLogs(logs, startDate, endDate);
}

/**
 * Aggregate usage logs
 */
function aggregateUsageLogs(
  logs: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    latencyMs: number;
  }>,
  startDate: Date,
  endDate: Date
) {
  const byModel: Record<string, {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }> = {};

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;

  for (const log of logs) {
    totalInputTokens += log.inputTokens;
    totalOutputTokens += log.outputTokens;
    totalCostUsd += log.costUsd;
    totalLatencyMs += log.latencyMs;

    if (!byModel[log.model]) {
      byModel[log.model] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
    }
    byModel[log.model].requests++;
    byModel[log.model].inputTokens += log.inputTokens;
    byModel[log.model].outputTokens += log.outputTokens;
    byModel[log.model].costUsd += log.costUsd;
  }

  return {
    period: { start: startDate, end: endDate },
    totalRequests: logs.length,
    successfulRequests: logs.length, // TODO: track failures
    failedRequests: 0,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUsd: Math.round(totalCostUsd * 1000000) / 1000000,
    avgLatencyMs: logs.length > 0 ? Math.round(totalLatencyMs / logs.length) : 0,
    byModel,
    byComponent: {}, // TODO: implement when component tracking is added
  };
}

// ============================================================
// Cost Alerts
// ============================================================

/**
 * Check if cost threshold is exceeded
 */
export async function checkCostThreshold(
  userId: string,
  thresholdUsd: number,
  periodDays: number = 30
): Promise<{ exceeded: boolean; currentCost: number; threshold: number }> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  const stats = await getUserUsageStats(userId, startDate, new Date());

  return {
    exceeded: stats.totalCostUsd >= thresholdUsd,
    currentCost: stats.totalCostUsd,
    threshold: thresholdUsd,
  };
}
