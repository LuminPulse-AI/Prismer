/**
 * formal-methods — Formal verification with Lean 4, Coq, and Z3.
 *
 * Standalone mode: runs locally installed provers via subprocess.
 * Container mode: delegates to the prover server (port 8081) if available.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

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

const PROVER_SERVICE_URL =
  process.env.PROVER_SERVICE_URL || 'http://127.0.0.1:8081';
const EXEC_TIMEOUT = 60_000; // 60 seconds

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
            reject(new Error('Invalid JSON response from prover server'));
          }
        });
      },
    );

    req.on('error', (err) =>
      reject(new Error(`Prover server unreachable: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Prover server request timed out'));
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
        timeout: 5_000,
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
            reject(new Error('Invalid JSON response from prover server'));
          }
        });
      },
    );

    req.on('error', (err) =>
      reject(new Error(`Prover server unreachable: ${err.message}`)),
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Prover server request timed out'));
    });
    req.end();
  });
}

/** Check if the container prover server is reachable. */
async function isServerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const parsed = new URL(`${PROVER_SERVICE_URL}/health`);
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
// Standalone Helpers
// ============================================================

/** Check if a command is available on the system. */
function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Get version of a command. */
function getCommandVersion(cmd: string, args: string = '--version'): string {
  try {
    return execSync(`${cmd} ${args}`, {
      stdio: 'pipe',
      timeout: 5_000,
    })
      .toString()
      .trim()
      .split('\n')[0];
  } catch {
    return 'unknown';
  }
}

/** Create a temp directory and write code to a file. Returns { dir, filePath }. */
function writeTempFile(code: string, filename: string): { dir: string; filePath: string } {
  const hash = crypto.createHash('md5').update(code).digest('hex').substring(0, 12);
  const dir = path.join(os.tmpdir(), `formal-methods-${hash}`);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, code, 'utf-8');
  return { dir, filePath };
}

