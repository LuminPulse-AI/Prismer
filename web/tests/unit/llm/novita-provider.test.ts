import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNovitaProviderConfig, NOVITA_BASE_URL, NOVITA_DEFAULT_MODEL, NOVITA_MODELS } from '@/lib/llm/providers/novita';
import { calculateCost, MODEL_PRICING } from '@/lib/llm/types';

// Helper to set/restore env vars
function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    originals[key] = process.env[key];
    if (vars[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = vars[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

describe('getNovitaProviderConfig', () => {
  it('returns null when NOVITA_API_KEY is not set', () => {
    withEnv({ NOVITA_API_KEY: undefined }, () => {
      expect(getNovitaProviderConfig()).toBeNull();
    });
  });

  it('returns config when NOVITA_API_KEY is set', () => {
    withEnv({ NOVITA_API_KEY: 'test-key', NOVITA_DEFAULT_MODEL: undefined }, () => {
      const config = getNovitaProviderConfig();
      expect(config).not.toBeNull();
      expect(config!.provider).toBe('novita');
      expect(config!.apiKey).toBe('test-key');
      expect(config!.baseUrl).toBe(NOVITA_BASE_URL);
      expect(config!.defaultModel).toBe(NOVITA_DEFAULT_MODEL);
      expect(config!.enabled).toBe(true);
    });
  });

  it('respects NOVITA_DEFAULT_MODEL override', () => {
    withEnv({ NOVITA_API_KEY: 'test-key', NOVITA_DEFAULT_MODEL: 'deepseek/deepseek-v3.2' }, () => {
      const config = getNovitaProviderConfig();
      expect(config!.defaultModel).toBe('deepseek/deepseek-v3.2');
    });
  });
});

describe('resolveProvider', () => {
  // Import dynamically so env vars are read at call time
  let resolveProvider: typeof import('@/app/api/ai/chat/route').resolveProvider;

  beforeEach(async () => {
    const mod = await import('@/app/api/ai/chat/route');
    resolveProvider = mod.resolveProvider;
  });

  it('returns null when no provider keys are set', () => {
    withEnv({ NOVITA_API_KEY: undefined, OPENAI_API_KEY: undefined, OPENAI_APIKEY: undefined, AI_API_KEY: undefined, LLM_PROVIDER: undefined }, () => {
      expect(resolveProvider()).toBeNull();
    });
  });

  it('returns novita when only NOVITA_API_KEY is set', () => {
    withEnv({ NOVITA_API_KEY: 'nk', OPENAI_API_KEY: undefined, OPENAI_APIKEY: undefined, AI_API_KEY: undefined, LLM_PROVIDER: undefined }, () => {
      const config = resolveProvider();
      expect(config!.provider).toBe('novita');
    });
  });

  it('returns openai when only OPENAI_API_KEY is set', () => {
    withEnv({ NOVITA_API_KEY: undefined, OPENAI_API_KEY: 'ok', OPENAI_APIKEY: undefined, AI_API_KEY: undefined, LLM_PROVIDER: undefined }, () => {
      const config = resolveProvider();
      expect(config!.provider).toBe('openai');
    });
  });

  it('LLM_PROVIDER=openai overrides auto-detection even when both keys exist', () => {
    withEnv({ NOVITA_API_KEY: 'nk', OPENAI_API_KEY: 'ok', LLM_PROVIDER: 'openai' }, () => {
      const config = resolveProvider();
      expect(config!.provider).toBe('openai');
    });
  });

  it('LLM_PROVIDER=novita selects novita explicitly', () => {
    withEnv({ NOVITA_API_KEY: 'nk', OPENAI_API_KEY: 'ok', LLM_PROVIDER: 'novita' }, () => {
      const config = resolveProvider();
      expect(config!.provider).toBe('novita');
    });
  });
});

describe('MODEL_PRICING', () => {
  it('has entries for all Novita models', () => {
    for (const model of NOVITA_MODELS) {
      expect(MODEL_PRICING[model]).toBeDefined();
      expect(MODEL_PRICING[model].input).toBeGreaterThan(0);
      expect(MODEL_PRICING[model].output).toBeGreaterThan(0);
    }
  });

  it('has entry for Novita embedding model', () => {
    expect(MODEL_PRICING['qwen/qwen3-embedding-0.6b']).toBeDefined();
    expect(MODEL_PRICING['qwen/qwen3-embedding-0.6b'].input).toBeGreaterThan(0);
  });

  it('models have distinct pricing (not placeholders)', () => {
    const prices = NOVITA_MODELS.map(m => MODEL_PRICING[m]);
    const unique = new Set(prices.map(p => `${p.input}-${p.output}`));
    expect(unique.size).toBeGreaterThan(1);
  });
});

describe('calculateCost', () => {
  it('calculates cost for Novita model', () => {
    const cost = calculateCost('moonshotai/kimi-k2.5', 1_000_000, 1_000_000);
    const pricing = MODEL_PRICING['moonshotai/kimi-k2.5'];
    expect(cost).toBeCloseTo(pricing.input + pricing.output, 4);
  });

  it('falls back to default pricing for unknown model', () => {
    const cost = calculateCost('unknown-model', 1_000_000, 1_000_000);
    const pricing = MODEL_PRICING['default'];
    expect(cost).toBeCloseTo(pricing.input + pricing.output, 4);
  });
});
