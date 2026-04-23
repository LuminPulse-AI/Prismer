import type { PageDetection } from '@/types/paperContext';

export function normalizeDetectionsPayload(input: unknown): PageDetection[] {
  if (Array.isArray(input)) {
    return input as PageDetection[];
  }

  if (
    input &&
    typeof input === 'object' &&
    'pages' in input &&
    Array.isArray((input as { pages?: unknown }).pages)
  ) {
    return (input as { pages: PageDetection[] }).pages;
  }

  return [];
}