/** Execute a command locally and capture output. */
function execLocal(
  cmd: string,
  args: string[],
  cwd: string,
): { success: boolean; output: string; errors: string; returncode: number } {
  try {
    const result = execSync(`${cmd} ${args.join(' ')}`, {
      cwd,
      stdio: 'pipe',
      timeout: EXEC_TIMEOUT,
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      success: true,
      output: result.toString('utf-8'),
      errors: '',
      returncode: 0,
    };
  } catch (err: any) {
    return {
      success: false,
      output: err.stdout?.toString('utf-8') || '',
      errors: err.stderr?.toString('utf-8') || err.message || 'Unknown error',
      returncode: err.status ?? 1,
    };
  }
}

// ============================================================
// Tool Implementations
// ============================================================

async function leanCheck(params: {
  code: string;
  filename?: string;
}): Promise<{ success: boolean; output: string; errors: string; returncode: number }> {
  const { code, filename = 'check.lean' } = params;
  if (!code) throw new Error('code is required');

  if (await isServerAvailable()) {
    return postJSON(`${PROVER_SERVICE_URL}/lean/check`, { code, filename });
  }

  if (!isCommandAvailable('lean')) {
    throw new Error('Lean 4 is not installed locally and prover server is unavailable');
  }

  const { dir, filePath } = writeTempFile(code, filename);
  return execLocal('lean', [filePath], dir);
}

async function coqCheck(params: {
  code: string;
  filename?: string;
}): Promise<{ success: boolean; compiled: boolean; output: string; errors: string; returncode: number }> {
  const { code, filename = 'check.v' } = params;
  if (!code) throw new Error('code is required');

  if (await isServerAvailable()) {
    return postJSON(`${PROVER_SERVICE_URL}/coq/check`, { code, filename });
  }

  if (!isCommandAvailable('coqc')) {
    throw new Error('Coq is not installed locally and prover server is unavailable');
  }

  const { dir, filePath } = writeTempFile(code, filename);
  const result = execLocal('coqc', [filePath], dir);
  return { ...result, compiled: result.success };
}

async function coqCompile(params: {
  code: string;
  filename?: string;
}): Promise<{ success: boolean; compiled: boolean; output: string; errors: string; returncode: number }> {
  const { code, filename = 'compile.v' } = params;
  if (!code) throw new Error('code is required');

  if (await isServerAvailable()) {
    return postJSON(`${PROVER_SERVICE_URL}/coq/compile`, { code, filename });
  }

  if (!isCommandAvailable('coqc')) {
    throw new Error('Coq is not installed locally and prover server is unavailable');
  }

  const { dir, filePath } = writeTempFile(code, filename);
  const result = execLocal('coqc', [filePath], dir);
  return { ...result, compiled: result.success };
}

async function z3Solve(params: {
  formula?: string;
  code?: string;
  format?: string;
}): Promise<{ success: boolean; result: string; model?: string | null }> {
  const { formula, code, format = 'smt2' } = params;

  if (format === 'python') {
    if (!code) throw new Error('code is required when format is python');

    // Python Z3 only works via container
    if (await isServerAvailable()) {
      return postJSON(`${PROVER_SERVICE_URL}/z3/solve`, { code, format });
    }
    throw new Error('Z3 Python format requires the prover server (container mode)');
  }

  // SMT-LIB2 format
  if (!formula) throw new Error('formula is required when format is smt2');

  if (await isServerAvailable()) {
    return postJSON(`${PROVER_SERVICE_URL}/z3/solve`, { formula, format });
  }

  if (!isCommandAvailable('z3')) {
    throw new Error('Z3 is not installed locally and prover server is unavailable');
  }

  // Standalone: write SMT-LIB2 to file and run z3
  const { dir, filePath } = writeTempFile(formula, 'query.smt2');
  const result = execLocal('z3', [filePath], dir);
  const output = (result.output + '\n' + result.errors).trim();

  // Parse Z3 output
  const satMatch = output.match(/^(sat|unsat|unknown)/m);
  const resultStr = satMatch ? satMatch[1] : output;

  // Extract model if sat
  let model: string | null = null;
  if (resultStr === 'sat') {
    const modelMatch = output.match(/\(model[\s\S]*?\)\s*$/m);
    if (modelMatch) {
      model = modelMatch[0];
    } else {
      // Try everything after "sat"
      const afterSat = output.substring(output.indexOf('sat') + 3).trim();
      if (afterSat) model = afterSat;
    }
  }

  return { success: result.success || resultStr !== 'unknown', result: resultStr, model };
}

async function proverStatus(): Promise<{
  provers: Record<string, { available: boolean; version: string }>;
}> {
  // Try container first
  if (await isServerAvailable()) {
    return getJSON(`${PROVER_SERVICE_URL}/status`);
  }

  // Standalone: check local binaries
  const provers: Record<string, { available: boolean; version: string }> = {};

  const lean = isCommandAvailable('lean');
  provers.lean4 = {
    available: lean,
    version: lean ? getCommandVersion('lean', '--version') : 'not installed',
  };

  const coq = isCommandAvailable('coqc');
  provers.coq = {
    available: coq,
    version: coq ? getCommandVersion('coqc', '--version') : 'not installed',
  };

  const z3 = isCommandAvailable('z3');
  provers.z3 = {
    available: z3,
    version: z3 ? getCommandVersion('z3', '--version') : 'not installed',
  };

  return { provers };
}

// ============================================================
// Skill Export
// ============================================================

export const formalMethodsSkill: Skill = {
  name: 'formal-methods',
  description:
    'Formal verification with Lean 4, Coq, and Z3 SMT solver',
  version: '1.0.0',

  tools: [
    {
      name: 'lean_check',
      description: 'Type-check Lean 4 code and return the output',
      parameters: {
        code: {
          type: 'string',
          description: 'Lean 4 source code to type-check',
          required: true,
        },
        filename: {
          type: 'string',
          description: "Filename for the source (default: 'check.lean')",
          required: false,
        },
      },
      execute: leanCheck,
    },
    {
      name: 'coq_check',
      description: 'Check a Coq proof for correctness',
      parameters: {
        code: {
          type: 'string',
          description: 'Coq source code to check',
          required: true,
        },
        filename: {
          type: 'string',
          description: "Filename for the source (default: 'check.v')",
          required: false,
        },
      },
      execute: coqCheck,
    },
    {
      name: 'coq_compile',
      description: 'Compile a Coq file to a .vo object file',
      parameters: {
        code: {
          type: 'string',
          description: 'Coq source code to compile',
          required: true,
        },
        filename: {
          type: 'string',
          description: "Filename for the source (default: 'compile.v')",
          required: false,
        },
      },
      execute: coqCompile,
    },
    {
      name: 'z3_solve',
      description: 'Solve a satisfiability problem using Z3 SMT solver',
      parameters: {
        formula: {
          type: 'string',
          description: "SMT-LIB2 formula (when format is 'smt2')",
          required: false,
        },
        code: {
          type: 'string',
          description: "Z3 Python code (when format is 'python')",
          required: false,
        },
        format: {
          type: 'string',
          description: "Input format: 'smt2' or 'python' (default: 'smt2')",
          required: false,
          enum: ['smt2', 'python'],
        },
      },
      execute: z3Solve,
    },
    {
      name: 'prover_status',
      description: 'Check which formal provers are available and their versions',
      parameters: {},
      execute: proverStatus,
    },
  ],

  initialize: async () => {
    const serverUp = await isServerAvailable();
    console.log(
      `[formal-methods] Initialized (mode: ${serverUp ? 'container' : 'standalone'})`,
    );
  },
};

export default formalMethodsSkill;
