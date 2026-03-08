/// <reference types="node" />
/**
 * arxiv-reader — Read and analyze arXiv papers from the workspace.
 *
 * Standalone mode: fetches directly from arXiv using Node.js built-ins.
 * Container mode: delegates to the arXiv server (port 8082) if available.
 */

import * as https from 'https';
import * as http from 'http';
import * as zlib from 'zlib';
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

// ============================================================
// Constants
// ============================================================

const ARXIV_SERVICE_URL =
  process.env.ARXIV_SERVICE_URL || 'http://127.0.0.1:8082';
const CACHE_DIR =
  process.env.ARXIV_CACHE_DIR ||
  path.join(os.homedir(), '.cache', 'arxiv-reader');

// ============================================================
// Container-mode HTTP helper (fallback)
// ============================================================

function postJSON(url: string, body: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 120_000,
      },
      (res) => {
        let chunks = '';
        res.on('data', (chunk) => (chunks += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(chunks);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(json.error || `HTTP ${res.statusCode}`));
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error('Invalid JSON response from arXiv server'));
          }
        });
      },
    );

    req.on('error', (err) =>
      reject(new Error(`arXiv server unreachable: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('arXiv server request timed out (120s)'));
    });
    req.write(data);
    req.end();
  });
}

/** Check if the container arXiv server is reachable. */
async function isServerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const parsed = new URL(`${ARXIV_SERVICE_URL}/health`);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'GET',
        timeout: 2_000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// ============================================================
// Standalone arXiv fetcher (no Python dependency)
// ============================================================

/** Download a URL, following redirects (up to 5). */
function download(url: string, maxRedirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 120_000 }, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(download(res.headers.location, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Gunzip a buffer. Returns original buffer if not gzipped. */
function tryGunzip(buf: Buffer): Buffer {
  // gzip magic number: 1f 8b
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return zlib.gunzipSync(buf);
  }
  return buf;
}

/** Parse a tar archive and return a map of filename -> content. */
function parseTar(buf: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let offset = 0;

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);

    // Empty block means end of archive
    if (header.every((b) => b === 0)) break;

    // Extract filename (bytes 0-99, null-terminated)
    const nameEnd = header.indexOf(0, 0);
    const name = header.subarray(0, Math.min(nameEnd, 100)).toString('utf-8');

    // Extract file size (bytes 124-135, octal ASCII)
    const sizeStr = header.subarray(124, 136).toString('utf-8').trim();
    const size = parseInt(sizeStr, 8) || 0;

    // Type flag (byte 156): '0' or '\0' = regular file
    const typeFlag = header[156];
    const isFile = typeFlag === 0 || typeFlag === 48; // 48 = '0'

    offset += 512; // skip header

    if (isFile && size > 0 && name) {
      const content = buf.subarray(offset, offset + size).toString('utf-8');
      files.set(name, content);
    }

    // Advance past data blocks (padded to 512)
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

/** Find the main .tex file (the one containing \documentclass). */
function findMainTex(files: Map<string, string>): string | null {
  // Priority: files with \documentclass
  for (const [name, content] of files) {
    if (name.endsWith('.tex') && /\\documentclass/i.test(content)) {
      return name;
    }
  }
  // Fallback: any .tex file
  for (const name of files.keys()) {
    if (name.endsWith('.tex')) return name;
  }
  return null;
}

/** Resolve \input{} and \include{} directives recursively. */
function flattenLatex(
  mainFile: string,
  files: Map<string, string>,
  visited = new Set<string>(),
): string {
  if (visited.has(mainFile)) return '';
  visited.add(mainFile);

  let content = files.get(mainFile) || '';
  const dir = path.dirname(mainFile);

  // Replace \input{file} and \include{file}
  content = content.replace(
    /\\(?:input|include)\s*\{([^}]+)\}/g,
    (_match, ref: string) => {
      // Try exact path, then with .tex extension
      const candidates = [
        path.join(dir, ref),
        path.join(dir, ref + '.tex'),
        ref,
        ref + '.tex',
      ];
      for (const candidate of candidates) {
        if (files.has(candidate)) {
          return flattenLatex(candidate, files, visited);
        }
      }
      return `% [arxiv-reader] Could not resolve: ${ref}`;
    },
  );

  return content;
}

/** Strip LaTeX comments (lines starting with % and inline %). */
function stripComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      // Keep lines that are just %
      if (line.trim() === '%') return line;
      // Remove inline comments (not escaped \%)
      return line.replace(/(?<!\\)%.*$/, '').trimEnd();
    })
    .filter((line, i, arr) => {
      // Remove consecutive blank lines
      if (line === '' && i > 0 && arr[i - 1] === '') return false;
      return true;
    })
    .join('\n');
}

/** Remove appendix sections. */
function stripAppendix(content: string): string {
  const idx = content.search(/\\appendix\b|\\begin\s*\{appendix\}/);
  if (idx === -1) return content;
  // Keep everything up to \appendix, plus \end{document}
  const before = content.substring(0, idx);
  const endDoc = content.match(/\\end\s*\{document\}/);
  return before + (endDoc ? '\n' + endDoc[0] + '\n' : '');
}

/** Replace figure environments with just the file path. */
function stripFigures(content: string): string {
  return content.replace(
    /\\begin\s*\{figure\*?\}[\s\S]*?\\end\s*\{figure\*?\}/g,
    (match) => {
      const pathMatch = match.match(
        /\\includegraphics(?:\[[^\]]*\])?\s*\{([^}]+)\}/,
      );
      return pathMatch
        ? `% [figure: ${pathMatch[1]}]`
        : '% [figure removed]';
    },
  );
}

/** Extract section headings from LaTeX. */
function extractSections(content: string): string[] {
  const sections: string[] = [];
  const re = /\\(section|subsection|subsubsection)\*?\s*\{([^}]+)\}/g;
  let match;
  while ((match = re.exec(content))) {
    const level = match[1];
    const title = match[2].replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').trim();
    const indent =
      level === 'section' ? '' : level === 'subsection' ? '  ' : '    ';
    sections.push(`${indent}${title}`);
  }
  return sections;
}

/** Extract abstract from LaTeX. */
function extractAbstract(content: string): string {
  const match = content.match(
    /\\begin\s*\{abstract\}([\s\S]*?)\\end\s*\{abstract\}/,
  );
  if (match) return match[1].trim();

  // Try \abstract{...} form
  const match2 = content.match(/\\abstract\s*\{([\s\S]*?)\}/);
  if (match2) return match2[1].trim();

  return '';
}

/** Get cached content or null. */
function getCached(arxivId: string, suffix: string): string | null {
  const cachePath = path.join(CACHE_DIR, `${arxivId.replace('/', '_')}_${suffix}.txt`);
  try {
    return fs.readFileSync(cachePath, 'utf-8');
  } catch {
    return null;
  }
}

/** Write to cache. */
function setCache(arxivId: string, suffix: string, content: string): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const cachePath = path.join(CACHE_DIR, `${arxivId.replace('/', '_')}_${suffix}.txt`);
    fs.writeFileSync(cachePath, content, 'utf-8');
  } catch {
    // Cache write failure is non-fatal
  }
}

/** Fetch and process an arXiv paper's LaTeX source (standalone). */
async function fetchStandalone(arxivId: string): Promise<Map<string, string>> {
  const url = `https://arxiv.org/e-print/${arxivId}`;
  const raw = await download(url);
  const decompressed = tryGunzip(raw);

  // Check if it's a tar archive (starts with a valid tar header)
  // or just a single file
  if (decompressed.length >= 512 && decompressed[257] === 0x75) {
    // 'u' from "ustar" — it's a tar
    return parseTar(decompressed);
  }

  // Single file — treat as main.tex
  const content = decompressed.toString('utf-8');
  const files = new Map<string, string>();
  files.set('main.tex', content);
  return files;
}

/** Full pipeline: download, flatten, process. */
async function processArxiv(
  arxivId: string,
  opts: {
    removeComments?: boolean;
    removeAppendix?: boolean;
    figurePaths?: boolean;
  } = {},
): Promise<string> {
  const files = await fetchStandalone(arxivId);
  const mainFile = findMainTex(files);
  if (!mainFile) {
    throw new Error(`No .tex file found in arXiv paper ${arxivId}`);
  }

  let content = flattenLatex(mainFile, files);

  if (opts.removeComments !== false) {
    content = stripComments(content);
  }
  if (opts.removeAppendix) {
    content = stripAppendix(content);
  }
  if (opts.figurePaths) {
    content = stripFigures(content);
  }

  return content;
}

// ============================================================
// Tool Implementations (with server fallback)
// ============================================================

async function arxivFetch(params: {
  arxiv_id: string;
  remove_comments?: boolean;
  remove_appendix?: boolean;
  figure_paths?: boolean;
}): Promise<{ content: string; arxiv_id: string; cached: boolean }> {
  const {
    arxiv_id,
    remove_comments = true,
    remove_appendix = false,
    figure_paths = false,
  } = params;

  if (!arxiv_id) throw new Error('arxiv_id is required');

  // Try container server first
  if (await isServerAvailable()) {
    return postJSON(`${ARXIV_SERVICE_URL}/convert`, {
      arxiv_id,
      remove_comments,
      remove_appendix,
      figure_paths,
    });
  }

  // Standalone mode
  const cacheKey = `full_${remove_comments}_${remove_appendix}_${figure_paths}`;
  const cached = getCached(arxiv_id, cacheKey);
  if (cached) {
    return { content: cached, arxiv_id, cached: true };
  }

  const content = await processArxiv(arxiv_id, {
    removeComments: remove_comments,
    removeAppendix: remove_appendix,
    figurePaths: figure_paths,
  });

  setCache(arxiv_id, cacheKey, content);
  return { content, arxiv_id, cached: false };
}

async function arxivSections(params: {
  arxiv_id: string;
}): Promise<{ arxiv_id: string; sections: string[] }> {
  const { arxiv_id } = params;

  if (!arxiv_id) throw new Error('arxiv_id is required');

  // Try container server first
  if (await isServerAvailable()) {
    return postJSON(`${ARXIV_SERVICE_URL}/sections`, { arxiv_id });
  }

  // Standalone mode
  const cached = getCached(arxiv_id, 'full_true_false_false');
  let content: string;
  if (cached) {
    content = cached;
  } else {
    content = await processArxiv(arxiv_id, { removeComments: true });
    setCache(arxiv_id, 'full_true_false_false', content);
  }

  return { arxiv_id, sections: extractSections(content) };
}

async function arxivAbstract(params: {
  arxiv_id: string;
}): Promise<{ arxiv_id: string; abstract: string }> {
  const { arxiv_id } = params;

  if (!arxiv_id) throw new Error('arxiv_id is required');

  // Try container server first
  if (await isServerAvailable()) {
    return postJSON(`${ARXIV_SERVICE_URL}/abstract`, { arxiv_id });
  }

  // Standalone: try arXiv Atom API first (faster than downloading full source)
  try {
    const apiUrl = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxiv_id)}`;
    const xml = (await download(apiUrl)).toString('utf-8');
    const match = xml.match(/<summary>([\s\S]*?)<\/summary>/);
    if (match) {
      const abstract = match[1].trim().replace(/\s+/g, ' ');
      return { arxiv_id, abstract };
    }
  } catch {
    // Fall through to source extraction
  }

  // Fallback: extract from LaTeX source
  const cached = getCached(arxiv_id, 'full_true_false_false');
  let content: string;
  if (cached) {
    content = cached;
  } else {
    content = await processArxiv(arxiv_id, { removeComments: true });
    setCache(arxiv_id, 'full_true_false_false', content);
  }

  return { arxiv_id, abstract: extractAbstract(content) };
}

// ============================================================
// Skill Export
// ============================================================

export const arxivReaderSkill: Skill = {
  name: 'arxiv-reader',
  description:
    'Read and analyze arXiv papers by fetching LaTeX source, listing sections, or extracting abstracts',
  version: '1.0.0',

  tools: [
    {
      name: 'arxiv_fetch',
      description:
        'Fetch the full flattened LaTeX source of an arXiv paper, ready for LLM analysis',
      parameters: {
        arxiv_id: {
          type: 'string',
          description:
            "arXiv paper ID (e.g. '2301.00001' or '2301.00001v2')",
          required: true,
        },
        remove_comments: {
          type: 'boolean',
          description: 'Strip LaTeX comments from source (default: true)',
          required: false,
        },
        remove_appendix: {
          type: 'boolean',
          description: 'Remove appendix sections (default: false)',
          required: false,
        },
        figure_paths: {
          type: 'boolean',
          description:
            'Replace figure content with file paths only (default: false)',
          required: false,
        },
      },
      execute: arxivFetch,
    },
    {
      name: 'arxiv_sections',
      description: 'List all sections and subsections of an arXiv paper',
      parameters: {
        arxiv_id: {
          type: 'string',
          description: "arXiv paper ID (e.g. '2301.00001')",
          required: true,
        },
      },
      execute: arxivSections,
    },
    {
      name: 'arxiv_abstract',
      description: 'Extract just the abstract from an arXiv paper',
      parameters: {
        arxiv_id: {
          type: 'string',
          description: "arXiv paper ID (e.g. '2301.00001')",
          required: true,
        },
      },
      execute: arxivAbstract,
    },
  ],

  initialize: async () => {
    const serverUp = await isServerAvailable();
    console.log(
      `[arxiv-reader] Initialized (mode: ${serverUp ? 'container' : 'standalone'})`,
    );
  },
};

export default arxivReaderSkill;
