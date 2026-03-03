/**
 * AiEditor AI Configuration
 *
 * Note: AiEditor's AI features are currently disabled on the client side
 * because they require directly exposing the API Key, which is insecure
 *
 * The PDF reader's AI features (Insights, Chat, Translation) use the server-side proxy /api/ai/*
 */

import type { AiEditorOptions } from 'aieditor';

// ============================================================
// Types
// ============================================================

interface AiConfig {
  enabled: boolean;
}

// ============================================================
// Config
// ============================================================

let _aiEnabled: boolean | null = null;

/**
 * Check if AI service is available
 */
async function checkAiAvailability(): Promise<boolean> {
  if (_aiEnabled !== null) {
    return _aiEnabled;
  }

  try {
    const response = await fetch('/api/config/client');
    if (response.ok) {
      const config = await response.json();
      _aiEnabled = !!config.aiEnabled;
      return _aiEnabled;
    }
  } catch (error) {
    console.warn('[AiEditor] Failed to check AI availability:', error);
  }

  _aiEnabled = false;
  return false;
}

// Preload
if (typeof window !== 'undefined') {
  checkAiAvailability().catch(() => {});
}

// ============================================================
// AI menu configuration (reserved for future use)
// ============================================================

const AI_MENUS = [
  {
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
    name: 'explain',
    prompt: 'Please explain the following content in simple, easy-to-understand language:\n\n{content}',
  },
  {
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
    name: 'summarize',
    prompt: 'Please concisely summarize the key points of the following content (use bullet points):\n\n{content}',
  },
  {
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    name: 'improve',
    prompt: 'Please improve the following text to make it clearer and more professional:\n\n{content}',
  },
  {
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
    name: 'translate-en',
    prompt: 'Please translate the following content into English, maintaining an academic style:\n\n{content}',
  },
  {
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
    name: 'translate-zh',
    prompt: 'Please translate the following content into Chinese, maintaining an academic style:\n\n{content}',
  },
];

// ============================================================
// Public API
// ============================================================

/**
 * Get AiEditor AI configuration (synchronous)
 *
 * Note: Currently returns empty config because AiEditor's AI features require directly exposing the API Key
 * The PDF reader's AI features use a server-side proxy and are not affected
 */
export function getAiEditorConfig(): Partial<AiEditorOptions> {
  // AiEditor's built-in AI features are currently disabled
  // Requires client-side API Key, which is insecure
  console.warn('[AiEditor] Built-in AI features are disabled for security. Use the PDF reader AI features instead.');
  return {};
}

/**
 * Get AiEditor AI configuration (asynchronous)
 */
export async function getAiEditorConfigAsync(): Promise<Partial<AiEditorOptions>> {
  // Same as above, returns empty config
  return {};
}

/**
 * Get AI model information
 */
export function getAiModelInfo() {
  return {
    baseUrl: '/api/ai', // Uses server-side proxy
    model: 'default',
    hasApiKey: _aiEnabled === true,
  };
}

/**
 * Check if AI features are available (synchronous)
 */
export function isAiEnabled(): boolean {
  return _aiEnabled === true;
}

/**
 * Check if AI features are available (asynchronous)
 */
export async function isAiEnabledAsync(): Promise<boolean> {
  return checkAiAvailability();
}

/**
 * Preload configuration
 */
export async function preloadAiConfig(): Promise<void> {
  await checkAiAvailability();
}
