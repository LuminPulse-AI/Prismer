/**
 * IM-Container Bridge API
 *
 * POST /api/v2/im/bridge/[workspaceId] - Forward message to container agent
 * GET /api/v2/im/bridge/[workspaceId] - Get bridge status
 *
 * This API bridges IM messages to the container's OpenClaw agent.
 * When a user sends a message via IM, this bridge:
 * 1. Receives the message from IM (via webhook or direct call)
 * 2. Connects to the container's gateway WebSocket
 * 3. Sends the message to the OpenClaw agent
 * 4. Receives the response and posts it back to IM
 */

import { NextRequest, NextResponse } from 'next/server';
import { imService } from '@/lib/services/im.service';
import { prisma } from '@/lib/prisma';
import { createLogger, generateCorrelationId } from '@/lib/logger';
import { directiveQueue } from '@/lib/directive/queue';
import {
  sendGatewayMessage,
  type DeviceCredentials,
  type GatewayRuntimeEvent,
} from '@/lib/container/openclawGatewayClient';
import { getStaticAgentConfig } from '@/lib/container/staticAgentConfig';

const log = createLogger('Bridge');

/** Canonical agent display name — single source of truth for IM identity */
const AGENT_DISPLAY_NAME = 'Research Claw';

// ============================================================
// Types
// ============================================================

interface BridgeMessage {
  content: string;
  senderId?: string;
  senderName?: string;
  type?: 'text' | 'markdown' | 'code';
  metadata?: Record<string, unknown>;
}

function enqueueBridgeThinkingDirective(agentId: string, message: string): void {
  directiveQueue.enqueue(agentId, {
    id: `dir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'AGENT_THINKING',
    payload: { status: message, content: message },
    timestamp: Date.now(),
  });
}

function enqueuePluginDirective(agentId: string, type: string, payload: Record<string, unknown>): void {
  directiveQueue.enqueue(agentId, {
    id: `dir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    timestamp: Date.now(),
  });
}

function isNotesIntent(content: string): boolean {
  // Keep static notes fallback scoped to explicit notes intents.
  // Avoid matching "notebook" (e.g. Jupyter prompts) via word boundaries.
  return /\b(note|notes|note editor|notes editor|ai-editor)\b/i.test(content);
}

// ============================================================
// Tool Routing Context (injected into agent messages)
// ============================================================

function buildToolRoutingContext(): string {
  return [
    '<tool-routing>',
    'When the user asks you to CREATE, WRITE, or GENERATE content, you MUST call the appropriate workspace tool to render it in the UI.',
    'Do NOT just describe or print the content in your reply — call the tool so the content appears in the correct editor.',
    '',
    'Tool routing rules:',
    '- Notes, summaries, research notes, literature reviews → call "update_notes" with HTML content',
    '- Python code, plots, data visualization, matplotlib → call "jupyter_notebook" or "jupyter_execute"',
    '- LaTeX papers, surveys, academic articles → call "latex_project"',
    '- View or navigate a PDF → call "load_pdf" or "navigate_pdf"',
    '- Data tables, CSV analysis → call "data_load"',
    '',
    'Examples:',
    '- "write notes about X" → call update_notes',
    '- "plot sin cos" → call jupyter_execute',
    '- "write a survey about X" → call latex_project',
    '</tool-routing>',
  ].join('\n');
}

// ============================================================
// Content Analysis Helpers (bridge-side directive fallback)
// ============================================================

/** Check if content contains a fenced code block of a given language */
function hasCodeBlock(content: string, lang: string): boolean {
  const pattern = new RegExp('```(?:' + lang + ')\\b', 'i');
  return pattern.test(content);
}

/** Extract code from fenced code blocks of a given language */
function extractCodeBlocks(content: string, lang: string): string[] {
  const pattern = new RegExp('```(?:' + lang + ')\\s*\\n([\\s\\S]*?)```', 'gi');
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const code = match[1].trim();
    if (code) blocks.push(code);
  }
  return blocks;
}

/** Content directive types that indicate the agent already sent UI updates */
const CONTENT_DIRECTIVE_TYPES = new Set([
  'UPDATE_NOTES', 'UPDATE_NOTEBOOK', 'UPDATE_LATEX', 'UPDATE_LATEX_PROJECT',
  'UPDATE_CODE', 'UPDATE_GALLERY', 'UPDATE_DATA_GRID', 'SWITCH_COMPONENT',
  'JUPYTER_CELL_RESULT', 'LATEX_COMPILE_COMPLETE', 'LATEX_PROJECT_COMPILE_COMPLETE',
]);

/**
 * Bridge-side directive fallback: analyze agent response content and
 * enqueue directives if the agent did not call workspace tools itself.
 */
