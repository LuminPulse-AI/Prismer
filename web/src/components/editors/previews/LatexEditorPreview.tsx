"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";

import { createEditorEventEmitter } from "@/lib/events";

const emitEvent = createEditorEventEmitter('latex-editor');
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, HighlightStyle } from "@codemirror/language";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { lintKeymap } from "@codemirror/lint";
import { latex } from "codemirror-lang-latex";
import { tags } from "@lezer/highlight";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  FileText,
  Play,
  Download,
  Upload,
  Plus,
  X,
  SplitSquareHorizontal,
  Maximize2,
  Copy,
  Check,
  Bold,
  Italic,
  List,
  ListOrdered,
  Table,
  Code,
  Sigma,
  FileCode,
  RefreshCw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Package,
  FolderOpen,
  FileOutput,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { ComponentPreviewProps } from "@/components/playground/registry";
import { useMultiFieldContentSync } from "@/lib/sync/useContentSync";
import { useComponentStore } from "@/app/workspace/stores/componentStore";
import { useWorkspaceId } from "@/app/workspace/components/WorkspaceContext";
import { TemplateManager } from "./latex-templates/components/TemplateManager";
import type { TemplateFiles } from "./latex-templates/types";
import { PdfViewer } from "./latex-agent";
import { WorkspaceFileBrowser } from "@/components/shared/WorkspaceFileBrowser";

// ============================================================
// Types
// ============================================================

interface TexFile {
  name: string;
  path: string;           // relative path (preserves directory structure for multi-file projects)
  content: string;
  type: "tex" | "bib" | "sty" | "cls";
}

type ViewLayout = "split" | "editor" | "preview";
type PreviewMode = "katex" | "pdf";

// ============================================================
// LaTeX Themes
// ============================================================

const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#1e1e2e",
    color: "#cdd6f4",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#f5e0dc",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "14px",
    lineHeight: "1.6",
  },
  ".cm-cursor": {
    borderLeftColor: "#f5e0dc",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#45475a",
  },
  ".cm-activeLine": {
    backgroundColor: "#313244",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#313244",
  },
  ".cm-gutters": {
    backgroundColor: "#181825",
    color: "#6c7086",
    border: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px",
  },
  ".cm-foldGutter .cm-gutterElement": {
    padding: "0 4px",
  },
  ".cm-tooltip": {
    backgroundColor: "#313244",
    border: "1px solid #45475a",
    borderRadius: "8px",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li": {
      padding: "4px 8px",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "#45475a",
    },
  },
}, { dark: true });

// Syntax highlighting
const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#cba6f7" },
  { tag: tags.comment, color: "#6c7086", fontStyle: "italic" },
  { tag: tags.string, color: "#a6e3a1" },
  { tag: tags.number, color: "#fab387" },
  { tag: tags.operator, color: "#89dceb" },
  { tag: tags.bracket, color: "#f9e2af" },
  { tag: tags.variableName, color: "#f38ba8" },
  { tag: tags.function(tags.variableName), color: "#89b4fa" },
  { tag: tags.definition(tags.variableName), color: "#f38ba8" },
  { tag: tags.typeName, color: "#f9e2af" },
  { tag: tags.className, color: "#f9e2af" },
  { tag: tags.heading, color: "#89b4fa", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
]);

// ============================================================
// Sample LaTeX Files
// ============================================================

const defaultFiles: TexFile[] = [
  {
    name: "main.tex",
    path: "main.tex",
    type: "tex",
    content: `\\documentclass[12pt,a4paper]{article}

% ==================== Packages ====================
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{geometry}
\\usepackage{fancyhdr}
\\usepackage{booktabs}
\\usepackage{xcolor}

% ==================== Page Setup ====================
\\geometry{margin=1in}
\\pagestyle{fancy}
\\fancyhf{}
\\rhead{\\thepage}
\\lhead{VLA-RAIL: Efficient Vision-Language-Action Models}

% ==================== Custom Commands ====================
\\newcommand{\\R}{\\mathbb{R}}
\\DeclareMathOperator{\\softmax}{softmax}
\\DeclareMathOperator{\\attn}{Attention}

% ==================== Document ====================
\\title{VLA-RAIL: Efficient Vision-Language-Action Models for Robot Learning}
\\author{AI Research Assistant}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This paper investigates Vision-Language-Action (VLA) models for robot manipulation tasks.
We present VLA-RAIL, an efficient architecture that achieves 62\\% lower inference latency
compared to existing methods while maintaining 93.4\\% task success rate.
Our approach combines compact vision encoders with action-specific decoders,
enabling real-time robot control on edge devices.
\\end{abstract}

\\tableofcontents

\\section{Introduction}

Vision-Language-Action (VLA) models represent a new paradigm for robot learning,
combining visual perception, language understanding, and action generation in a unified framework.
Recent advances in foundation models have enabled significant progress in this area.

% [AI Assistant will expand this section]

\\section{Related Work}

\\subsection{Vision-Language Models}

Large vision-language models such as CLIP \\cite{radford2021clip} and BLIP have demonstrated
remarkable capabilities in understanding visual content through natural language.

\\subsection{Robot Learning}

Traditional approaches to robot manipulation include imitation learning and reinforcement learning.
Recent work has explored using large language models to guide robot actions.

\\section{Methodology}

% [AI Assistant will expand this section based on benchmark results]

\\section{Experiments}

% [AI Assistant will insert benchmark results and visualizations here]

\\section{Conclusion}

% [AI Assistant will expand this section]

\\bibliographystyle{plain}
\\bibliography{references}

\\end{document}
`,
  },
  {
    name: "references.bib",
    path: "references.bib",
    type: "bib",
    content: `@article{brohan2023rt1,
    author = {Brohan, Anthony and Brown, Noah and Carbajal, Justice and Chebotar, Yevgen and others},
    title = {RT-1: Robotics Transformer for Real-World Control at Scale},
    journal = {arXiv preprint arXiv:2212.06817},
    year = {2023}
}

@article{kim2024openvla,
    author = {Kim, Moo Jin and Pertsch, Karl and Karamcheti, Siddharth and others},
    title = {OpenVLA: An Open-Source Vision-Language-Action Model},
    journal = {arXiv preprint arXiv:2406.09246},
    year = {2024}
}

@inproceedings{radford2021clip,
    author = {Radford, Alec and Kim, Jong Wook and Hallacy, Chris and others},
    title = {Learning Transferable Visual Models From Natural Language Supervision},
    booktitle = {International Conference on Machine Learning (ICML)},
    year = {2021},
    pages = {8748--8763}
}

@inproceedings{vaswani2017attention,
    author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N and Kaiser, Lukasz and Polosukhin, Illia},
    title = {Attention is All You Need},
    booktitle = {Advances in Neural Information Processing Systems (NeurIPS)},
    year = {2017},
    volume = {30}
}

@article{zitkovich2023rt2,
    author = {Zitkovich, Brianna and Yu, Tianhe and Xu, Sichun and others},
    title = {RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control},
    journal = {arXiv preprint arXiv:2307.15818},
    year = {2023}
}
`,
  },
  {
    name: "custom.sty",
    path: "custom.sty",
    type: "sty",
    content: `% Custom style file for VLA-RAIL paper
\\ProvidesPackage{custom}[2025/01/01 VLA-RAIL Package]

% Additional packages
\\RequirePackage{tikz}
\\RequirePackage{algorithm}
\\RequirePackage{algorithmic}

% Custom colors for diagrams
\\definecolor{swinblue}{RGB}{66, 133, 244}
\\definecolor{swingreen}{RGB}{52, 168, 83}
\\definecolor{swinorange}{RGB}{251, 188, 4}
\\definecolor{swinred}{RGB}{234, 67, 53}

% Attention notation
\\newcommand{\\query}{\\mathbf{Q}}
\\newcommand{\\key}{\\mathbf{K}}
\\newcommand{\\value}{\\mathbf{V}}

% Window size notation
\\newcommand{\\windowsize}{M}
\\newcommand{\\patchsize}{P}

% Custom environments
\\newtheorem{definition}{Definition}
\\newtheorem{proposition}{Proposition}

% Math operators
\\DeclareMathOperator{\\MSA}{MSA}
\\DeclareMathOperator{\\WMSA}{W\\text{-}MSA}
\\DeclareMathOperator{\\SWMSA}{SW\\text{-}MSA}
\\DeclareMathOperator{\\LN}{LN}
\\DeclareMathOperator{\\MLP}{MLP}
`,
  },
];

