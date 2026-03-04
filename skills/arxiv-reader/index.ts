/**
 * arxiv-reader — Read and analyze arXiv papers from the workspace.
 *
 * Wraps the container's arXiv server (port 8082) which uses the
 * arxiv-to-prompt library to download, flatten, and cache paper source.
 */

import * as http from 'http';

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

// ============================================================
// HTTP Helper
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
            reject(new Error(`Invalid JSON response from arXiv server`));
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

// ============================================================
// Tool Implementations
// ============================================================

async function arxivFetch(params: {
  arxiv_id: string;
  remove_comments?: boolean;
  remove_appendix?: boolean;
  figure_paths?: boolean;
}): Promise<{ content: string; arxiv_id: string; cached: boolean }> {
  const { arxiv_id, remove_comments = true, remove_appendix = false, figure_paths = false } = params;

  if (!arxiv_id) throw new Error('arxiv_id is required');

  return postJSON(`${ARXIV_SERVICE_URL}/convert`, {
    arxiv_id,
    remove_comments,
    remove_appendix,
    figure_paths,
  });
}

async function arxivSections(params: {
  arxiv_id: string;
}): Promise<{ arxiv_id: string; sections: string[] }> {
  const { arxiv_id } = params;

  if (!arxiv_id) throw new Error('arxiv_id is required');

  return postJSON(`${ARXIV_SERVICE_URL}/sections`, { arxiv_id });
}

async function arxivAbstract(params: {
  arxiv_id: string;
}): Promise<{ arxiv_id: string; abstract: string }> {
  const { arxiv_id } = params;

  if (!arxiv_id) throw new Error('arxiv_id is required');

  return postJSON(`${ARXIV_SERVICE_URL}/abstract`, { arxiv_id });
}

// ============================================================
// Skill Export
// ============================================================

export const arxivReaderSkill: Skill = {
  name: 'arxiv-reader',
  description: 'Read and analyze arXiv papers by fetching LaTeX source, listing sections, or extracting abstracts',
  version: '1.0.0',

  tools: [
    {
      name: 'arxiv_fetch',
      description: 'Fetch the full flattened LaTeX source of an arXiv paper, ready for LLM analysis',
      parameters: {
        arxiv_id: {
          type: 'string',
          description: "arXiv paper ID (e.g. '2301.00001' or '2301.00001v2')",
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
          description: 'Replace figure content with file paths only (default: false)',
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
    console.log('[arxiv-reader] Initialized arXiv reader skill');
  },
};

export default arxivReaderSkill;
