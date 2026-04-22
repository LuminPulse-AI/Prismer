const BASE_URL = process.env.PRISMER_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.PRISMER_API_KEY || '';

export function getApiKey(): string {
  return API_KEY;
}

export async function prismerFetch(
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {}
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const response = await fetch(url.toString(), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json.error?.message || json.message || text;
    } catch {
      message = text;
    }
    throw new Error(`Prismer API ${response.status}: ${message}`);
  }

  return response.json();
}
