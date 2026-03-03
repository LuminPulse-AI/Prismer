/**
 * Unified AI Client
 *
 * Unified AI client; all components call LLM through this module.
 * Supports streaming/non-streaming, intent presets, AbortController, and SSE parsing.
 *
 * Design principles:
 * - Components declare intent (creative/analytical/code); the client applies parameter presets
 * - Server-side /api/ai/chat handles model normalization (temperature, system message, etc.)
 * - Unified SSE stream parsing and error handling
 */

// ============================================================
// Types
// ============================================================

export type AIIntent = 'creative' | 'analytical' | 'code' | 'chat' | 'translate';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequestOptions {
  /** Message list */
  messages: AIMessage[];
  /** Model name; 'default' uses server-side config */
  model?: string;
  /** Intent preset — automatically sets temperature/max_tokens */
  intent?: AIIntent;
  /** Whether to stream the response */
  stream?: boolean;
  /** Override temperature (takes precedence over intent preset) */
  temperature?: number;
  /** Override max_tokens (takes precedence over intent preset) */
  maxTokens?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Additional passthrough parameters */
  extra?: Record<string, unknown>;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  /** Full response (only available when done=true) */
  fullContent?: string;
}

export interface AIResponse {
  content: string;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIError {
  message: string;
  status?: number;
  details?: string;
}

// ============================================================
// Intent Presets
// ============================================================

const INTENT_PRESETS: Record<AIIntent, { temperature: number; maxTokens: number }> = {
  creative:   { temperature: 0.8, maxTokens: 2000 },
  analytical: { temperature: 0.3, maxTokens: 1500 },
  code:       { temperature: 0.2, maxTokens: 2000 },
  chat:       { temperature: 0.7, maxTokens: 2000 },
  translate:  { temperature: 0.3, maxTokens: 1500 },
};

// ============================================================
// Core Functions
// ============================================================

function buildRequestBody(options: AIRequestOptions): Record<string, unknown> {
  const preset = options.intent ? INTENT_PRESETS[options.intent] : undefined;

  return {
    messages: options.messages,
    model: options.model || 'default',
    stream: options.stream ?? true,
    temperature: options.temperature ?? preset?.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? preset?.maxTokens ?? 2000,
    ...options.extra,
  };
}

/**
 * Non-streaming AI call
 */
export async function aiChat(options: AIRequestOptions): Promise<AIResponse> {
  const body = buildRequestBody({ ...options, stream: false });

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: AIError = {
      message: errorData.error || `AI request failed (${response.status})`,
      status: response.status,
      details: errorData.details,
    };
    throw error;
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model,
    usage: data.usage,
  };
}

/**
 * Streaming AI call — returns AsyncGenerator
 *
 * Usage:
 * ```ts
 * for await (const chunk of aiChatStream({ messages, intent: 'chat' })) {
 *   console.log(chunk.content);
 *   if (chunk.done) console.log('Full:', chunk.fullContent);
 * }
 * ```
 */
export async function* aiChatStream(
  options: AIRequestOptions
): AsyncGenerator<AIStreamChunk> {
  const body = buildRequestBody({ ...options, stream: true });

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error: AIError = {
      message: errorData.error || `AI stream failed (${response.status})`,
      status: response.status,
      details: errorData.details,
    };
    throw error;
  }

  if (!response.body) {
    throw { message: 'No response body for stream' } as AIError;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          yield { content: '', done: true, fullContent };
          return;
        }

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              yield { content: delta, done: false };
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }

    // Stream ended without [DONE]
    if (fullContent) {
      yield { content: '', done: true, fullContent };
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Streaming AI call — callback mode (for existing component compatibility)
 *
 * Returns AbortController; call .abort() to cancel the request
 */
export function aiChatStreamCallback(
  options: Omit<AIRequestOptions, 'signal'>,
  callbacks: {
    onChunk: (content: string) => void;
    onDone?: (fullContent: string) => void;
    onError?: (error: AIError) => void;
  }
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      for await (const chunk of aiChatStream({ ...options, signal: controller.signal })) {
        if (chunk.done) {
          callbacks.onDone?.(chunk.fullContent || '');
        } else {
          callbacks.onChunk(chunk.content);
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      callbacks.onError?.(err as AIError);
    }
  })();

  return controller;
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Quick single-turn chat
 */
export async function aiQuickChat(
  prompt: string,
  options?: Partial<AIRequestOptions>
): Promise<string> {
  const result = await aiChat({
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    ...options,
  });
  return result.content;
}

/**
 * System prompt + user input mode
 */
export async function aiWithSystem(
  systemPrompt: string,
  userPrompt: string,
  options?: Partial<AIRequestOptions>
): Promise<string> {
  const result = await aiChat({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    ...options,
  });
  return result.content;
}
