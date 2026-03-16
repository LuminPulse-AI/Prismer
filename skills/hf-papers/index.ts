/// <reference types="node" />
/**
 * hf-papers — Browse, search, and analyze papers from Hugging Face Papers.
 *
 * Uses the public HF Papers API. No authentication required.
 */

import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ============================================================
// Types
// ============================================================

interface Skill {
  name: string;
  description: string;
  version?: string;
  tools: SkillToolDef[];
  initialize?: () => Promise<void>;
}

interface SkillToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: any) => Promise<unknown>;
}

interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: unknown;
}

interface HFAuthor {
  _id: string;
  name: string;
  hidden: boolean;
}

interface HFOrganization {
  _id: string;
  name: string;
  fullname: string;
  avatar?: string;
}

interface HFPaper {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  submittedOnDailyAt?: string;
  upvotes: number;
  numComments?: number;
  authors: HFAuthor[];
  githubRepo?: string;
  githubStars?: number;
  projectPage?: string;
  ai_summary?: string;
  ai_keywords?: string[];
  organization?: HFOrganization;
  discussionId?: string;
  mediaUrls?: string[];
}

interface HFComment {
  _id: string;
  content: string;
  author: { name: string; fullname?: string };
  createdAt: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ============================================================
// Constants
// ============================================================

const HF_API_BASE = 'https://huggingface.co/api';
const CACHE_DIR =
  process.env.HF_PAPERS_CACHE_DIR ||
  path.join(os.homedir(), '.cache', 'hf-papers');

/** Cache TTL in ms */
const TTL_SHORT = 15 * 60 * 1000; // 15 min for daily/search
const TTL_LONG = 60 * 60 * 1000; // 1 hour for details/comments

// ============================================================
// HTTP helper
// ============================================================

function fetchJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 30_000 }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return resolve(fetchJSON(res.headers.location));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        let chunks = '';
        res.on('data', (chunk) => (chunks += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(chunks));
          } catch {
            reject(new Error('Invalid JSON response from HF API'));
          }
        });
        res.on('error', reject);
      })
      .on('error', (err) =>
        reject(new Error(`HF API unreachable: ${err.message}`)),
      )
      .on('timeout', function (this: any) {
        this.destroy();
        reject(new Error('HF API request timed out (30s)'));
      });
  });
}

// ============================================================
// Cache helpers
// ============================================================

function getCacheDir(): string {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return CACHE_DIR;
}

function cacheKey(prefix: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getCacheDir(), `${prefix}_${safe}.json`);
}

function getCache<T>(prefix: string, key: string, ttl: number): T | null {
  const filepath = cacheKey(prefix, key);
  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp < ttl) {
      return entry.data;
    }
  } catch {
    // Cache miss
  }
  return null;
}

function setCache<T>(prefix: string, key: string, data: T): void {
  try {
    const filepath = cacheKey(prefix, key);
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    fs.writeFileSync(filepath, JSON.stringify(entry), 'utf-8');
  } catch {
    // Cache write failure is non-fatal
  }
}

// ============================================================
// Paper formatting helpers
// ============================================================

function formatPaper(p: HFPaper) {
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    authors: p.authors?.filter((a) => !a.hidden).map((a) => a.name) ?? [],
    publishedAt: p.publishedAt,
    upvotes: p.upvotes ?? 0,
    numComments: p.numComments,
    githubRepo: p.githubRepo || undefined,
    githubStars: p.githubStars || undefined,
    projectPage: p.projectPage || undefined,
    ai_summary: p.ai_summary || undefined,
    ai_keywords: p.ai_keywords || undefined,
    organization: p.organization
      ? { name: p.organization.name, fullname: p.organization.fullname }
      : undefined,
  };
}

// ============================================================
// Tool implementations
// ============================================================