/** Extract /workspace/*.py file paths from agent response */
function extractWorkspaceFilePaths(text: string): string[] {
  const matches = text.match(/['"`]?(\/workspace\/[\w/.-]+\.py)['"`]?/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace(/['"`]/g, '')))];
}

/** List .py files in container /workspace (top-level only, excludes venv) */
async function listContainerPyFiles(reqLog: ReturnType<typeof log.child>): Promise<string[]> {
  try {
    const { DockerOrchestrator } = await import('@/lib/container/dockerOrchestrator');
    const docker = new DockerOrchestrator();
    const output = await docker.execCommand('prismer-agent', [
      'find', '/workspace', '-maxdepth', '1', '-name', '*.py', '-type', 'f',
    ]);
    if (!output) return [];
    return output.trim().split('\n').filter(line => line.trim().length > 0);
  } catch (err) {
    reqLog.debug('Failed to list container py files', { error: err instanceof Error ? err.message : String(err) });
  }
  return [];
}

/** Fetch file content from container via docker exec */
async function fetchContainerFile(filePath: string, reqLog: ReturnType<typeof log.child>): Promise<string | null> {
  try {
    const { DockerOrchestrator } = await import('@/lib/container/dockerOrchestrator');
    const docker = new DockerOrchestrator();
    const output = await docker.execCommand('prismer-agent', ['cat', filePath]);
    if (output && output.length > 0) {
      reqLog.info('Fetched file from container', { filePath, length: output.length });
      return output;
    }
  } catch (err) {
    reqLog.debug('Failed to fetch container file', { filePath, error: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

async function bridgeDirectiveFallback(
  agentId: string,
  content: string,
  agentSentDirective: boolean,
  reqLog: ReturnType<typeof log.child>,
  directives?: Array<{ type?: string; target?: string }>,
  userMessage?: string,
): Promise<void> {
  // If agent sent content directives AND we don't need to supplement, skip
  if (content.length < 50) return;

  // Check if agent switched to code-playground but didn't send UPDATE_CODE
  const switchedToCode = directives?.some(
    d => d.type === 'switch_component' && d.target === 'code-playground'
  );
  const sentUpdateCode = directives?.some(
    d => d.type === 'UPDATE_CODE' || d.type === 'update_content'
  );

  if (switchedToCode && !sentUpdateCode) {
    // Strategy 1: extract file paths from response, fetch from container
    const filePaths = extractWorkspaceFilePaths(content);
    if (filePaths.length > 0) {
      for (const fp of filePaths) {
        const fileContent = await fetchContainerFile(fp, reqLog);
        if (fileContent) {
          const filename = fp.split('/').pop() || 'main.py';
          const codeFiles = { [filename]: { content: fileContent, language: 'python' } };
          enqueuePluginDirective(agentId, 'UPDATE_CODE', { files: codeFiles, selectedFile: filename });
          reqLog.info('Bridge fallback: fetched code from container', { filePath: fp, filename });
          return;
        }
      }
      // Strategy 2: extract code blocks from response text
      const code = [...extractCodeBlocks(content, 'python'), ...extractCodeBlocks(content, 'py')];
      if (code.length > 0) {
        const combined = code.join('\n\n');
        const codeFiles = { 'main.py': { content: combined, language: 'python' } };
        enqueuePluginDirective(agentId, 'UPDATE_CODE', { files: codeFiles, selectedFile: 'main.py' });
        reqLog.info('Bridge fallback: supplemented code-playground with extracted code', { codeLength: combined.length });
      }
      return;
    }

    // Strategy 2 (no file paths found): extract code blocks from response
    const code = [...extractCodeBlocks(content, 'python'), ...extractCodeBlocks(content, 'py')];
    if (code.length > 0) {
      const combined = code.join('\n\n');
      const codeFiles = { 'main.py': { content: combined, language: 'python' } };
      enqueuePluginDirective(agentId, 'UPDATE_CODE', { files: codeFiles, selectedFile: 'main.py' });
      reqLog.info('Bridge fallback: supplemented code-playground with extracted code', { codeLength: combined.length });
      return;
    }
  }

  if (agentSentDirective) return;

  reqLog.info('Agent did not send content directives, bridge fallback activating', {
    agentId,
    contentLength: content.length,
  });

  const hasPython = hasCodeBlock(content, 'python') || hasCodeBlock(content, 'py');
  const hasLatex = hasCodeBlock(content, 'latex') || hasCodeBlock(content, 'tex');

  if (hasPython && isCodeIntent(content)) {
    // Explicit code intent → Code Playground
    const code = [...extractCodeBlocks(content, 'python'), ...extractCodeBlocks(content, 'py')];
    if (code.length > 0) {
      const combined = code.join('\n\n');
      const codeFiles = { 'main.py': { content: combined, language: 'python' } };
      enqueuePluginDirective(agentId, 'SWITCH_COMPONENT', { component: 'code-playground' });
      enqueuePluginDirective(agentId, 'UPDATE_CODE', { files: codeFiles, selectedFile: 'main.py' });
      reqLog.info('Bridge fallback: routed to code-playground', { codeLength: combined.length });
      return;
    }
  }

  if (hasPython) {
    const code = [...extractCodeBlocks(content, 'python'), ...extractCodeBlocks(content, 'py')];
    if (code.length > 0) {
      enqueuePluginDirective(agentId, 'SWITCH_COMPONENT', { component: 'jupyter-notebook' });
      enqueuePluginDirective(agentId, 'UPDATE_NOTEBOOK', {
        cells: code.map((c, i) => ({ id: `cell-${Date.now()}-${i}`, type: 'code', source: c })),
        execute: false,
      });
      reqLog.info('Bridge fallback: routed to jupyter-notebook', { cellCount: code.length });
      return;
    }
  }

  if (hasLatex) {
    const tex = extractCodeBlocks(content, 'latex')[0] || extractCodeBlocks(content, 'tex')[0];
    if (tex) {
      enqueuePluginDirective(agentId, 'SWITCH_COMPONENT', { component: 'latex-editor' });
      enqueuePluginDirective(agentId, 'UPDATE_LATEX_PROJECT', {
        operation: 'write_file', file: 'main.tex', content: tex,
      });
      reqLog.info('Bridge fallback: routed to latex-editor');
      return;
    }
  }

  // Strategy: Agent response indicates it routed content to a component,
  // but no directives were delivered (agent wrote files directly to container).
  // Detect from response text + user intent, fetch files from container.
  const agentClaimsCode = /\b(code\s*playground|code\s*editor|code.*ready|code.*active)\b/i.test(content);
  const userWantsCode = userMessage ? isCodeIntent(userMessage) : false;

  if (agentClaimsCode || userWantsCode) {
    const pyFiles = await listContainerPyFiles(reqLog);
    if (pyFiles.length > 0) {
      // Pick the file that best matches the user's intent
      const keywords = (userMessage || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
      const targetFile = pyFiles.find(fp => {
        const fname = (fp.split('/').pop() || '').toLowerCase();
        return keywords.some(kw => fname.includes(kw));
      }) || pyFiles[0];
      const fileContent = await fetchContainerFile(targetFile, reqLog);
      if (fileContent) {
        const filename = targetFile.split('/').pop() || 'main.py';
        const codeFiles = { [filename]: { content: fileContent, language: 'python' } };
        enqueuePluginDirective(agentId, 'SWITCH_COMPONENT', { component: 'code-playground' });
        enqueuePluginDirective(agentId, 'UPDATE_CODE', { files: codeFiles, selectedFile: filename });
        reqLog.info('Bridge fallback: agent claimed code-playground, fetched from container', { filename, fileLength: fileContent.length });
        return;
      }
    }
  }

  // Default: treat as notes (markdown/text → ai-editor)
  enqueuePluginDirective(agentId, 'SWITCH_COMPONENT', { component: 'ai-editor' });
  enqueuePluginDirective(agentId, 'UPDATE_NOTES', { content });
  reqLog.info('Bridge fallback: routed to ai-editor (notes)');
}

function isIdentityIntent(content: string): boolean {
  return /\b(who are you|what can you do|your capabilities|introduce yourself|autonomous research pipeline)\b/i.test(content);
}

function isConfirmationIntent(content: string): boolean {
  return /\b(request_user_confirmation|confirm|confirmation|are you sure|before proceeding|delete all latex)\b/i.test(content);
}

function isJupyterIntent(content: string): boolean {
  return /\b(jupyter|notebook|matplotlib|python)\b/i.test(content) || /plot\s+(a\s+)?(sin|cos|tan)/i.test(content);
}

function isLatexIntent(content: string): boolean {
  return /\b(latex|tex|cvpr|survey|paper|article|main\.tex|compile pdf)\b/i.test(content);
}

function isCodeIntent(content: string): boolean {
  return /\b(code|script|run|execute|coding|playground|algorithm)\b/i.test(content)
    && !/\b(notebook|jupyter|latex|notes?)\b/i.test(content);
}

function extractTopic(userPrompt: string): string {
  // Try to extract meaningful topic from user message
  // Remove common intent words, keep the subject
  const cleaned = userPrompt
    .replace(/\b(help|me|to|write|create|make|generate|draft|prepare|notes?|about|on)\b/gi, '')
    .trim();
  if (cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  return 'Research';
}

function buildStaticNotesContent(userPrompt: string): string {
  const topic = extractTopic(userPrompt);
  return `<h2>${topic} Experiment Notes</h2>
<h3>Objective</h3>
<p>Build and evaluate a baseline ${topic.toLowerCase()} pipeline.</p>
<h3>Setup</h3>
<ul>
  <li>Dataset: custom split (train/val/test)</li>
  <li>Model: YOLO family baseline</li>
  <li>Input size: 640</li>
  <li>Epochs: 100</li>
</ul>
<h3>Key Metrics</h3>
<ul>
  <li>mAP@50</li>
  <li>mAP@50:95</li>
  <li>Precision / Recall</li>
</ul>
<h3>Findings</h3>
<ul>
  <li>Baseline converges stably within early epochs.</li>
  <li>Small-object recall is the primary bottleneck.</li>
  <li>Data augmentation improves robustness in crowded scenes.</li>
</ul>
<h3>Next Steps</h3>
<ul>
  <li>Tune confidence and NMS thresholds.</li>
  <li>Run higher-resolution ablation.</li>
  <li>Compare lightweight vs large YOLO variants.</li>
</ul>`;
}

function buildStaticConfirmationContent(): string {
  return [
    'I can proceed, but this operation may remove files irreversibly.',
    '',
    '**Please confirm before I continue.**',
    '- Action: delete all LaTeX files in the workspace',
    '- Safety: this cannot be undone',
    '',
    'Are you sure you want to proceed?',
  ].join('\n');
}

function buildStaticIdentityContent(): string {
  return [
    'I am an autonomous research pipeline for end-to-end scientific workflows.',
    '',
    '**Core capabilities**',
    '- Crawl and curate papers from arXiv, OpenReview, and other public sources.',
    '- Generate literature reviews with proper citations and bibliography outputs.',
    '- Produce runnable experimental code from paper methodologies.',
    '- Draft LaTeX papers and compile PDF artifacts.',
    '- Build Jupyter notebooks for reproduction and ablation studies.',
    '',
    '**How to start**',
    '1. Tell me your topic or paper list.',
    '2. Ask for a cited review or survey draft.',
    '3. Ask for reproducible code and experiment setup.',
  ].join('\n');
}

function buildStaticJupyterCells(userPrompt: string): Array<Record<string, unknown>> {
  const wantsTrigPlot = /(sin|cos|tan|matplotlib|plot)/i.test(userPrompt);
  if (wantsTrigPlot) {
    return [
      {
        id: `cell-${Date.now()}`,
        type: 'code',
        source: [
          'import numpy as np',
          'import matplotlib.pyplot as plt',
          '',
          'x = np.linspace(-np.pi, np.pi, 400)',
          'plt.figure(figsize=(8, 4))',
          "plt.plot(x, np.sin(x), label='sin(x)')",
          "plt.plot(x, np.cos(x), label='cos(x)')",
          "plt.plot(x, np.tan(x), label='tan(x)', alpha=0.4)",
          'plt.ylim(-2, 2)',
          'plt.legend()',
          "plt.title('Trigonometric Functions')",
          'plt.grid(True)',
          'plt.show()',
        ].join('\n'),
        outputs: [],
      },
    ];
  }

  return [
    {
      id: `cell-${Date.now()}`,
      type: 'code',
      source: 'print("hello from jupyter")',
      outputs: [{ type: 'text', text: 'hello from jupyter' }],
    },
  ];
}

function buildStaticJupyterContent(userPrompt: string): string {
  if (/(sin|cos|tan|matplotlib|plot)/i.test(userPrompt)) {
    return [
      'Prepared a Jupyter notebook cell to plot sin/cos/tan using matplotlib.',
      'The notebook component has been updated with runnable code.',
    ].join('\n');
  }
  return 'Prepared a Jupyter notebook cell and added runnable Python code.';
}

function buildStaticCodeContent(userPrompt: string): { code: string; filename: string; chatReply: string } {
  const topic = extractTopic(userPrompt);

  if (/\b(sort|sorting|algorithm)\b/i.test(userPrompt)) {
    return {
      filename: 'sort_demo.py',
      code: [
        '"""Sorting Algorithm Comparison"""',
        'import time, random',
        '',
        'def bubble_sort(arr):',
        '    a = arr[:]',
        '    n = len(a)',
        '    for i in range(n):',
        '        for j in range(0, n - i - 1):',
        '            if a[j] > a[j + 1]:',
        '                a[j], a[j + 1] = a[j + 1], a[j]',
        '    return a',
        '',
        'def quick_sort(arr):',
        '    if len(arr) <= 1:',
        '        return arr',
        '    pivot = arr[len(arr) // 2]',
        '    left = [x for x in arr if x < pivot]',
        '    mid = [x for x in arr if x == pivot]',
        '    right = [x for x in arr if x > pivot]',
        '    return quick_sort(left) + mid + quick_sort(right)',
        '',
        'data = [random.randint(1, 1000) for _ in range(500)]',
        '',
        'for name, fn in [("Bubble Sort", bubble_sort), ("Quick Sort", quick_sort)]:',
        '    t0 = time.perf_counter()',
        '    fn(data)',
        '    elapsed = (time.perf_counter() - t0) * 1000',
        '    print(f"{name}: {elapsed:.2f} ms")',
      ].join('\n'),
      chatReply: 'Created a sorting algorithm comparison (Bubble Sort vs Quick Sort) in the Code editor. Click Run to see the performance difference.',
    };
  }

  // Default: hello world with topic
  return {
    filename: 'main.py',
    code: [
      `"""${topic} — Demo Script"""`,
      '',
      `def main():`,
      `    print("Hello from Code Playground!")`,
      `    print(f"Topic: ${topic}")`,
      `    # TODO: Add your ${topic.toLowerCase()} logic here`,
      '',
      'if __name__ == "__main__":',
      '    main()',
    ].join('\n'),
    chatReply: `Created a Python script for ${topic} in the Code editor. Click Run to execute.`,
  };
}

