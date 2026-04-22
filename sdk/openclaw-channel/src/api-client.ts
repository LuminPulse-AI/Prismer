const DEFAULT_BASE_URL = "http://localhost:3000";

export async function prismerFetch(
  apiKey: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string>;
    baseUrl?: string;
  } = {},
): Promise<unknown> {
  const base = options.baseUrl || DEFAULT_BASE_URL;
  const url = new URL(path, base);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
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
