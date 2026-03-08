/**
 * latex-compiler — Compile LaTeX documents to PDF from the workspace.
 *
 * Wraps the container's LaTeX server (port 8080) which provides
 * pdflatex, xelatex, lualatex compilation with bibliography support.
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

const LATEX_SERVICE_URL =
  process.env.LATEX_SERVICE_URL || 'http://127.0.0.1:8080';

// ============================================================
// HTTP Helpers
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
            reject(new Error('Invalid JSON response from LaTeX server'));
          }
        });
      },
    );

    req.on('error', (err) =>
      reject(new Error(`LaTeX server unreachable: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LaTeX server request timed out (120s)'));
    });
    req.write(data);
    req.end();
  });
}

function getJSON(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'GET',
        timeout: 10_000,
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
            reject(new Error('Invalid JSON response from LaTeX server'));
          }
        });
      },
    );

    req.on('error', (err) =>
      reject(new Error(`LaTeX server unreachable: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LaTeX server request timed out'));
    });
    req.end();
  });
}

// ============================================================
// Tool Implementations
// ============================================================

async function latexCompile(params: {
  content: string;
  filename?: string;
  engine?: string;
  bibliography?: string;
  runs?: number;
}): Promise<Record<string, unknown>> {
  const { content, filename, engine, bibliography, runs } = params;

  if (!content) throw new Error('content is required');

  const body: Record<string, unknown> = { content };
  if (filename) body.filename = filename;
  if (engine) body.engine = engine;
  if (bibliography) body.bibliography = bibliography;
  if (runs !== undefined) body.runs = runs;

  return postJSON(`${LATEX_SERVICE_URL}/compile`, body);
}

async function latexPreview(params: {
  content: string;
  filename?: string;
  engine?: string;
  bibliography?: string;
}): Promise<Record<string, unknown>> {
  const { content, filename, engine, bibliography } = params;

  if (!content) throw new Error('content is required');

  const body: Record<string, unknown> = { content };
  if (filename) body.filename = filename;
  if (engine) body.engine = engine;
  if (bibliography) body.bibliography = bibliography;

  return postJSON(`${LATEX_SERVICE_URL}/preview`, body);
}

async function latexTemplates(): Promise<{ templates: string[]; engines: string[] }> {
  return getJSON(`${LATEX_SERVICE_URL}/templates`);
}

async function latexGetTemplate(params: {
  name: string;
}): Promise<{ name: string; content: string }> {
  const { name } = params;

  if (!name) throw new Error('name is required');

  return getJSON(`${LATEX_SERVICE_URL}/template/${encodeURIComponent(name)}`);
}

// ============================================================
// Skill Export
// ============================================================

export const latexCompilerSkill: Skill = {
  name: 'latex-compiler',
  description: 'Compile LaTeX documents to PDF using pdflatex, xelatex, or lualatex with template support',
  version: '1.0.0',

  tools: [
    {
      name: 'latex_compile',
      description: 'Compile LaTeX source to PDF. Returns the container PDF path, log, errors, and warnings.',
      parameters: {
        content: {
          type: 'string',
          description: 'Full LaTeX source code to compile',
          required: true,
        },
        filename: {
          type: 'string',
          description: "Output filename stem (default: 'document')",
          required: false,
        },
        engine: {
          type: 'string',
          description: 'LaTeX engine to use',
          required: false,
          enum: ['pdflatex', 'xelatex', 'lualatex'],
        },
        bibliography: {
          type: 'string',
          description: 'BibTeX/BibLaTeX bibliography content (triggers biber run)',
          required: false,
        },
        runs: {
          type: 'number',
          description: 'Number of compilation passes (default: 2)',
          required: false,
        },
      },
      execute: latexCompile,
    },
    {
      name: 'latex_preview',
      description: 'Compile LaTeX source and return the PDF as base64 for inline preview.',
      parameters: {
        content: {
          type: 'string',
          description: 'Full LaTeX source code to compile',
          required: true,
        },
        filename: {
          type: 'string',
          description: "Output filename stem (default: 'document')",
          required: false,
        },
        engine: {
          type: 'string',
          description: 'LaTeX engine to use',
          required: false,
          enum: ['pdflatex', 'xelatex', 'lualatex'],
        },
        bibliography: {
          type: 'string',
          description: 'BibTeX/BibLaTeX bibliography content (triggers biber run)',
          required: false,
        },
      },
      execute: latexPreview,
    },
    {
      name: 'latex_templates',
      description: 'List available LaTeX templates and supported engines',
      parameters: {},
      execute: latexTemplates,
    },
    {
      name: 'latex_get_template',
      description: 'Get the LaTeX source of a starter template',
      parameters: {
        name: {
          type: 'string',
          description: "Template name (e.g. 'article', 'beamer', 'ieee', 'article-zh')",
          required: true,
          enum: ['article', 'article-zh', 'beamer', 'ieee'],
        },
      },
      execute: latexGetTemplate,
    },
  ],

  initialize: async () => {
    console.log('[latex-compiler] Initialized LaTeX compiler skill');
  },
};

export default latexCompilerSkill;