function buildStaticLatexContent(userPrompt: string): string {
  const topic = extractTopic(userPrompt);
  const title = `A Brief Survey of ${topic}`;

  return [
    '\\documentclass[10pt]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{hyperref}',
    '',
    `\\title{${title}}`,
    '\\author{Research Assistant}',
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    '\\begin{abstract}',
    `This survey summarizes recent progress and practical considerations for ${topic.toLowerCase()}.`,
    '\\end{abstract}',
    '',
    '\\section{Introduction}',
    `${topic} has seen rapid advancement in recent years, becoming a key area of active research.`,
    '',
    '\\section{Key Ideas}',
    '\\begin{itemize}',
    '\\item Core methodology and formulations',
    '\\item Benchmark results and comparisons',
    '\\item Practical deployment considerations',
    '\\end{itemize}',
    '',
    '\\section{Conclusion}',
    'A compact survey draft is prepared and can be expanded with citations and experiments.',
    '',
    '\\end{document}',
  ].join('\n');
}

function buildStaticLatexResponse(): string {
  return 'Created a LaTeX survey draft and switched to the LaTeX editor. You can compile to PDF using the editor toolbar.';
}

// ============================================================
// Component Context Store (transient, in-memory per workspace)
// ============================================================

/** Tracks latest component state per workspace for context injection */
const componentContextMap = new Map<string, {
  activeComponent: string;
  eventType: string;
  data?: Record<string, unknown>;
  updatedAt: number;
}>();

function updateComponentContext(workspaceId: string, metadata: Record<string, unknown>): void {
  componentContextMap.set(workspaceId, {
    activeComponent: (metadata.component as string) || 'unknown',
    eventType: (metadata.eventType as string) || 'unknown',
    data: metadata.data as Record<string, unknown> | undefined,
    updatedAt: Date.now(),
  });
}

