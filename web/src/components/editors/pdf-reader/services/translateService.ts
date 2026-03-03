/**
 * Translation Service
 * 
 * Uses server proxy /api/ai/translate for text translation.
 * - Does not expose API keys on the client
 * - Supports multiple target languages
 * - Local cache to reduce duplicate requests
 */

// ============================================================
// Types
// ============================================================

export type TargetLanguage = 'zh' | 'ja' | 'de' | 'fr' | 'it' | 'es';

export interface LanguageOption {
  code: TargetLanguage;
  name: string;
  nativeName: string;
}

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  targetLanguage: TargetLanguage;
  timestamp: number;
}

// ============================================================
// Constants
// ============================================================

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
];

export const DEFAULT_LANGUAGE: TargetLanguage = 'zh';

// Translation cache to avoid duplicate requests
const translationCache = new Map<string, TranslationResult>();

// AI availability status
let _aiAvailable: boolean | null = null;
let _aiCheckPromise: Promise<boolean> | null = null;

// ============================================================
// Translation Service
// ============================================================

class TranslateService {
  constructor() {
    // Check AI service availability on startup
    if (typeof window !== 'undefined') {
      this.checkAvailability();
    }
  }

  /**
   * Check if AI service is available
   */
  private async checkAvailability(): Promise<boolean> {
    if (_aiAvailable !== null) {
      return _aiAvailable;
    }

    if (_aiCheckPromise) {
      return _aiCheckPromise;
    }

    _aiCheckPromise = (async () => {
      try {
        const response = await fetch('/api/config/client');
        if (response.ok) {
          const config = await response.json();
          _aiAvailable = !!config.aiEnabled;
          return _aiAvailable;
        }
      } catch (error) {
        console.warn('[TranslateService] Failed to check AI availability:', error);
      }
      _aiAvailable = false;
      return false;
    })();

    return _aiCheckPromise;
  }

  /**
   * Get cache key
   */
  private getCacheKey(text: string, language: TargetLanguage): string {
    return `${language}:${text.slice(0, 100)}`;
  }

  /**
   * Get translation from cache
   */
  getFromCache(text: string, language: TargetLanguage): TranslationResult | null {
    const key = this.getCacheKey(text, language);
    return translationCache.get(key) || null;
  }

  /**
   * Save to cache
   */
  private saveToCache(result: TranslationResult): void {
    const key = this.getCacheKey(result.originalText, result.targetLanguage);
    translationCache.set(key, result);
    
    // Limit cache size
    if (translationCache.size > 500) {
      const firstKey = translationCache.keys().next().value;
      if (firstKey) translationCache.delete(firstKey);
    }
  }

  /**
   * Get language name
   */
  getLanguageName(code: TargetLanguage): string {
    return SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || code;
  }

  /**
   * Translate text - via server proxy
   */
  async translate(
    text: string,
    targetLanguage: TargetLanguage = DEFAULT_LANGUAGE
  ): Promise<TranslationResult> {
    // Check cache first
    const cached = this.getFromCache(text, targetLanguage);
    if (cached) {
      return cached;
    }

    // Validate
    if (!text.trim()) {
      throw new Error('Empty text');
    }

    // Translate via server proxy
    const response = await fetch('/api/ai/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        targetLanguage,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 503) {
        throw new Error('Translation service is not configured. Please contact the administrator.');
      }
      
      throw new Error(errorData.error || `Translation failed: ${response.status}`);
    }

    const result: TranslationResult = await response.json();

    // Save to cache
    this.saveToCache(result);

    return result;
  }

  /**
   * Check availability (async)
   */
  async isAvailable(): Promise<boolean> {
    return this.checkAvailability();
  }

  /**
   * Check availability synchronously (uses cached status)
   */
  isAvailableSync(): boolean {
    return _aiAvailable === true;
  }
}

// Singleton instance
export const translateService = new TranslateService();

export default translateService;