// ============================================================
// LaTeX Snippets for Toolbar
// ============================================================

const latexSnippets = {
  bold: { label: "Bold", snippet: "\\textbf{|}", icon: Bold },
  italic: { label: "Italic", snippet: "\\textit{|}", icon: Italic },
  itemize: { label: "Bullet List", snippet: "\\begin{itemize}\n    \\item |\n\\end{itemize}", icon: List },
  enumerate: { label: "Numbered List", snippet: "\\begin{enumerate}\n    \\item |\n\\end{enumerate}", icon: ListOrdered },
  table: { label: "Table", snippet: "\\begin{table}[htbp]\n    \\centering\n    \\begin{tabular}{|c|c|c|}\n        \\hline\n        A & B & C \\\\\n        \\hline\n        1 & 2 & 3 \\\\\n        \\hline\n    \\end{tabular}\n    \\caption{Caption}\n    \\label{tab:label}\n\\end{table}", icon: Table },
  code: { label: "Code Block", snippet: "\\begin{lstlisting}[language=|]\n\n\\end{lstlisting}", icon: Code },
  equation: { label: "Equation", snippet: "\\begin{equation}\n    |\n\\end{equation}", icon: Sigma },
  fraction: { label: "Fraction", snippet: "\\frac{|}{}", icon: Sigma },
  sqrt: { label: "Square Root", snippet: "\\sqrt{|}", icon: Sigma },
  sum: { label: "Summation", snippet: "\\sum_{i=1}^{n} |", icon: Sigma },
  integral: { label: "Integral", snippet: "\\int_{a}^{b} | \\, dx", icon: Sigma },
};

// ============================================================
// Preview Renderer
// ============================================================

function renderLatexPreview(content: string): string {
  // Extract and render math expressions
  let html = content;

  // Remove LaTeX document structure for preview
  html = html.replace(/\\documentclass.*?\n/g, "");
  html = html.replace(/\\usepackage.*?\n/g, "");
  html = html.replace(/\\geometry.*?\n/g, "");
  html = html.replace(/\\pagestyle.*?\n/g, "");
  html = html.replace(/\\fancyhf.*?\n/g, "");
  html = html.replace(/\\[rl]head.*?\n/g, "");
  html = html.replace(/\\newcommand.*?\n/g, "");
  html = html.replace(/\\begin{document}/g, "");
  html = html.replace(/\\end{document}/g, "");
  html = html.replace(/\\maketitle/g, "");
  html = html.replace(/\\tableofcontents/g, '<div class="toc">[Table of Contents]</div>');

  // Title, author, date
  const titleMatch = html.match(/\\title\{([^}]+)\}/);
  const authorMatch = html.match(/\\author\{([^}]+)\}/);
  const dateMatch = html.match(/\\date\{([^}]+)\}/);

  if (titleMatch) {
    html = html.replace(/\\title\{[^}]+\}/, "");
    html = `<h1 class="title">${titleMatch[1]}</h1>` + html;
  }
  if (authorMatch) {
    html = html.replace(/\\author\{[^}]+\}/, "");
    html = html.replace(/<h1/, `<p class="author">${authorMatch[1]}</p><h1`);
  }
  if (dateMatch) {
    const date = dateMatch[1] === "\\today" ? new Date().toLocaleDateString() : dateMatch[1];
    html = html.replace(/\\date\{[^}]+\}/, "");
    html = html.replace(/<h1/, `<p class="date">${date}</p><h1`);
  }

  // Sections
  html = html.replace(/\\section\{([^}]+)\}/g, '<h2 class="section">$1</h2>');
  html = html.replace(/\\subsection\{([^}]+)\}/g, '<h3 class="subsection">$1</h3>');
  html = html.replace(/\\subsubsection\{([^}]+)\}/g, '<h4 class="subsubsection">$1</h4>');

  // Abstract
  html = html.replace(/\\begin{abstract}([\s\S]*?)\\end{abstract}/g, '<div class="abstract"><strong>Abstract:</strong>$1</div>');

  // Text formatting
  html = html.replace(/\\textbf\{([^}]+)\}/g, "<strong>$1</strong>");
  html = html.replace(/\\textit\{([^}]+)\}/g, "<em>$1</em>");
  html = html.replace(/\\texttt\{([^}]+)\}/g, "<code>$1</code>");
  html = html.replace(/\\underline\{([^}]+)\}/g, "<u>$1</u>");
  html = html.replace(/\\emph\{([^}]+)\}/g, "<em>$1</em>");

  // Lists
  html = html.replace(/\\begin{itemize}([\s\S]*?)\\end{itemize}/g, (_, items) => {
    const listItems = items
      .split(/\\item/)
      .filter((item: string) => item.trim())
      .map((item: string) => `<li>${item.trim()}</li>`)
      .join("");
    return `<ul>${listItems}</ul>`;
  });

  html = html.replace(/\\begin{enumerate}([\s\S]*?)\\end{enumerate}/g, (_, items) => {
    const listItems = items
      .split(/\\item/)
      .filter((item: string) => item.trim())
      .map((item: string) => `<li>${item.trim()}</li>`)
      .join("");
    return `<ol>${listItems}</ol>`;
  });

  // Theorems and proofs
  html = html.replace(/\\begin{theorem}(?:\[([^\]]+)\])?([\s\S]*?)\\end{theorem}/g,
    (_, title, content) => `<div class="theorem"><strong>Theorem${title ? ` (${title})` : ""}:</strong>${content}</div>`);
  html = html.replace(/\\begin{proof}([\s\S]*?)\\end{proof}/g,
    '<div class="proof"><em>Proof:</em>$1 <span class="qed">□</span></div>');
  html = html.replace(/\\begin{lemma}([\s\S]*?)\\end{lemma}/g,
    '<div class="lemma"><strong>Lemma:</strong>$1</div>');
  html = html.replace(/\\begin{definition}([\s\S]*?)\\end{definition}/g,
    '<div class="definition"><strong>Definition:</strong>$1</div>');

  // Code listings (simplified)
  html = html.replace(/\\begin{lstlisting}(?:\[[^\]]*\])?([\s\S]*?)\\end{lstlisting}/g,
    '<pre class="code-block"><code>$1</code></pre>');

  // Display math environments
  html = html.replace(/\\begin{equation}([\s\S]*?)\\end{equation}/g, (_, math) => {
    try {
      return `<div class="math-display">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="math-display math-error">${math}</div>`;
    }
  });

  html = html.replace(/\\begin{align}([\s\S]*?)\\end{align}/g, (_, math) => {
    try {
      // Convert align to aligned for KaTeX
      const aligned = math.replace(/&/g, "&").replace(/\\\\/g, "\\\\");
      return `<div class="math-display">${katex.renderToString(`\\begin{aligned}${aligned}\\end{aligned}`, { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="math-display math-error">${math}</div>`;
    }
  });

  // Display math with \[ \]
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    try {
      return `<div class="math-display">${katex.renderToString(math.trim(), { displayMode: true, throwOnError: false })}</div>`;
    } catch {
      return `<div class="math-display math-error">${math}</div>`;
    }
  });

  // Inline math with $ $
  html = html.replace(/\$([^$]+)\$/g, (_, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch {
      return `<span class="math-error">${math}</span>`;
    }
  });

  // Remove remaining LaTeX commands
  html = html.replace(/\\label\{[^}]+\}/g, "");
  html = html.replace(/\\ref\{([^}]+)\}/g, "[$1]");
  html = html.replace(/\\cite\{([^}]+)\}/g, "[$1]");
  html = html.replace(/\\[a-zA-Z]+\{[^}]*\}/g, "");

  // Clean up extra whitespace
  html = html.replace(/\n{3,}/g, "\n\n");

  return html;
}