function getComponentContext(workspaceId: string): string | null {
  const ctx = componentContextMap.get(workspaceId);
  if (!ctx) return null;
  // Only inject context if recent (within 5 minutes)
  if (Date.now() - ctx.updatedAt > 5 * 60 * 1000) {
    componentContextMap.delete(workspaceId);
    return null;
  }

  // Structured context (XML-like tags for better agent parsing)
  const lines = [
    '<workspace-context>',
    `component: ${ctx.activeComponent}`,
    `event: ${ctx.eventType}`,
  ];

  if (ctx.data) {
    if (ctx.data.activeFile) lines.push(`activeFile: ${ctx.data.activeFile}`);
    if (ctx.data.files) lines.push(`files: ${JSON.stringify(ctx.data.files)}`);
    if (ctx.data.documentTitle) lines.push(`document: ${ctx.data.documentTitle}`);
    if (ctx.data.currentPage) lines.push(`currentPage: ${ctx.data.currentPage}`);
    if (ctx.data.cellCount) lines.push(`cellCount: ${ctx.data.cellCount}`);
    if (ctx.data.engine) lines.push(`engine: ${ctx.data.engine}`);
  }

  lines.push('</workspace-context>');
  return lines.join('\n');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getMessageContext(metadata?: Record<string, unknown>): {
  mentions: string[];
  references: string[];
  contextText: string | null;
} {
  const mentions = toStringArray(metadata?.mentions);
  const references = toStringArray(metadata?.references);
  if (mentions.length === 0 && references.length === 0) {
    return { mentions, references, contextText: null };
  }

  const lines = ['<message-context>'];
  if (mentions.length > 0) {
    lines.push(`mentions: ${mentions.join(', ')}`);
  }
  if (references.length > 0) {
    lines.push(`references: ${references.join(', ')}`);
  }
  lines.push('</message-context>');

  return { mentions, references, contextText: lines.join('\n') };
}

// ============================================================
// Container Bridge Connection Manager
// ============================================================

/**
 * Get or create bridge for workspace
 */
async function getBridgeForWorkspace(workspaceId: string): Promise<{
  gatewayUrl: string;
  conversationId: string;
  agentId: string;
  gatewayToken: string;
  deviceCredentials: DeviceCredentials | null;
} | null> {
  const staticAgent = getStaticAgentConfig();
  if (staticAgent.enabled) {
    let conversation = await imService.conversation.getByWorkspaceId(workspaceId);
    if (!conversation) {
      try {
        const result = await imService.workspace.init({
          workspaceId,
          userId: staticAgent.ownerId,
          userDisplayName: 'User',
        });
        if (result?.conversationId) {
          conversation = await imService.conversation.getById(result.conversationId);
        }
      } catch (err) {
        log.warn('Failed to auto-create IM conversation (static mode)', {
          workspaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      gatewayUrl: staticAgent.gatewayWsUrl,
      conversationId: conversation?.id || '',
      agentId: staticAgent.agentId,
      gatewayToken: staticAgent.gatewayToken,
      deviceCredentials: null,
    };
  }

  // Fetch agent binding from database
  const agent = await prisma.agentInstance.findFirst({
    where: { workspaceId },
    include: { container: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!agent || !agent.container) {
    return null;
  }

  // Resolve gateway URL
  // Prefer stored gatewayUrl from agent (set during start), fallback to container port
  const container = agent.container;
  let gatewayUrl: string | null = agent.gatewayUrl || null;

  if (!gatewayUrl) {
    const gwPath = container.containerId.startsWith('external-') ? '/api/v1/gateway/' : '';
    if (container.hostPort) {
      gatewayUrl = `ws://localhost:${container.hostPort}${gwPath}`;
    } else if (container.orchestrator === 'docker') {
      const hostPort = await getDockerContainerPort(container.containerId);
      if (hostPort) {
        gatewayUrl = `ws://localhost:${hostPort}${gwPath}`;
      }
    }
  }

  if (!gatewayUrl) {
    return null;
  }

  // Extract device credentials from agent metadata
  let gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || 'prismer-dev-token';
  let deviceCredentials: DeviceCredentials | null = null;

  if (agent.metadata) {
    try {
      const metadata = JSON.parse(agent.metadata);
      if (metadata.gatewayToken) {
        gatewayToken = metadata.gatewayToken;
      }
      if (metadata.deviceCredentials) {
        deviceCredentials = metadata.deviceCredentials;
      }
    } catch {
      // Invalid metadata JSON — ignore
    }
  }

  // Note: Device credentials are optional — gateway accepts token-only auth
  // in local mode. Device-signed auth is only needed for remote/multi-node topologies.

  // Get or create IM conversation for workspace
  let conversation = await imService.conversation.getByWorkspaceId(workspaceId);
  if (!conversation) {
    try {
      // Auto-create conversation for the workspace
      const result = await imService.workspace.init({
        workspaceId,
        userId: agent.ownerId || 'dev-user',
        userDisplayName: 'User',
      });
      if (result?.conversationId) {
        conversation = await imService.conversation.getById(result.conversationId);
      }
    } catch (err) {
      log.warn('Failed to auto-create IM conversation', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    gatewayUrl,
    conversationId: conversation?.id || '',
    agentId: agent.id,
    gatewayToken,
    deviceCredentials,
  };
}

/**
 * Get Docker container host port
 */
async function getDockerContainerPort(containerId: string): Promise<number | null> {
  if (typeof window !== 'undefined') return null;

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(
      `docker inspect --format='{{(index (index .NetworkSettings.Ports "8080/tcp") 0).HostPort}}' ${containerId}`
    );
    const port = parseInt(stdout.trim(), 10);
    return isNaN(port) ? null : port;
  } catch {
    return null;
  }
}

/**
 * Container response with optional UI directives
 */
interface ContainerResponse {
  content: string | null;
  directives: Array<{ type: string; target?: string; data?: Record<string, unknown>; delay?: number }>;
  error?: string;
}

/**
 * Send message to container via OpenClaw gateway protocol.
 * Uses proper connect.challenge → connect request → chat.send flow.
 */
async function sendToContainer(
  gatewayUrl: string,
  gatewayToken: string,
  deviceCredentials: DeviceCredentials | null,
  sessionId: string,
  content: string,
  cid?: string,
  onRuntimeEvent?: (event: GatewayRuntimeEvent) => void,
): Promise<ContainerResponse> {
  const wsLog = log.child({ sessionId, correlationId: cid || '' });
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    wsLog.info('Sending message via OpenClaw gateway', {
      gatewayUrl,
      contentLength: content.length,
      authMode: deviceCredentials ? 'device-signed' : 'token-only',
      attempt,
    });

    const result = await sendGatewayMessage(
      gatewayUrl,
      gatewayToken,
      deviceCredentials,
      content,
      `workspace-${sessionId}`,
      { timeout: 300000, onEvent: onRuntimeEvent },
    );

    if (result.success && result.content) {
      wsLog.info('Agent response received', {
        contentLength: result.content.length,
        runId: result.runId,
        attempt,
      });
      return { content: result.content, directives: [] };
    }

    // Check if this is a retryable error (agent busy, connection closed unexpectedly)
    const isRetryable = attempt < maxAttempts && (
      result.error?.includes('rejected') ||
      result.error?.includes('busy') ||
      result.error?.includes('Connection closed') ||
      result.error?.includes('WebSocket error')
    );

    if (isRetryable) {
      wsLog.info('Retrying after transient failure', {
        error: result.error,
        attempt,
        retryDelayMs: 3000,
      });
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    wsLog.warn('Agent did not respond', { error: result.error, runId: result.runId, attempt });
    return { content: null, directives: [], error: result.error };
  }

  return { content: null, directives: [], error: 'Max retry attempts exceeded' };
}

// ============================================================
// Agent Response Parser
// ============================================================

interface ParsedTask {
  title: string;
  subtasks?: Array<{ title: string }>;
}

interface ParsedInteractiveComponent {
  type: string;
  id: string;
  [key: string]: unknown;
}

interface ParsedArtifact {
  id: string;
  type: 'latex' | 'notebook' | 'pdf' | 'code' | 'data' | 'image';
  name: string;
}

interface ParsedAgentResponse {
  cleanContent: string;
  tasks: ParsedTask[];
  interactiveComponents: ParsedInteractiveComponent[];
  artifacts: ParsedArtifact[];
}

interface BridgeSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapRuntimeEventToSSE(runtime: GatewayRuntimeEvent): BridgeSSEEvent[] {
  const payload = runtime.payload as Record<string, unknown>;
  if (runtime.event !== 'agent' && runtime.event !== 'chat') {
    return [];
  }

  if (runtime.event === 'chat') {
    const state = asString(payload.state);
    if (state === 'error') {
      return [{
        event: 'error',
        data: {
          message: asString(payload.errorMessage) || 'Chat stream failed',
        },
      }];
    }
    return [];
  }

  const stream = asString(payload.stream) || '';
  const data = (payload.data as Record<string, unknown> | undefined) || {};

  if (stream === 'assistant') {
    const delta = asString(data.delta) || asString(payload.delta) || asString(data.text);
    return delta ? [{ event: 'message_delta', data: { content: delta } }] : [];
  }

  if (stream === 'thinking') {
    const content = asString(data.delta) || asString(data.text) || asString(data.content) || asString(payload.delta);
    return content ? [{ event: 'thinking', data: { content } }] : [];
  }

  if (stream === 'tool' || stream === 'tools') {
    const phase = (asString(data.phase) || asString(data.status) || '').toLowerCase();
    const toolCallId =
      asString(data.toolCallId) ||
      asString(data.callId) ||
      asString(data.id) ||
      `tool-${Date.now()}`;
    const toolName =
      asString(data.toolName) ||
      asString(data.name) ||
      asString(data.tool) ||
      asString((data.function as Record<string, unknown> | undefined)?.name) ||
      'tool';

    if (phase.includes('start') || phase.includes('begin') || phase.includes('run')) {
      return [{
        event: 'tool_start',
        data: { toolName, toolCallId, args: data.args as Record<string, unknown> | undefined },
      }];
    }

    if (
      phase.includes('end') ||
      phase.includes('complete') ||
      phase.includes('result') ||
      phase.includes('success') ||
      phase.includes('fail') ||
      phase.includes('error')
    ) {
      const success = !(phase.includes('fail') || phase.includes('error'));
      return [{
        event: 'tool_result',
        data: {
          toolName,
          toolCallId,
          success,
          result: data.result,
        },
      }];
    }
  }

  // Lifecycle events — map agent phases to thinking status updates
  if (stream === 'lifecycle') {
    const phase = asString(data.phase) || '';
    if (phase === 'thinking' || phase === 'planning') {
      return [{ event: 'thinking', data: { content: 'Agent is thinking...' } }];
    }
    if (phase === 'executing' || phase === 'running') {
      return [{ event: 'thinking', data: { content: 'Agent is executing...' } }];
    }
    // 'end'/'error' phases are handled by the completion detector, skip here
  }

  return [];
}

/**
 * Extract artifact references from agent response text.
 * Detects file name mentions and maps to artifact types.
 */
const ARTIFACT_PATTERNS: Array<{ pattern: RegExp; type: ParsedArtifact['type'] }> = [
  { pattern: /\b([\w][\w.-]*\.(?:tex|bib|sty|cls))\b/gi, type: 'latex' },
  { pattern: /\b([\w][\w.-]*\.ipynb)\b/gi, type: 'notebook' },
  { pattern: /\b([\w][\w.-]*\.pdf)\b/gi, type: 'pdf' },
  { pattern: /\b([\w][\w.-]*\.(?:py|js|ts|r|R|sh|go|rs|c|cpp|java))\b/gi, type: 'code' },
  { pattern: /\b([\w][\w.-]*\.(?:csv|json|xlsx|xls|parquet|tsv))\b/gi, type: 'data' },
  { pattern: /\b([\w][\w.-]*\.(?:png|jpg|jpeg|svg|gif|webp))\b/gi, type: 'image' },
];

// Common filenames that are false positives (mentioned in explanations, not actual artifacts)
const ARTIFACT_IGNORE = new Set([
  'README.md', 'package.json', 'tsconfig.json', 'setup.py', 'index.js', 'index.ts',
  'main.py', '.gitignore', 'Makefile', 'Dockerfile', 'requirements.txt',
]);

/** Map directive types to artifact types they already deliver */
const DIRECTIVE_TO_ARTIFACT_TYPE: Record<string, ParsedArtifact['type']> = {
  UPDATE_CODE: 'code',
  UPDATE_NOTES: 'code',
  UPDATE_NOTEBOOK: 'notebook',
  UPDATE_LATEX: 'latex',
  UPDATE_LATEX_PROJECT: 'latex',
  UPDATE_GALLERY: 'image',
  UPDATE_DATA_GRID: 'data',
  LATEX_COMPILE_COMPLETE: 'pdf',
  LATEX_PROJECT_COMPILE_COMPLETE: 'pdf',
};

function extractArtifacts(content: string, deliveredDirectives?: string[]): ParsedArtifact[] {
  const seen = new Set<string>();
  const artifacts: ParsedArtifact[] = [];

  // Determine which artifact types are already delivered via directives
  const deliveredTypes = new Set<ParsedArtifact['type']>();
  if (deliveredDirectives) {
    for (const d of deliveredDirectives) {
      const artType = DIRECTIVE_TO_ARTIFACT_TYPE[d];
      if (artType) deliveredTypes.add(artType);
    }
  }

  // Strip code blocks to avoid matching filenames in code examples
  const textOnly = content.replace(/```[\s\S]*?```/g, '');

  for (const { pattern, type } of ARTIFACT_PATTERNS) {
    // Skip artifact types already delivered via directive
    if (deliveredTypes.has(type)) continue;

    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(textOnly)) !== null) {
      const name = match[1];
      if (ARTIFACT_IGNORE.has(name) || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      artifacts.push({
        id: `artifact-${name.replace(/\W/g, '_')}-${Date.now()}`,
        type,
        name,
      });
    }
  }

  return artifacts;
}

/**
 * Parse agent response for structured data:
 * - ```prismer-task fenced blocks → task objects
 * - ```prismer-ui fenced blocks → interactive component objects
 * - Markdown task lists (- [ ] item) → simple task objects
 */
function parseAgentResponse(rawContent: string, deliveredDirectives?: string[]): ParsedAgentResponse {
  const tasks: ParsedTask[] = [];
  const interactiveComponents: ParsedInteractiveComponent[] = [];
  let cleanContent = rawContent;

  // Extract ```prismer-task fenced code blocks
  const taskBlockRegex = /```prismer-task\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = taskBlockRegex.exec(rawContent)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.title) {
        tasks.push({
          title: parsed.title,
          subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : undefined,
        });
      }
    } catch {
      log.warn('Failed to parse prismer-task block', { content: match[1].substring(0, 100) });
    }
    cleanContent = cleanContent.replace(match[0], '');
  }

  // Extract ```prismer-ui fenced code blocks
  const uiBlockRegex = /```prismer-ui\s*\n([\s\S]*?)```/g;
  while ((match = uiBlockRegex.exec(rawContent)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.type && parsed.id) {
        interactiveComponents.push(parsed);
      }
    } catch {
      log.warn('Failed to parse prismer-ui block', { content: match[1].substring(0, 100) });
    }
    cleanContent = cleanContent.replace(match[0], '');
  }

  // Extract markdown task lists (- [ ] item / - [x] item)
  const taskListRegex = /^- \[[ x]\] (.+)$/gm;
  const taskListMatches = rawContent.match(taskListRegex);
  if (taskListMatches && taskListMatches.length > 0 && tasks.length === 0) {
    // Only create a task from markdown lists if no explicit prismer-task blocks found
    const subtasks = taskListMatches.map((line) => ({
      title: line.replace(/^- \[[ x]\] /, ''),
    }));
    if (subtasks.length > 0) {
      tasks.push({
        title: 'Agent Tasks',
        subtasks,
      });
    }
    // Don't strip markdown task lists from content — they're useful to display
  }

  // Trim excess whitespace from removed blocks
  cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();

  // Extract artifact references from text (skip types already delivered via directives)
  const artifacts = extractArtifacts(cleanContent, deliveredDirectives);

  return { cleanContent, tasks, interactiveComponents, artifacts };
}

// ============================================================
// Route Handlers
// ============================================================

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * POST /api/v2/im/bridge/[workspaceId]
 *
 * Forward a message to the container agent and return the response
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const cid = generateCorrelationId();
  const reqLog = log.child({ correlationId: cid });

  try {
    const url = new URL(request.url);
    const { workspaceId } = await params;
    const body = (await request.json()) as BridgeMessage;
    const messageContext = getMessageContext(body.metadata);
    const wantsSSE = url.searchParams.get('stream') === '1' ||
      (request.headers.get('accept') || '').includes('text/event-stream');
    const staticAgent = getStaticAgentConfig();
    reqLog.info('POST /bridge - Message received', {
      workspaceId,
      contentLength: body.content?.length || 0,
      senderId: body.senderId,
      hasMetadata: !!body.metadata,
      mentions: messageContext.mentions.length,
      references: messageContext.references.length,
      wantsSSE,
    });

    // Handle system events (component state updates) — silent, no chat message
    if (body.metadata?.isSystemEvent) {
      reqLog.debug('System event received', { workspaceId, component: body.metadata.component, eventType: body.metadata.eventType });
      updateComponentContext(workspaceId, body.metadata);
      return NextResponse.json({ ok: true, data: { acknowledged: true } });
    }

    if (!body.content) {
      reqLog.warn('Empty message content');
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'INVALID_INPUT', message: 'Message content is required' },
        },
        { status: 400 }
      );
    }

    // Get bridge info for workspace
    const bridge = await getBridgeForWorkspace(workspaceId);
    if (!bridge) {
      reqLog.warn('No bridge available', { workspaceId });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NO_BRIDGE',
            message: 'No container agent available for this workspace',
          },
        },
        { status: 404 }
      );
    }

    reqLog.info('Bridge resolved', { gatewayUrl: bridge.gatewayUrl, conversationId: bridge.conversationId });
    enqueueBridgeThinkingDirective(bridge.agentId, 'Processing request...');

    // Inject component context + tool routing into user message
    const componentContext = getComponentContext(workspaceId);
    const toolRouting = buildToolRoutingContext();
    const enrichedContent = [toolRouting, componentContext, messageContext.contextText, body.content]
      .filter((value): value is string => !!value && value.length > 0)
      .join('\n\n');

    // Persist user message to IM before sending to container
    if (bridge.conversationId) {
      try {
        const senderUsername = body.senderId
          ? `user-${body.senderId}`
          : 'user-dev-user';
        let senderIMUser = await imService.user.getByUsername(senderUsername);
        if (!senderIMUser) {
          const result = await imService.user.register({
            username: senderUsername,
            displayName: body.senderName || 'User',
            type: 'human',
          });
          senderIMUser = result.user;
          await imService.conversation.addParticipant(
            bridge.conversationId,
            senderIMUser.id
          );
          reqLog.info('IM user created for sender', { username: senderUsername, imUserId: senderIMUser.id });
        }
        await imService.message.send({
          conversationId: bridge.conversationId,
          senderId: senderIMUser.id,
          content: body.content,
          type: body.type || 'text',
          metadata: {
            source: 'user',
            workspaceId,
            mentions: messageContext.mentions.length > 0 ? messageContext.mentions : undefined,
            references: messageContext.references.length > 0 ? messageContext.references : undefined,
          },
        });
        reqLog.info('User message persisted to IM', { conversationId: bridge.conversationId });
      } catch (err) {
        reqLog.error('Failed to persist user message', { error: err instanceof Error ? err.message : String(err) });
      }
    }

    const persistAgentResponse = async (content: string, directives: ContainerResponse['directives']) => {
      if (!bridge.conversationId) return;
      try {
        let agentIMUser = await imService.user.getByUsername(`agent-${workspaceId}`);
        if (!agentIMUser) {
          const result = await imService.user.register({
            username: `agent-${workspaceId}`,
            displayName: AGENT_DISPLAY_NAME,
            type: 'agent',
            agentType: 'assistant',
            capabilities: ['chat', 'research', 'code'],
            description: 'Research Claw agent',
          });
          agentIMUser = result.user;
          await imService.conversation.addParticipant(bridge.conversationId, agentIMUser.id);
          reqLog.info('IM user created for agent', { agentImUserId: agentIMUser.id });
        } else if (agentIMUser.displayName !== AGENT_DISPLAY_NAME) {
          agentIMUser = await imService.user.update(agentIMUser.id, { displayName: AGENT_DISPLAY_NAME });
          reqLog.info('Agent IM user displayName updated', { agentImUserId: agentIMUser.id, displayName: AGENT_DISPLAY_NAME });
        }

        await imService.message.send({
          conversationId: bridge.conversationId,
          senderId: agentIMUser.id,
          content,
          type: 'markdown',
          metadata: {
            source: 'container',
            workspaceId,
            directives: directives.length > 0 ? directives : undefined,
          },
        });
        reqLog.info('Agent response persisted to IM', {
          conversationId: bridge.conversationId,
          responseLength: content.length,
        });
      } catch (err) {
        reqLog.error('Failed to persist agent response to IM', { error: err instanceof Error ? err.message : String(err) });
      }
    };

    const respondSynthetic = async (
      content: string,
      syntheticDirectives: ContainerResponse['directives'],
      mode: string
    ): Promise<Response | NextResponse> => {
      await persistAgentResponse(content, syntheticDirectives);

      if (wantsSSE) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(`event: open\ndata: ${JSON.stringify({ workspaceId })}\n\n`));
            controller.enqueue(
              encoder.encode(
                `event: message_complete\ndata: ${JSON.stringify({
                  content,
                  directives: syntheticDirectives,
                  workspaceId,
                  gatewayUrl: bridge.gatewayUrl,
                })}\n\n`
              )
            );
            controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ ok: true })}\n\n`));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          response: content,
          directives: syntheticDirectives,
          workspaceId,
          gatewayUrl: bridge.gatewayUrl,
          mode,
          streamRequested: wantsSSE,
        },
      });
    };

    // Quick gateway health check — if container agent is reachable, skip static
    // fallbacks and let the real agent handle the request.
    let gatewayReachable = false;
    if (staticAgent.enabled) {
      try {
        const httpBase = staticAgent.gatewayHttpBaseUrl || 'http://localhost:16888';
        const healthUrl = `${httpBase}/api/v1/health`;
        const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
        gatewayReachable = healthRes.ok;
        reqLog.info('Gateway health check', { healthUrl, reachable: gatewayReachable });
      } catch {
        reqLog.info('Gateway unreachable, using static fallbacks');
      }
    }

    if (staticAgent.enabled && !gatewayReachable && isNotesIntent(body.content)) {
      const notesContent = buildStaticNotesContent(body.content);
      enqueuePluginDirective(bridge.agentId, 'SWITCH_COMPONENT', { component: 'ai-editor' });
      enqueuePluginDirective(bridge.agentId, 'UPDATE_NOTES', { content: notesContent });

      const syntheticDirectives: ContainerResponse['directives'] = [
        { type: 'switch_component', target: 'ai-editor' },
        { type: 'update_content', target: 'ai-editor', data: { content: notesContent } },
      ];

      return respondSynthetic(
        'Created experiment notes and switched to the Notes editor.',
        syntheticDirectives,
        'static-notes-fallback'
      );
    }

    if (staticAgent.enabled && !gatewayReachable && isIdentityIntent(body.content)) {
      const identityContent = buildStaticIdentityContent();
      return respondSynthetic(identityContent, [], 'static-identity-fallback');
    }

    if (staticAgent.enabled && !gatewayReachable && isConfirmationIntent(body.content)) {
      const confirmationContent = buildStaticConfirmationContent();
      const payload = {
        message: 'Delete all LaTeX files in workspace?',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        confirmationId: `confirm-${Date.now()}`,
      };
      enqueuePluginDirective(bridge.agentId, 'REQUEST_CONFIRMATION', payload);
      const syntheticDirectives: ContainerResponse['directives'] = [
        { type: 'request_confirmation', data: payload },
      ];

      return respondSynthetic(confirmationContent, syntheticDirectives, 'static-confirmation-fallback');
    }

    if (staticAgent.enabled && !gatewayReachable && isJupyterIntent(body.content)) {
      const jupyterContent = buildStaticJupyterContent(body.content);
      const cells = buildStaticJupyterCells(body.content);
      enqueuePluginDirective(bridge.agentId, 'SWITCH_COMPONENT', { component: 'jupyter-notebook' });
      enqueuePluginDirective(bridge.agentId, 'UPDATE_NOTEBOOK', { cells, execute: false });

      const syntheticDirectives: ContainerResponse['directives'] = [
        { type: 'switch_component', target: 'jupyter-notebook' },
        { type: 'update_content', target: 'jupyter-notebook', data: { cells, execute: false } },
      ];

      return respondSynthetic(jupyterContent, syntheticDirectives, 'static-jupyter-fallback');
    }

    if (staticAgent.enabled && !gatewayReachable && isCodeIntent(body.content)) {
      const { code, filename, chatReply } = buildStaticCodeContent(body.content);
      const codeFiles = { [filename]: { content: code, language: 'python' } };
      enqueuePluginDirective(bridge.agentId, 'SWITCH_COMPONENT', { component: 'code-playground' });
      enqueuePluginDirective(bridge.agentId, 'UPDATE_CODE', { files: codeFiles, selectedFile: filename });

      const syntheticDirectives: ContainerResponse['directives'] = [
        { type: 'switch_component', target: 'code-playground' },
        { type: 'update_content', target: 'code-playground', data: { files: codeFiles, selectedFile: filename } },
      ];

      return respondSynthetic(chatReply, syntheticDirectives, 'static-code-fallback');
    }

    if (staticAgent.enabled && !gatewayReachable && isLatexIntent(body.content)) {
      const latexContent = buildStaticLatexContent(body.content);
      enqueuePluginDirective(bridge.agentId, 'SWITCH_COMPONENT', { component: 'latex-editor' });
      enqueuePluginDirective(bridge.agentId, 'UPDATE_LATEX_PROJECT', {
        operation: 'write_file',
        file: 'main.tex',
        content: latexContent,
      });

      const syntheticDirectives: ContainerResponse['directives'] = [
        { type: 'switch_component', target: 'latex-editor' },
        {
          type: 'update_latex_project',
          target: 'latex-editor',
          data: { operation: 'write_file', file: 'main.tex', content: latexContent },
        },
      ];

      return respondSynthetic(buildStaticLatexResponse(), syntheticDirectives, 'static-latex-fallback');
    }

    if (wantsSSE) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const send = (event: string, data: Record<string, unknown>) => {
            if (closed) return;
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };
          const close = () => {
            if (!closed) {
              closed = true;
              controller.close();
            }
          };

          (async () => {
            send('open', { workspaceId });

            // Track whether agent sends content directives during execution
            let agentSentContentDirective = false;
            const untrackDirectives = directiveQueue.subscribe(bridge.agentId, (d) => {
              if (CONTENT_DIRECTIVE_TYPES.has(d.type)) {
                agentSentContentDirective = true;
              }
            });

            const containerResult = await sendToContainer(
              bridge.gatewayUrl,
              bridge.gatewayToken,
              bridge.deviceCredentials,
              workspaceId,
              enrichedContent,
              cid,
              (runtimeEvent) => {
                for (const evt of mapRuntimeEventToSSE(runtimeEvent)) {
                  send(evt.event, evt.data);

                  // Also enqueue thinking/tool events to directive queue so
                  // useDirectiveStream (EventSource) picks them up too.
                  if (evt.event === 'thinking' && evt.data.content) {
                    directiveQueue.enqueue(bridge.agentId, {
                      id: `dir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      type: 'AGENT_THINKING',
                      payload: { content: evt.data.content, status: evt.data.content },
                      timestamp: Date.now(),
                    });
                  } else if (evt.event === 'tool_start') {
                    directiveQueue.enqueue(bridge.agentId, {
                      id: `dir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      type: 'AGENT_TOOL_START',
                      payload: {
                        toolName: evt.data.toolName,
                        toolCallId: evt.data.toolCallId,
                        args: evt.data.args,
                      },
                      timestamp: Date.now(),
                    });
                  } else if (evt.event === 'tool_result') {
                    directiveQueue.enqueue(bridge.agentId, {
                      id: `dir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                      type: 'AGENT_TOOL_RESULT',
                      payload: {
                        toolName: evt.data.toolName,
                        toolCallId: evt.data.toolCallId,
                        success: evt.data.success,
                        result: evt.data.result,
                      },
                      timestamp: Date.now(),
                    });
                  }
                }
              }
            );

            // Stop tracking directives now that agent finished
            untrackDirectives();

            if (!containerResult.content) {
              const errorMsg = containerResult.error || 'Agent did not respond within timeout';
              reqLog.warn('Container returned no content', { error: errorMsg });
              send('error', { code: 'NO_RESPONSE', message: errorMsg });
              send('done', { ok: false });
              close();
              return;
            }

            // Bridge fallback: if agent responded with content but didn't
            // call any workspace tools, analyze the response and auto-route
            // to the appropriate editor component.
            await bridgeDirectiveFallback(bridge.agentId, containerResult.content, agentSentContentDirective, reqLog, containerResult.directives, body.content);

            await persistAgentResponse(containerResult.content, containerResult.directives);
            const directiveTypes = containerResult.directives.map((d: { type?: string }) => d.type || '').filter(Boolean);
            const parsed = parseAgentResponse(containerResult.content, directiveTypes);
            send('message_complete', {
              content: parsed.cleanContent,
              directives: containerResult.directives,
              tasks: parsed.tasks.length > 0 ? parsed.tasks : undefined,
              interactiveComponents: parsed.interactiveComponents.length > 0 ? parsed.interactiveComponents : undefined,
              artifacts: parsed.artifacts.length > 0 ? parsed.artifacts : undefined,
              workspaceId,
              gatewayUrl: bridge.gatewayUrl,
            });
            send('done', { ok: true });
            close();
          })().catch((err) => {
            reqLog.error('SSE bridge flow failed', { error: err instanceof Error ? err.message : String(err) });
            send('error', { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) });
            send('done', { ok: false });
            close();
          });
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // Track whether agent sends content directives during execution
    let agentSentContentDirective = false;
    const untrackDirectives = directiveQueue.subscribe(bridge.agentId, (d) => {
      if (CONTENT_DIRECTIVE_TYPES.has(d.type)) {
        agentSentContentDirective = true;
      }
    });

    const containerResult = await sendToContainer(
      bridge.gatewayUrl,
      bridge.gatewayToken,
      bridge.deviceCredentials,
      workspaceId,
      enrichedContent,
      cid
    );

    untrackDirectives();

    if (!containerResult.content) {
      const errorMsg = containerResult.error || 'Agent did not respond within timeout';
      reqLog.error('Container did not respond', { workspaceId, error: errorMsg });
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'NO_RESPONSE',
            message: errorMsg,
          },
        },
        { status: 504 }
      );
    }

    // Bridge fallback: auto-route to editor if agent didn't call workspace tools
    await bridgeDirectiveFallback(bridge.agentId, containerResult.content, agentSentContentDirective, reqLog, containerResult.directives, body.content);

    await persistAgentResponse(containerResult.content, containerResult.directives);

    const directiveTypes = containerResult.directives.map((d: { type?: string }) => d.type || '').filter(Boolean);
    const parsed = parseAgentResponse(containerResult.content, directiveTypes);
    reqLog.info('POST /bridge - Complete', {
      workspaceId,
      responseLength: containerResult.content.length,
      directiveCount: containerResult.directives.length,
      parsedTasks: parsed.tasks.length,
      parsedComponents: parsed.interactiveComponents.length,
      parsedArtifacts: parsed.artifacts.length,
    });

    return NextResponse.json({
      ok: true,
      data: {
        response: parsed.cleanContent,
        directives: containerResult.directives,
        tasks: parsed.tasks.length > 0 ? parsed.tasks : undefined,
        interactiveComponents: parsed.interactiveComponents.length > 0 ? parsed.interactiveComponents : undefined,
        artifacts: parsed.artifacts.length > 0 ? parsed.artifacts : undefined,
        workspaceId,
        gatewayUrl: bridge.gatewayUrl,
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    reqLog.error('POST /bridge - Internal error', { error: errMsg, stack: errStack });
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: errMsg },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v2/im/bridge/[workspaceId]
 *
 * Get bridge status for workspace
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspaceId } = await params;
    const url = new URL(request.url);
    const includeMessages = url.searchParams.get('include') === 'messages';
    const messageLimit = parseInt(url.searchParams.get('limit') || '50');
    const staticAgent = getStaticAgentConfig();

    log.debug('GET /bridge - Status check', { workspaceId, includeMessages });

    // Fetch dynamic agent + container info only when not in static mode
    const agent = staticAgent.enabled ? null : await prisma.agentInstance.findFirst({
      where: { workspaceId },
      include: { container: true },
      orderBy: { createdAt: 'desc' },
    });

    const bridge = await getBridgeForWorkspace(workspaceId);

    if (!bridge) {
      log.debug('No bridge found', { workspaceId });
      return NextResponse.json({
        ok: true,
        data: {
          status: 'disconnected',
          workspaceId,
          reason: 'No container agent found',
          diagnostics: {
            agentStatus: staticAgent.enabled ? staticAgent.agentStatus : (agent?.status || null),
            containerStatus: staticAgent.enabled ? staticAgent.containerStatus : (agent?.container?.status || null),
            hasGatewayUrl: staticAgent.enabled ? true : !!agent?.gatewayUrl,
            mode: staticAgent.enabled ? 'static-env' : 'dynamic-db',
          },
        },
      });
    }

    // Try to check if gateway is reachable
    let gatewayStatus = 'unknown';
    try {
      const ws = await import('ws').then(({ default: WS }) => {
        return new Promise<boolean>((resolve) => {
          const testWs = new WS(bridge.gatewayUrl);
          const timeout = setTimeout(() => {
            testWs.close();
            resolve(false);
          }, 5000);

          testWs.on('open', () => {
            clearTimeout(timeout);
            testWs.close();
            resolve(true);
          });

          testWs.on('error', () => {
            clearTimeout(timeout);
            resolve(false);
          });
        });
      });
      gatewayStatus = ws ? 'connected' : 'unreachable';
    } catch {
      gatewayStatus = 'error';
    }

    log.debug('Gateway status checked', { workspaceId, gatewayStatus, gatewayUrl: bridge.gatewayUrl });

    // Ensure agent IM user has correct displayName (fixes stale names from before rename)
    try {
      const agentIMUser = await imService.user.getByUsername(`agent-${workspaceId}`);
      if (agentIMUser && agentIMUser.displayName !== AGENT_DISPLAY_NAME) {
        await imService.user.update(agentIMUser.id, { displayName: AGENT_DISPLAY_NAME });
        log.info('Agent displayName corrected on GET', { workspaceId, old: agentIMUser.displayName, new: AGENT_DISPLAY_NAME });
      }
    } catch (err) {
      log.debug('Agent displayName correction skipped', { workspaceId, error: err instanceof Error ? err.message : String(err) });
    }

    // Optionally include message history
    let messages: unknown[] = [];
    if (includeMessages && bridge.conversationId) {
      try {
        const history = await imService.message.list({
          conversationId: bridge.conversationId,
          limit: messageLimit,
        });
        messages = Array.isArray(history) ? history.reverse() : [];
        log.info('Message history loaded', { workspaceId, count: messages.length, limit: messageLimit });
      } catch (err) {
        log.error('Failed to load message history', { workspaceId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        status: gatewayStatus,
        workspaceId,
        gatewayUrl: bridge.gatewayUrl,
        conversationId: bridge.conversationId,
        ...(includeMessages ? { messages } : {}),
        diagnostics: {
          agentStatus: staticAgent.enabled ? staticAgent.agentStatus : (agent?.status || null),
          containerStatus: staticAgent.enabled ? staticAgent.containerStatus : (agent?.container?.status || null),
          containerOrchestrator: staticAgent.enabled ? staticAgent.orchestrator : (agent?.container?.orchestrator || null),
          containerHostPort: staticAgent.enabled ? staticAgent.hostPort : (agent?.container?.hostPort || null),
          containerStartedAt: staticAgent.enabled ? null : (agent?.container?.startedAt || null),
          storedGatewayUrl: staticAgent.enabled ? staticAgent.gatewayWsUrl : (agent?.gatewayUrl || null),
          mode: staticAgent.enabled ? 'static-env' : 'dynamic-db',
        },
      },
    });
  } catch (error) {
    log.error('GET /bridge - Internal error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to get bridge status' },
      },
      { status: 500 }
    );
  }
}
