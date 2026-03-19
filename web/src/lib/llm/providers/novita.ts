/**
 * Novita AI Provider
 *
 * OpenAI-compatible provider via https://api.novita.ai/openai
 * API key: NOVITA_API_KEY environment variable
 */

import type { ProviderConfig } from '../types';

export const NOVITA_BASE_URL = 'https://api.novita.ai/openai';

export const NOVITA_DEFAULT_MODEL = 'moonshotai/kimi-k2.5';

export const NOVITA_MODELS = [
  'moonshotai/kimi-k2.5',
  'deepseek/deepseek-v3.2',
  'zai-org/glm-5',
] as const;

export const NOVITA_EMBEDDING_MODEL = 'qwen/qwen3-embedding-0.6b';

/**
 * Build Novita provider config from environment variables.
 * Returns null if NOVITA_API_KEY is not set.
 */
export function getNovitaProviderConfig(): ProviderConfig | null {
  const apiKey = process.env.NOVITA_API_KEY;
  if (!apiKey) return null;

  return {
    provider: 'novita',
    apiKey,
    baseUrl: NOVITA_BASE_URL,
    defaultModel: process.env.NOVITA_DEFAULT_MODEL || NOVITA_DEFAULT_MODEL,
    enabled: true,
  };
}