// ============================================================
// Main Component
// ============================================================

const emptyLatexTemplate: TexFile[] = [
  { name: 'main.tex', path: 'main.tex', content: '\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath}\n\n\\title{Untitled}\n\\author{}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n\n\n\\end{document}', type: 'tex' },
];

function parseStoredFiles(stored: string | undefined): TexFile[] | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].name && parsed[0].content) {
      // Add path field if missing (backward compat with old stored data)
      return parsed.map((f: TexFile) => ({ ...f, path: f.path || f.name }));
    }
  } catch { /* ignore */ }
  return null;
}

export default function LatexEditorPreview({ onOutput }: ComponentPreviewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeFileRef = useRef<string>("main.tex");

  // Read initial state from workspace store (populated by loadWorkspace → DB)
  const storedLatexState = useComponentStore(
    (s) => s.componentStates['latex-editor']
  );
  const workspaceId = useWorkspaceId();
  const isDefaultWorkspace = workspaceId === 'default';

  // Use workspace-aware compile endpoint when available
  const compileUrl = isDefaultWorkspace
    ? '/api/latex/compile'
    : `/api/workspace/${workspaceId}/latex-compile`;

  // Determine initial files: stored > empty template (real ws) > demo (default)
  const initialFiles = useMemo(() => {
    const fromStore = parseStoredFiles(storedLatexState?.content as string | undefined);
    if (fromStore) return fromStore;
    return isDefaultWorkspace ? defaultFiles : emptyLatexTemplate;
  }, []); // Only compute once on mount

  const [files, setFiles] = useState<TexFile[]>(initialFiles);
  const [activeFile, setActiveFile] = useState<string>(
    (storedLatexState?.activeFile as string) || initialFiles[0]?.name || "main.tex"
  );

  // Handle store content changes: initial DB load + directive-driven updates.
  // The store is updated by both DB load (initial) and executeDirective
  // (when UPDATE_LATEX_PROJECT arrives before this component mounts).
  const lastAppliedContentRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const storeContent = storedLatexState?.content as string | undefined;
    // Skip if content hasn't changed since last application
    if (!storeContent || storeContent === lastAppliedContentRef.current) return;
    const fromStore = parseStoredFiles(storeContent);
    if (fromStore) {
      setFiles(fromStore);
      lastAppliedContentRef.current = storeContent;
      if (storedLatexState?.activeFile) {
        setActiveFile(storedLatexState.activeFile as string);
      }
    }
  }, [storedLatexState]);

  // Load project files from WorkspaceFile DB (the single source of truth).
  // Called on mount and after directive events to ensure consistency.
  const loadProjectFilesRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const loadProjectFilesTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasLoadedProjectFiles = useRef(false);

  const loadProjectFiles = useCallback(async () => {
    if (isDefaultWorkspace) return;
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/files`);
      const data = await res.json();
      if (!data.success || !data.data?.files) return;

      // Filter for latex/ prefix files
      const latexFiles = (data.data.files as Array<{ path: string }>).filter(
        (f) => f.path.startsWith('latex/')
      );

      if (latexFiles.length === 0) return; // no project files, keep current state

      // Fetch content for each file
      const fileContents = await Promise.all(
        latexFiles.map(async (f) => {
          const contentRes = await fetch(`/api/workspace/${workspaceId}/files/${f.path}`);
          const contentData = await contentRes.json();
          const relativePath = f.path.replace('latex/', '');
          const ext = relativePath.split('.').pop()?.toLowerCase() || '';
          return {
            name: relativePath.split('/').pop() || relativePath,
            path: relativePath,
            content: contentData.data?.content || '',
            type: (['tex', 'bib', 'sty', 'cls'].includes(ext) ? ext : 'tex') as TexFile['type'],
          };
        })
      );

      if (fileContents.length > 0) {
        // Merge DB files with existing directive-provided files rather than
        // replacing. Directive data is authoritative when the DB sync hasn't
        // caught up yet (async fire-and-forget in directive middleware).
        setFiles(prev => {
          const merged = new Map<string, typeof fileContents[0]>();
          // Start with existing (directive-provided) files
          for (const f of prev) merged.set(f.name, f);
          // Layer DB files: only overwrite if DB has non-empty content
          for (const f of fileContents) {
            const existing = merged.get(f.name);
            if (!existing || (f.content && f.content.length > 0)) {
              merged.set(f.name, f);
            }
          }
          return Array.from(merged.values());
        });
        // Only switch active file on initial load, not on refreshes
        if (!hasLoadedProjectFiles.current) {
          const mainFile = fileContents.find(f => f.name === 'main.tex') || fileContents[0];
          setActiveFile(mainFile.name);
        }
        console.log('[LaTeX] Loaded', fileContents.length, 'project files from DB (merged)');
      }
    } catch (err) {
      console.error('[LaTeX] Failed to load project files from DB:', err);
    }
  }, [workspaceId, isDefaultWorkspace]);

  loadProjectFilesRef.current = loadProjectFiles;

  // Debounced DB refresh — used by directive handlers to pick up all files
  // written during an agent run (directive middleware syncs to DB automatically)
  const scheduleDbRefresh = useCallback(() => {
    if (isDefaultWorkspace) return;
    if (loadProjectFilesTimerRef.current) clearTimeout(loadProjectFilesTimerRef.current);
    loadProjectFilesTimerRef.current = setTimeout(() => {
      loadProjectFilesRef.current?.();
    }, 500);
  }, [isDefaultWorkspace]);

  // Load from DB on mount
  useEffect(() => {
    if (isDefaultWorkspace || hasLoadedProjectFiles.current) return;
    hasLoadedProjectFiles.current = true;
    loadProjectFiles();
  }, [workspaceId, isDefaultWorkspace, loadProjectFiles]);

  const [layout, setLayout] = useState<ViewLayout>("split");
  const [copied, setCopied] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const autoRefreshRef = useRef(true);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  
  const [previewMode, setPreviewMode] = useState<PreviewMode>("katex");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [texliveAvailable, setTexliveAvailable] = useState<boolean | null>(null);
  const pdfCompileTimerRef = useRef<NodeJS.Timeout | null>(null);
  const texliveAvailableRef = useRef<boolean>(false);

  // If compile directives arrived before this component mounted, hydrate compile result from store.
  useEffect(() => {
    const storedPdf = storedLatexState?.compiledPdfUrl as string | undefined;
    if (storedPdf && storedPdf !== pdfDataUrl) {
      setPdfDataUrl(storedPdf);
      setPreviewMode('pdf');
      setIsCompiling(false);
      setCompileError(null);
    }
  }, [storedLatexState, pdfDataUrl]);

  // Restore compiled PDF from DB when no in-memory PDF and no store PDF available
  const hasRestoredPdfRef = useRef(false);
  useEffect(() => {
    if (isDefaultWorkspace || hasRestoredPdfRef.current || pdfDataUrl) return;
    const storedPdf = storedLatexState?.compiledPdfUrl as string | undefined;
    if (storedPdf) return; // store already has it, let the effect above handle it
    hasRestoredPdfRef.current = true;
    fetch(`/api/workspace/${workspaceId}/files/output/compiled.pdf.b64`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json.data?.content) {
          setPdfDataUrl(json.data.content);
          setPreviewMode('pdf');
        }
      })
      .catch(() => {}); // silent fail
  }, [workspaceId, isDefaultWorkspace, pdfDataUrl, storedLatexState]);

  /** Fire-and-forget save of compiled PDF to WorkspaceFile for restore on refresh */
  const savePdfToDb = useCallback((dataUrl: string) => {
    if (isDefaultWorkspace) return;
    fetch(`/api/workspace/${workspaceId}/files/output/compiled.pdf.b64`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: dataUrl }),
    }).catch(() => {});
  }, [workspaceId, isDefaultWorkspace]);

  const hasCompileSuccess = !!pdfDataUrl && !isCompiling && !compileError;

  const currentFile = useMemo(
    () => files.find((f) => f.name === activeFile),
    [files, activeFile]
  );

  // Keep refs in sync with state for use in closures (avoid stale closures in EditorView)
  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    autoRefreshRef.current = autoRefresh;
  }, [autoRefresh]);

  // Debounced content sync to componentStore (serialize full file set)
  const syncLatexState = useMultiFieldContentSync('latex-editor', 1000);
  useEffect(() => {
    syncLatexState({
      activeFile,
      content: JSON.stringify(files),
    });
  }, [activeFile, files, syncLatexState]);

  // Emit ready event on mount
  useEffect(() => {
    emitEvent({ type: 'ready' });
  }, []);

  // Listen for demo commands
  useEffect(() => {
    const handleUpdateLatex = (e: CustomEvent<{ file: string; content: string }>) => {
      const { file, content } = e.detail;
      
      // Update file content
      setFiles(prev => {
        const existing = prev.find(f => f.name === file);
        if (existing) {
          return prev.map(f => f.name === file ? { ...f, content } : f);
        } else {
          return [...prev, { name: file, path: file, content, type: 'tex' as const }];
        }
      });
      setActiveFile(file);

      // Emit content loaded event
      emitEvent({
        type: 'contentLoaded',
        payload: { action: 'update_content', result: { file } },
      });
    };

    const handleCompileLatex = () => {
      const mainFile = files.find(f => f.name.endsWith('.tex'));
      if (mainFile && texliveAvailableRef.current) {
        // Trigger compile - handleCompilePDF will emit the completion event
        setIsCompiling(true);
        fetch(compileUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: mainFile.content,
            filename: mainFile.name.replace('.tex', ''),
          }),
        })
          .then(res => res.json())
          .then(result => {
            if (result.success && result.pdfDataUrl) {
              setPdfDataUrl(result.pdfDataUrl);
              setPdfFileUrl(result.pdfUrl);
              setPreviewMode('pdf');

              savePdfToDb(result.pdfDataUrl);

              emitEvent({
                type: 'actionComplete',
                payload: { action: 'compile', result: { success: true, pdfUrl: result.pdfUrl } },
              });
            } else {
              setCompileError(result.error || 'Compilation failed');

              emitEvent({
                type: 'actionFailed',
                payload: { action: 'compile', error: new Error(result.error || 'Compilation failed') },
              });
            }
          })
          .catch(err => {
            setCompileError(err.message);
            
            emitEvent({
              type: 'actionFailed',
              payload: { action: 'compile', error: err },
            });
          })
          .finally(() => setIsCompiling(false));
      }
    };

    // ============================================================
    // Agent Directive Handlers (from Agent Server via WebSocket)
    // ============================================================
    
    // Handle UPDATE_LATEX directive from Agent Server
    const handleAgentUpdateLatex = (e: CustomEvent<{ file: string; content: string }>) => {
      console.log('[LaTeX] Agent UPDATE_LATEX:', e.detail.file);
      handleUpdateLatex(e);
    };
    
    // Handle COMPILE_LATEX directive from Agent Server
    const handleAgentCompileLatex = () => {
      console.log('[LaTeX] Agent COMPILE_LATEX');
      handleCompileLatex();
    };

    // ============================================================
    // LaTeX Project Directive Handlers (multi-file)
    // ============================================================

    // Handle UPDATE_LATEX_PROJECT directive (agent wrote a file to the project)
    // DB sync is handled by directive middleware (FILE_SYNC_TRIGGERS) — no frontend PUT needed.
    const handleProjectUpdate = (e: CustomEvent<{
      operation: string;
      file: string;
      content: string;
      projectFiles: Array<{ path: string; type: string }>;
    }>) => {
      const { file, content } = e.detail;
      console.log('[LaTeX] Agent UPDATE_LATEX_PROJECT:', file);

      // Infer file type from extension
      const ext = file.split('.').pop()?.toLowerCase() || '';
      const type = (['tex', 'bib', 'sty', 'cls'].includes(ext) ? ext : 'tex') as TexFile['type'];

      // Update local state immediately from directive data (fast UX)
      const fileName = file.split('/').pop() || file;
      setFiles(prev => {
        const existing = prev.find(f => f.path === file || f.name === file);
        if (existing) {
          return prev.map(f => (f.path === file || f.name === file) ? { ...f, content } : f);
        } else {
          return [...prev, { name: fileName, path: file, content, type }];
        }
      });
      setActiveFile(file);

      // Schedule a debounced DB refresh to pick up all project files
      // (covers cases where multiple files were written in one agent run)
      scheduleDbRefresh();

      emitEvent({
        type: 'contentLoaded',
        payload: { action: 'update_content', result: { file } },
      });
    };

    // Handle DELETE_LATEX_PROJECT_FILE directive
    const handleProjectDelete = (e: CustomEvent<{
      file: string;
      projectFiles: Array<{ path: string; type: string }>;
    }>) => {
      const { file } = e.detail;
      console.log('[LaTeX] Agent DELETE_LATEX_PROJECT_FILE:', file);

      setFiles(prev => {
        const filtered = prev.filter(f => f.path !== file && f.name !== file);
        // If deleted file was active, switch to first remaining file
        if (activeFile === file && filtered.length > 0) {
          setActiveFile(filtered[0].name);
        }
        return filtered;
      });

      // Schedule DB refresh to stay in sync
      scheduleDbRefresh();
    };

    // Handle LATEX_PROJECT_COMPILE_COMPLETE directive
    const handleProjectCompileComplete = (e: CustomEvent<{
      pdfBase64: string;
      log?: string;
      warnings?: string[];
    }>) => {
      const { pdfBase64, log, warnings } = e.detail;
      console.log('[LaTeX] Agent LATEX_PROJECT_COMPILE_COMPLETE');

      if (pdfBase64) {
        setPdfDataUrl(`data:application/pdf;base64,${pdfBase64}`);
        setPreviewMode('pdf');
        setCompileError(null);
        setIsCompiling(false);

        emitEvent({
          type: 'actionComplete',
          payload: { action: 'compile', result: { success: true } },
        });
      }
      if (warnings && warnings.length > 0) {
        console.log('[LaTeX] Compile warnings:', warnings);
      }
      if (log) {
        console.log('[LaTeX] Compile log (last 500 chars):', log.slice(-500));
      }
    };

    // Handle single-file LATEX_COMPILE_COMPLETE directive (pdfDataUrl from agent)
    const handleAgentCompileComplete = (e: CustomEvent<{
      pdfDataUrl: string;
      filename?: string;
    }>) => {
      const { pdfDataUrl: pdf } = e.detail;
      console.log('[LaTeX] Agent LATEX_COMPILE_COMPLETE (single-file)');
      if (pdf) {
        setPdfDataUrl(pdf);
        setPreviewMode('pdf');
        setIsCompiling(false);
        setCompileError(null);
        emitEvent({
          type: 'actionComplete',
          payload: { action: 'compile', result: { success: true } },
        });
      }
    };

    window.addEventListener('demo:updateLatex', handleUpdateLatex as EventListener);
    window.addEventListener('demo:compileLatex', handleCompileLatex as EventListener);

    // Agent directive listeners
    window.addEventListener('agent:directive:UPDATE_LATEX', handleAgentUpdateLatex as EventListener);
    window.addEventListener('agent:directive:COMPILE_LATEX', handleAgentCompileLatex as EventListener);
    window.addEventListener('agent:directive:LATEX_COMPILE_COMPLETE', handleAgentCompileComplete as EventListener);

    // Project directive listeners
    window.addEventListener('agent:directive:UPDATE_LATEX_PROJECT', handleProjectUpdate as EventListener);
    window.addEventListener('agent:directive:DELETE_LATEX_PROJECT_FILE', handleProjectDelete as EventListener);
    window.addEventListener('agent:directive:LATEX_PROJECT_COMPILE_COMPLETE', handleProjectCompileComplete as EventListener);

    return () => {
      window.removeEventListener('demo:updateLatex', handleUpdateLatex as EventListener);
      window.removeEventListener('demo:compileLatex', handleCompileLatex as EventListener);

      // Remove agent directive listeners
      window.removeEventListener('agent:directive:UPDATE_LATEX', handleAgentUpdateLatex as EventListener);
      window.removeEventListener('agent:directive:COMPILE_LATEX', handleAgentCompileLatex as EventListener);
      window.removeEventListener('agent:directive:LATEX_COMPILE_COMPLETE', handleAgentCompileComplete as EventListener);

      // Remove project directive listeners
      window.removeEventListener('agent:directive:UPDATE_LATEX_PROJECT', handleProjectUpdate as EventListener);
      window.removeEventListener('agent:directive:DELETE_LATEX_PROJECT_FILE', handleProjectDelete as EventListener);
      window.removeEventListener('agent:directive:LATEX_PROJECT_COMPILE_COMPLETE', handleProjectCompileComplete as EventListener);
    };
  }, [files, activeFile, isDefaultWorkspace, workspaceId]);

  // Check if TeXLive is available and set default preview mode
  useEffect(() => {
    console.log('[LaTeX] Checking TeXLive availability...');
    fetch(compileUrl)
      .then(res => res.json())
      .then(data => {
        console.log('[LaTeX] TeXLive check result:', data);
        setTexliveAvailable(data.available);
        texliveAvailableRef.current = data.available;
        // If TeXLive is available, default to PDF preview mode and auto-compile
        if (data.available) {
          setPreviewMode('pdf');
          // Initial compile - execute immediately
          const mainFile = files.find(f => f.name.endsWith('.tex'));
          if (mainFile) {
            console.log('[LaTeX] Initial PDF compile for:', mainFile.name);
            setIsCompiling(true);
            // Call the API directly instead of through handleCompilePDF (to avoid closure issues)
            const allContent = files.map(f => f.content).join('\n');
            const needsXe = /\\usepackage\{fontspec\}|\\documentclass\{awesome-cv\}|\\usepackage\{fontawesome5?\}/
              .test(allContent);
            fetch(compileUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: mainFile.content,
                filename: mainFile.name.replace('.tex', ''),
                files: files.map(f => ({ path: f.path || f.name, content: f.content })),
                mainFile: mainFile.path || mainFile.name,
                engine: needsXe ? 'xelatex' : 'pdflatex',
              }),
            })
              .then(res => res.json())
              .then(result => {
                console.log('[LaTeX] Initial compile result:', result);
                if (result.success && result.pdfDataUrl) {
                  setPdfDataUrl(result.pdfDataUrl);
                  setPdfFileUrl(result.pdfUrl);
                  setCompileError(null);
                  savePdfToDb(result.pdfDataUrl);
                } else if (!pdfDataUrl) {
                  // Only set error if no PDF already loaded (e.g. from agent directive)
                  setCompileError(result.error || 'Initial compilation failed');
                }
              })
              .catch(err => {
                console.error('[LaTeX] Initial compile error:', err);
                setCompileError('Failed to compile PDF');
              })
              .finally(() => {
                setIsCompiling(false);
              });
          }
        }
      })
      .catch((err) => {
        console.error('[LaTeX] TeXLive check error:', err);
        setTexliveAvailable(false);
        texliveAvailableRef.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic TeXLive availability polling (every 30s)
  useEffect(() => {
    const interval = setInterval(() => {
      fetch(compileUrl)
        .then(res => res.json())
        .then(data => {
          const wasAvailable = texliveAvailableRef.current;
          setTexliveAvailable(data.available);
          texliveAvailableRef.current = data.available;
          if (data.available !== wasAvailable) {
            console.log('[LaTeX] TeXLive status changed:', data.available);
          }
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const initialTheme = [darkTheme, syntaxHighlighting(darkHighlightStyle)];

    const state = EditorState.create({
      doc: currentFile?.content || "",
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        latex({
          autoCloseTags: true,
          enableLinting: true,
          enableTooltips: true,
        }),
        ...initialTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const content = update.state.doc.toString();
            // Use refs to get current values (avoids stale closures)
            const currentActiveFile = activeFileRef.current;
            setFiles((prev) =>
              prev.map((f) =>
                f.name === currentActiveFile ? { ...f, content } : f
              )
            );
            if (autoRefreshRef.current) {
              setPreviewHtml(renderLatexPreview(content));
            }
          }
        }),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Initial preview
    if (currentFile) {
      setPreviewHtml(renderLatexPreview(currentFile.content));
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Update editor content when switching files
  useEffect(() => {
    if (!viewRef.current || !currentFile) return;

    const currentContent = viewRef.current.state.doc.toString();
    if (currentContent !== currentFile.content) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: currentFile.content,
        },
      });
      setPreviewHtml(renderLatexPreview(currentFile.content));
    }
  }, [activeFile, currentFile]);

  // Report state to parent
  useEffect(() => {
    if (onOutput) {
      onOutput({
        activeFile,
        totalFiles: files.length,
        content: currentFile?.content.slice(0, 200),
      });
    }
  }, [activeFile, files, currentFile, onOutput]);

  // Auto-compile PDF when content changes (debounced)
  useEffect(() => {
    if (!texliveAvailable || !currentFile || !autoRefresh) {
      console.log('[LaTeX] Auto-compile skipped:', { texliveAvailable, hasCurrentFile: !!currentFile, autoRefresh });
      return;
    }
    
    // Clear any existing timer
    if (pdfCompileTimerRef.current) {
      clearTimeout(pdfCompileTimerRef.current);
    }
    
    // Set a new timer - compile 2 seconds after last change
    pdfCompileTimerRef.current = setTimeout(() => {
      if (currentFile.name.endsWith('.tex')) {
        console.log('[LaTeX] Auto-compiling PDF for:', currentFile.name);
        handleCompilePDF(currentFile.content, currentFile.name.replace('.tex', ''));
      }
    }, 2000);
    
    return () => {
      if (pdfCompileTimerRef.current) {
        clearTimeout(pdfCompileTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.content, texliveAvailable, autoRefresh]);

  // Insert snippet
  const insertSnippet = useCallback((snippet: string) => {
    if (!viewRef.current) return;

    const cursorPos = snippet.indexOf("|");
    const cleanSnippet = snippet.replace("|", "");
    const selection = viewRef.current.state.selection.main;

    viewRef.current.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: cleanSnippet,
      },
      selection: {
        anchor: selection.from + (cursorPos >= 0 ? cursorPos : cleanSnippet.length),
      },
    });

    viewRef.current.focus();
    setShowSnippets(false);
  }, []);

  // Copy content
  const handleCopy = useCallback(async () => {
    if (currentFile) {
      await navigator.clipboard.writeText(currentFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [currentFile]);

  // Download file
  const handleDownload = useCallback(() => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFile.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [currentFile]);

  // Download compiled PDF
  const handleDownloadPdf = useCallback(() => {
    if (!pdfDataUrl) return;
    const base64 = pdfDataUrl.split(',')[1];
    if (!base64) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compiled.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pdfDataUrl]);

  // Download all project files as ZIP
  const handleDownloadZip = useCallback(async () => {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.path || file.name, file.content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'latex-project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [files]);

  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Handle file selected from WorkspaceFileBrowser
  const handleFileFromBrowser = useCallback((file: { path: string; content: string }) => {
    if (file.path.endsWith('.pdf.b64') && file.content.startsWith('data:application/pdf')) {
      // Restore compiled PDF
      setPdfDataUrl(file.content);
      setPreviewMode('pdf');
    } else {
      // Restore a source file — add or replace in editor
      const name = file.path.replace(/^latex\//, '');
      const ext = name.split('.').pop()?.toLowerCase();
      const type = (ext === 'bib' ? 'bib' : ext === 'sty' ? 'sty' : ext === 'cls' ? 'cls' : 'tex') as TexFile['type'];
      setFiles((prev) => {
        const idx = prev.findIndex((f) => f.name === name);
        const updated: TexFile = { name, path: name, content: file.content, type };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [...prev, updated];
      });
      setActiveFile(name);
    }
  }, []);

  // Close download menu on outside click
  useEffect(() => {
    if (!showDownloadMenu) return;
    const close = () => setShowDownloadMenu(false);
    document.addEventListener('click', close, { once: true });
    return () => document.removeEventListener('click', close);
  }, [showDownloadMenu]);

  // Add new file
  const handleAddFile = useCallback(() => {
    const name = prompt("Enter file name (e.g., chapter1.tex):");
    if (name && !files.find((f) => f.name === name)) {
      const ext = name.split(".").pop()?.toLowerCase();
      const type = (ext === "bib" ? "bib" : ext === "sty" ? "sty" : ext === "cls" ? "cls" : "tex") as TexFile["type"];
      setFiles((prev) => [...prev, { name, path: name, content: "", type }]);
      setActiveFile(name);
    }
  }, [files]);

  // Close file
  const handleCloseFile = useCallback(
    (filename: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (files.length <= 1) return;

      setFiles((prev) => prev.filter((f) => f.name !== filename));
      if (activeFile === filename) {
        const remaining = files.filter((f) => f.name !== filename);
        setActiveFile(remaining[0]?.name || "");
      }
    },
    [files, activeFile]
  );

  // Compile to PDF
  const handleCompilePDF = useCallback(async (fileContent?: string, fileName?: string) => {
    const content = fileContent || currentFile?.content;
    const name = fileName || currentFile?.name.replace('.tex', '');

    if (!content || isCompiling) return;

    setIsCompiling(true);
    setCompileError(null);

    try {
      // Multi-file mode: send all project files with their relative paths
      const projectFiles = files.map(f => ({ path: f.path || f.name, content: f.content }));
      const mainFile = currentFile?.path
        || (name ? `${name}.tex` : (files.find(f => f.name.endsWith('.tex'))?.path || 'main.tex'));

      // Auto-detect engine: use xelatex if content uses fontspec/fontawesome or
      // if any project file is a cls that requires it (e.g. awesome-cv)
      const allContent = files.map(f => f.content).join('\n');
      const needsXelatex = /\\usepackage\{fontspec\}|\\documentclass\{awesome-cv\}|\\usepackage\{fontawesome5?\}/
        .test(allContent);
      const engine = needsXelatex ? 'xelatex' : 'pdflatex';

      const response = await fetch(compileUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,           // backward compatible single-file content
          filename: name,    // backward compatible filename
          files: projectFiles,  // multi-file project
          mainFile,             // main .tex entry point
          engine,               // pdflatex or xelatex
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.pdfDataUrl) {
        setPdfDataUrl(data.pdfDataUrl);
        setPdfFileUrl(data.pdfUrl);
        setPreviewMode('pdf');

        savePdfToDb(data.pdfDataUrl);

        // Emit success event for demo flow
        emitEvent({
          type: 'actionComplete',
          payload: { action: 'compile', result: { success: true, pdfUrl: data.pdfUrl } },
        });
      } else {
        setCompileError(data.error || 'Compilation failed');

        // Emit failure event
        emitEvent({
          type: 'actionFailed',
          payload: { action: 'compile', error: new Error(data.error || 'Compilation failed') },
        });
      }
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : 'Unknown error');

      // Emit failure event
      emitEvent({
        type: 'actionFailed',
        payload: { action: 'compile', error: error instanceof Error ? error : new Error(String(error)) },
      });
    } finally {
      setIsCompiling(false);
    }
  }, [currentFile, isCompiling, compileUrl]);

  // Debounced PDF compile (triggered on content change)
  const debouncedPdfCompile = useCallback((content: string, filename: string) => {
    if (!texliveAvailableRef.current) return;
    
    // Clear any existing timer
    if (pdfCompileTimerRef.current) {
      clearTimeout(pdfCompileTimerRef.current);
    }
    
    // Set a new timer - compile 2 seconds after last change
    pdfCompileTimerRef.current = setTimeout(() => {
      handleCompilePDF(content, filename);
    }, 2000);
  }, [handleCompilePDF]);

  // Compile (KaTeX preview)
  const handleCompile = useCallback(() => {
    setIsCompiling(true);
    setTimeout(() => {
      if (currentFile) {
        setPreviewHtml(renderLatexPreview(currentFile.content));
        setPreviewMode('katex');
      }
      setIsCompiling(false);
    }, 300);
  }, [currentFile]);

  // File upload
  const handleFileUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const ext = file.name.split(".").pop()?.toLowerCase();
        const type = (ext === "bib" ? "bib" : ext === "sty" ? "sty" : ext === "cls" ? "cls" : "tex") as TexFile["type"];

        if (files.find((f) => f.name === file.name)) {
          setFiles((prev) =>
            prev.map((f) => (f.name === file.name ? { ...f, content } : f))
          );
        } else {
          setFiles((prev) => [...prev, { name: file.name, path: file.name, content, type }]);
        }
        setActiveFile(file.name);
      };
      reader.readAsText(file);
    },
    [files]
  );

  // Handle template import
  const handleTemplateImport = useCallback(
    (templateFiles: TemplateFiles) => {
      // Convert template files to TexFile format, preserving relative paths
      const newFiles: TexFile[] = templateFiles.files
        .filter((f) => f.content !== undefined)
        .map((f) => ({
          name: f.name,
          path: f.path || f.name,  // preserve relative path for multi-file projects
          content: f.content || "",
          type: (f.type === "tex" || f.type === "bib" || f.type === "sty" || f.type === "cls"
            ? f.type
            : "tex") as TexFile["type"],
        }));

      if (newFiles.length > 0) {
        setFiles(newFiles);
        // Set active file to main file (match by path first, then by name)
        const mainFile = newFiles.find((f) => f.path === templateFiles.mainFile)
          || newFiles.find((f) => f.name === templateFiles.mainFile);
        setActiveFile(mainFile?.name || newFiles[0].name);

        // Update preview
        if (mainFile) {
          setPreviewHtml(renderLatexPreview(mainFile.content));
        }

        // Sync template files to DB + container (non-blocking)
        if (!isDefaultWorkspace) {
          const syncPayload = {
            files: newFiles.map(f => ({ path: f.path, content: f.content })),
          };

          // 1. Save to DB (for get_workspace_state and persistence)
          fetch(`/api/workspace/${workspaceId}/files/sync`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncPayload),
          }).catch(err => console.warn('[LaTeX] DB sync failed:', err));

          // 2. Write to container /workspace/ (for agent file access)
          fetch(`/api/workspace/${workspaceId}/files/sync-to-container`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncPayload),
          }).catch(err => console.warn('[LaTeX] Container sync failed:', err));
        }
      }
    },
    [workspaceId, isDefaultWorkspace]
  );

  const getFileIcon = (type: TexFile["type"]) => {
    switch (type) {
      case "tex":
        return <FileText className="h-3.5 w-3.5 text-emerald-600" />;
      case "bib":
        return <FileCode className="h-3.5 w-3.5 text-amber-600" />;
      case "sty":
      case "cls":
        return <Package className="h-3.5 w-3.5 text-indigo-600" />;
      default:
        return <FileText className="h-3.5 w-3.5 text-stone-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[700px] overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between h-10 px-3 py-2 bg-white border-b border-stone-200">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-stone-800 flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600" />
            LaTeX Editor
          </span>

          {/* Templates Button */}
          <button
            onClick={() => setShowTemplateManager(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Templates
          </button>

          {/* Browse Saved Files */}
          {!isDefaultWorkspace && (
            <button
              onClick={() => setShowFileBrowser(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200/60 transition-colors"
            >
              <FileCode className="h-3.5 w-3.5" />
              Files
            </button>
          )}

          {/* Snippet Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSnippets(!showSnippets)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200/60 transition-colors"
            >
              <Sigma className="h-3.5 w-3.5" />
              Insert
              <ChevronDown className="h-3 w-3" />
            </button>

            {showSnippets && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-stone-200 rounded-xl shadow-lg z-50 py-1">
                {Object.entries(latexSnippets).map(([key, { label, snippet, icon: Icon }]) => (
                  <button
                    key={key}
                    onClick={() => insertSnippet(snippet)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 transition-colors"
                  >
                    <Icon className="h-3.5 w-3.5 text-stone-500" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Insert Buttons */}
          <div className="flex items-center gap-1 border-l border-stone-200 pl-3">
            <button
              onClick={() => insertSnippet(latexSnippets.bold.snippet)}
              className="p-1.5 text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded transition-colors"
              title="Bold"
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSnippet(latexSnippets.italic.snippet)}
              className="p-1.5 text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded transition-colors"
              title="Italic"
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSnippet(latexSnippets.equation.snippet)}
              className="p-1.5 text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded transition-colors"
              title="Equation"
            >
              <Sigma className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSnippet(latexSnippets.itemize.snippet)}
              className="p-1.5 text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded transition-colors"
              title="List"
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => insertSnippet(latexSnippets.table.snippet)}
              className="p-1.5 text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded transition-colors"
              title="Table"
            >
              <Table className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasCompileSuccess && (
            <span
              data-testid="compile-status"
              className="px-2 py-1 text-xs rounded-md bg-green-50 border border-green-200 text-green-700"
            >
              Compiled successfully
            </span>
          )}

          {/* Auto Refresh */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
              autoRefresh
                ? "bg-emerald-100 text-emerald-600"
                : "bg-stone-100 text-stone-500"
            }`}
            title="Auto Refresh Preview"
          >
            {autoRefresh ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>

          {/* Preview Mode Toggle (KaTeX / PDF) */}
          {layout !== 'editor' && (
            <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-1">
              <button
                onClick={() => setPreviewMode('katex')}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  previewMode === 'katex'
                    ? "bg-indigo-600 text-white"
                    : "text-stone-600 hover:text-stone-800"
                }`}
              >
                KaTeX
              </button>
              {texliveAvailable && (
                <button
                  onClick={() => setPreviewMode('pdf')}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    previewMode === 'pdf'
                      ? "bg-indigo-600 text-white"
                      : "text-stone-600 hover:text-stone-800"
                  }`}
                >
                  PDF
                </button>
              )}
            </div>
          )}

          {/* KaTeX Preview Button */}
          <button
            onClick={handleCompile}
            disabled={isCompiling}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isCompiling ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Preview
          </button>

          {/* PDF Compile Button */}
          {texliveAvailable && (
            <button
              onClick={() => handleCompilePDF()}
              disabled={isCompiling}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              title="Compile to PDF with TeXLive"
            >
              {isCompiling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileOutput className="h-3.5 w-3.5" />
              )}
              PDF
            </button>
          )}

          {/* Layout Toggle */}
          <div className="flex items-center bg-stone-100 rounded-lg p-1">
            <button
              onClick={() => setLayout("editor")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                layout === "editor"
                  ? "bg-indigo-600 text-white"
                  : "text-stone-600 hover:text-stone-800"
              }`}
              title="Editor Only"
            >
              <FileText className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setLayout("split")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                layout === "split"
                  ? "bg-indigo-600 text-white"
                  : "text-stone-600 hover:text-stone-800"
              }`}
              title="Split View"
            >
              <SplitSquareHorizontal className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setLayout("preview")}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                layout === "preview"
                  ? "bg-indigo-600 text-white"
                  : "text-stone-600 hover:text-stone-800"
              }`}
              title="Preview Only"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1.5 text-xs bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200/60 transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          {/* Download Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDownloadMenu(v => !v); }}
              className="flex items-center gap-0.5 px-2 py-1.5 text-xs bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200/60 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <ChevronDown className="h-3 w-3" />
            </button>
            {showDownloadMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded-xl shadow-lg z-50 py-1">
                <button
                  onClick={() => { handleDownload(); setShowDownloadMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100"
                >
                  <FileText className="h-3.5 w-3.5" /> Current File (.tex)
                </button>
                <button
                  onClick={() => { handleDownloadPdf(); setShowDownloadMenu(false); }}
                  disabled={!pdfDataUrl}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <FileOutput className="h-3.5 w-3.5" /> Compiled PDF
                </button>
                <button
                  onClick={() => { handleDownloadZip(); setShowDownloadMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100"
                >
                  <Package className="h-3.5 w-3.5" /> Project (.zip)
                </button>
              </div>
            )}
          </div>

          {/* Upload */}
          <label className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <input
              type="file"
              accept=".tex,.bib,.sty,.cls,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* File Tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-stone-50 border-b border-stone-200 overflow-x-auto">
        {files.map((file) => (
          <button
            key={file.name}
            onClick={() => setActiveFile(file.name)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap ${
              activeFile === file.name
                ? "bg-indigo-100 text-indigo-600"
                : "text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            }`}
          >
            {getFileIcon(file.type)}
            <span>{file.name}</span>
            {files.length > 1 && (
              <X
                className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                onClick={(e) => handleCloseFile(file.name, e)}
              />
            )}
          </button>
        ))}

        <button
          onClick={handleAddFile}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor Panel — Use CSS hidden instead of conditional rendering to prevent CodeMirror DOM destruction */}
        <div
          className={`relative flex flex-col overflow-hidden ${
            layout === "preview" ? "hidden" : layout === "split" ? "w-1/2 border-r border-stone-200" : "w-full"
          }`}
        >
          <div
            ref={editorRef}
            className="flex-1 overflow-auto bg-[#1e1e2e]"
          />
        </div>

        {/* Preview Panel */}
        {layout !== "editor" && (
          <div
            className={`flex flex-col overflow-hidden ${
              layout === "split" ? "w-1/2" : "w-full"
            }`}
          >
            {previewMode === 'pdf' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {isCompiling && (
                  <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-indigo-600 animate-spin" />
                    <span className="text-indigo-500 text-sm">Compiling PDF...</span>
                  </div>
                )}
                {hasCompileSuccess && (
                  <div
                    data-testid="compile-status"
                    className="px-3 py-2 bg-green-50 border-b border-green-200 flex items-center gap-2"
                  >
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-700 text-sm">Compiled successfully</span>
                  </div>
                )}
                {compileError && (
                  <div className="px-3 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-red-600 text-sm truncate">{compileError}</span>
                    <button
                      type="button"
                      onClick={() => setCompileError(null)}
                      className="ml-auto text-red-600 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {pdfDataUrl ? (
                  <PdfViewer dataUrl={pdfDataUrl} fileUrl={pdfFileUrl || undefined} className="flex-1" />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center bg-stone-50">
                    <FileOutput className="h-8 w-8 text-stone-400 mb-3" />
                    <p className="text-stone-500 text-sm">Click &apos;Compile PDF&apos; to render</p>
                    <button
                      type="button"
                      onClick={() => handleCompilePDF()}
                      className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                    >
                      Compile PDF Now
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-6 bg-white text-stone-800">
                <div
                  className="latex-preview prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }}
                  style={{
                    fontFamily: "'Times New Roman', 'Computer Modern', serif",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-stone-50 border-t border-stone-200">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-4">
            <span>
              File: <span className="text-stone-600">{activeFile}</span>
            </span>
            <span>
              Files: <span className="text-stone-600">{files.length}</span>
            </span>
            {texliveAvailable !== null && (
              <span className={texliveAvailable ? "text-emerald-600" : "text-amber-600"}>
                {texliveAvailable ? "TeXLive Ready" : "TeXLive Not Found"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-stone-600">LaTeX + KaTeX Preview</span>
            {texliveAvailable && <span>•</span>}
            {texliveAvailable && <span className="text-indigo-600">PDF Compilation Available</span>}
          </div>
        </div>
      </div>

      {/* Preview Styles */}
      <style jsx global>{`
        .latex-preview .title {
          font-size: 1.75rem;
          font-weight: bold;
          text-align: center;
          margin-bottom: 0.5rem;
        }
        .latex-preview .author {
          text-align: center;
          margin-bottom: 0.25rem;
        }
        .latex-preview .date {
          text-align: center;
          margin-bottom: 1.5rem;
          color: #78716c;
        }
        .latex-preview .abstract {
          margin: 1.5rem 2rem;
          padding: 1rem;
          background: rgba(99, 102, 241, 0.1);
          border-left: 3px solid #6366f1;
          border-radius: 0.25rem;
        }
        .latex-preview .section {
          font-size: 1.25rem;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid rgba(168, 162, 158, 0.5);
        }
        .latex-preview .subsection {
          font-size: 1.1rem;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .latex-preview .math-display {
          margin: 1rem 0;
          text-align: center;
          overflow-x: auto;
        }
        .latex-preview .math-error {
          color: #f87171;
          font-family: monospace;
        }
        .latex-preview .theorem,
        .latex-preview .lemma,
        .latex-preview .definition {
          margin: 1rem 0;
          padding: 1rem;
          background: rgba(139, 92, 246, 0.1);
          border-radius: 0.5rem;
        }
        .latex-preview .proof {
          margin: 1rem 0;
          padding: 1rem;
          background: rgba(245, 245, 244, 0.8);
          border-radius: 0.5rem;
        }
        .latex-preview .qed {
          float: right;
        }
        .latex-preview .code-block {
          background: #1e293b;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
        }
        .latex-preview ul,
        .latex-preview ol {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
        }
        .latex-preview li {
          margin: 0.25rem 0;
        }
        .latex-preview .toc {
          margin: 1rem 0;
          padding: 1rem;
          background: rgba(245, 245, 244, 0.8);
          border-radius: 0.5rem;
          color: #78716c;
          font-style: italic;
        }
      `}</style>

      {/* Template Manager Modal */}
      <TemplateManager
        isOpen={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        onImport={handleTemplateImport}
      />

      {/* Workspace File Browser Modal */}
      <WorkspaceFileBrowser
        isOpen={showFileBrowser}
        onClose={() => setShowFileBrowser(false)}
        workspaceId={workspaceId}
        onSelectFile={handleFileFromBrowser}
        title="Workspace Files"
      />
    </div>
  );
}