async function hfDailyPapers(params: {
  limit?: number;
  sort?: 'upvotes' | 'date';
}): Promise<{ papers: any[]; count: number }> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const sort = params.sort ?? 'upvotes';

  const cacheId = `${sort}_${limit}`;
  const cached = getCache<{ papers: any[]; count: number }>(
    'daily',
    cacheId,
    TTL_SHORT,
  );
  if (cached) return cached;

  const raw: HFPaper[] = await fetchJSON(`${HF_API_BASE}/daily_papers`);

  let papers = raw.map(formatPaper);

  if (sort === 'upvotes') {
    papers.sort((a, b) => b.upvotes - a.upvotes);
  } else {
    papers.sort(
      (a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
  }

  papers = papers.slice(0, limit);

  const result = { papers, count: papers.length };
  setCache('daily', cacheId, result);
  return result;
}

async function hfSearchPapers(params: {
  query: string;
}): Promise<{ papers: any[]; query: string; count: number }> {
  const { query } = params;
  if (!query) throw new Error('query is required');

  const cached = getCache<{ papers: any[]; query: string; count: number }>(
    'search',
    query,
    TTL_SHORT,
  );
  if (cached) return cached;

  const url = `${HF_API_BASE}/papers?q=${encodeURIComponent(query)}`;
  const raw: HFPaper[] = await fetchJSON(url);

  const papers = raw.map(formatPaper);
  const result = { papers, query, count: papers.length };
  setCache('search', query, result);
  return result;
}

async function hfPaperDetail(params: {
  paper_id: string;
}): Promise<any> {
  const { paper_id } = params;
  if (!paper_id) throw new Error('paper_id is required');

  const cached = getCache<any>('detail', paper_id, TTL_LONG);
  if (cached) return cached;

  const raw: HFPaper = await fetchJSON(
    `${HF_API_BASE}/papers/${encodeURIComponent(paper_id)}`,
  );

  const result = formatPaper(raw);
  setCache('detail', paper_id, result);
  return result;
}

async function hfPaperComments(params: {
  paper_id: string;
}): Promise<{ paper_id: string; comments: any[]; count: number }> {
  const { paper_id } = params;
  if (!paper_id) throw new Error('paper_id is required');

  const cached = getCache<{ paper_id: string; comments: any[]; count: number }>(
    'comments',
    paper_id,
    TTL_LONG,
  );
  if (cached) return cached;

  // HF discussion API: /api/papers/{id}/discussions to get the discussion,
  // then fetch comments from discussion endpoint
  let comments: any[] = [];

  try {
    const discussions: any[] = await fetchJSON(
      `${HF_API_BASE}/papers/${encodeURIComponent(paper_id)}/discussions`,
    );

    // Collect comments from all discussion threads
    for (const discussion of discussions) {
      if (discussion.events) {
        for (const event of discussion.events) {
          if (event.type === 'comment' && event.data?.latest?.raw) {
            comments.push({
              author: event.author?.name ?? 'anonymous',
              content: event.data.latest.raw,
              createdAt: event.createdAt,
            });
          }
        }
      }
    }
  } catch {
    // Discussion API might have a different structure; try alternate path
    try {
      const data: any = await fetchJSON(
        `${HF_API_BASE}/papers/${encodeURIComponent(paper_id)}/comments`,
      );
      if (Array.isArray(data)) {
        comments = data.map((c: any) => ({
          author: c.author?.name ?? c.user?.name ?? 'anonymous',
          content: c.content ?? c.text ?? '',
          createdAt: c.createdAt ?? c.created_at ?? '',
        }));
      }
    } catch {
      // No comments available
    }
  }

  const result = { paper_id, comments, count: comments.length };
  setCache('comments', paper_id, result);
  return result;
}

// ============================================================
// Skill Export
// ============================================================

export const hfPapersSkill: Skill = {
  name: 'hf-papers',
  description:
    'Browse trending papers, search by keyword, and get paper details from Hugging Face Papers',
  version: '1.0.0',

  tools: [
    {
      name: 'hf_daily_papers',
      description: "Get today's trending papers from Hugging Face",
      parameters: {
        limit: {
          type: 'number',
          description: 'Max papers to return (default: 20, max: 100)',
          required: false,
        },
        sort: {
          type: 'string',
          description: "Sort by 'upvotes' or 'date' (default: 'upvotes')",
          required: false,
          enum: ['upvotes', 'date'],
        },
      },
      execute: hfDailyPapers,
    },
    {
      name: 'hf_search_papers',
      description: 'Search Hugging Face Papers by keyword',
      parameters: {
        query: {
          type: 'string',
          description: 'Search query',
          required: true,
        },
      },
      execute: hfSearchPapers,
    },
    {
      name: 'hf_paper_detail',
      description: 'Get detailed metadata for a specific paper',
      parameters: {
        paper_id: {
          type: 'string',
          description: "Paper ID / arXiv ID (e.g. '2401.12345')",
          required: true,
        },
      },
      execute: hfPaperDetail,
    },
    {
      name: 'hf_paper_comments',
      description: 'Get discussion comments for a paper',
      parameters: {
        paper_id: {
          type: 'string',
          description: "Paper ID / arXiv ID (e.g. '2401.12345')",
          required: true,
        },
      },
      execute: hfPaperComments,
    },
  ],

  initialize: async () => {
    console.log('[hf-papers] Initialized');
  },
};

export default hfPapersSkill;
