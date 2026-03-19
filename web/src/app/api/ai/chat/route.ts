/**
 * POST /api/ai/chat
 *
 * Server-side proxy to the configured LLM provider.
 * Provider selection priority:
 *   1. Novita AI  (NOVITA_API_KEY)
 *   2. OpenAI / custom OpenAI-compatible  (OPENAI_API_KEY + optional OPENAI_API_BASE_URL)
 *
 * Accepts an OpenAI-compatible request body and proxies it verbatim.
 * Supports both streaming (SSE) and non-streaming responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNovitaProviderConfig, NOVITA_DEFAULT_MODEL } from '@/lib/llm/providers/novita';
import type { ProviderConfig } from '@/lib/llm/types';

// ----------------------------------------------------------------
// Provider resolution
// ----------------------------------------------------------------

function resolveProvider(): ProviderConfig | null {
  // 1. Novita AI
  const novita = getNovitaProviderConfig();
  if (novita) return novita;

  // 2. OpenAI / custom OpenAI-compatible
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY || process.env.AI_API_KEY;
  if (apiKey) {
    return {
      provider: 'openai',
      apiKey,
      baseUrl: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
      defaultModel: process.env.AGENT_DEFAULT_MODEL || 'gpt-4o',
      enabled: true,
    };
  }

  return null;
}

// ----------------------------------------------------------------
// Route handler
// ----------------------------------------------------------------

export async function POST(req: NextRequest) {
  const provider = resolveProvider();

  if (!provider) {
    return NextResponse.json(
      { error: 'No LLM provider configured. Set NOVITA_API_KEY or OPENAI_API_KEY.' },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Resolve 'default' model to provider's default
  if (body.model === 'default' || !body.model) {
    body = {
      ...body,
      model: provider.defaultModel ?? (provider.provider === 'novita' ? NOVITA_DEFAULT_MODEL : 'gpt-4o'),
    };
  }

  const upstream = `${provider.baseUrl}/chat/completions`;

  const upstreamRes = await fetch(upstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text().catch(() => '');
    return NextResponse.json(
      { error: `Provider error (${upstreamRes.status})`, details: text },
      { status: upstreamRes.status }
    );
  }

  // Streaming: pipe SSE straight through
  if (body.stream === true) {
    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // Non-streaming: return JSON
  const data = await upstreamRes.json();
  return NextResponse.json(data);
}
