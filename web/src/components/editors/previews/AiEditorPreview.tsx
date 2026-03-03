"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import DOMPurify from "dompurify";
import type { ComponentPreviewProps } from "@/components/playground/registry";
import { AssetBrowser, type AssetItem } from "@/components/shared/AssetBrowser";
import { componentEventBus, useComponentBusEvent } from "@/lib/events";
import { useContentSync } from "@/lib/sync/useContentSync";
import { useComponentStore } from "@/app/workspace/stores/componentStore";
import { useWorkspaceId } from "@/app/workspace/components/WorkspaceContext";

// ============================================================
// Types
// ============================================================

export interface AiEditorConfig {
  /** Initial HTML content */
  content?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** Editor height */
  height?: string | number;
  /** Custom toolbar keys */
  toolbarKeys?: string[];
  /** Enable AI features */
  enableAI?: boolean;
  /** AI model to use */
  aiModel?: string;
}

export interface AiEditorHandle {
  /** Get HTML content */
  getHtml: () => string;
  /** Get plain text content */
  getText: () => string;
  /** Get Markdown content */
  getMarkdown: () => string;
  /** Set HTML content */
  setContent: (html: string) => void;
  /** Clear content */
  clear: () => void;
  /** Focus editor */
  focus: () => void;
  /** Get editor instance */
  getInstance: () => any;
}

export interface AiEditorProps {
  /** Editor configuration */
  config?: AiEditorConfig;
  /** Content change callback */
  onChange?: (content: { html: string; text: string; markdown: string }) => void;
  /** Ready callback */
  onReady?: (editor: any) => void;
  /** Error callback */
  onError?: (error: Error) => void;
  /** Custom class name */
  className?: string;
}

// ============================================================
// Default Content
// ============================================================

const defaultContent = `
<h1>VLA-RAIL Research Notes</h1>
<p>Research notes on Vision-Language-Action models for robotic manipulation.</p>

<h2>Key Findings</h2>
<ul>
  <li><strong>VLA-RAIL Architecture</strong> - Efficient vision-language-action model with 2.1B parameters</li>
  <li><strong>62% Lower Latency</strong> - Compared to RT-1 baseline (45ms vs 120ms)</li>
  <li><strong>93.4% Success Rate</strong> - VLA-RAIL+ variant on manipulation tasks</li>
  <li><strong>Memory Efficient</strong> - Only 6.8GB memory usage vs 12.4GB for OpenVLA</li>
</ul>

<h2>Architecture Overview</h2>
<p>VLA-RAIL uses a <strong>hybrid attention mechanism</strong> that combines:</p>
<ol>
  <li>Visual encoder with efficient patch embedding</li>
  <li>Language model backbone for instruction understanding</li>
  <li>Action head with diffusion-based policy</li>
</ol>

<h2>Benchmark Results</h2>
<table>
  <tr><th>Model</th><th>Latency</th><th>Success Rate</th><th>Memory</th></tr>
  <tr><td>RT-1</td><td>120ms</td><td>72.3%</td><td>8.2GB</td></tr>
  <tr><td>OpenVLA</td><td>85ms</td><td>81.2%</td><td>12.4GB</td></tr>
  <tr><td>VLA-RAIL</td><td>45ms</td><td>89.1%</td><td>6.8GB</td></tr>
  <tr><td>VLA-RAIL+</td><td>32ms</td><td>93.4%</td><td>7.2GB</td></tr>
</table>

<h2>Next Steps</h2>
<ul>
  <li>Run ablation study on attention mechanisms</li>
  <li>Test on real robot hardware</li>
  <li>Compare with recent Octo model</li>
</ul>
`;

// ============================================================
// Default Toolbar Keys
// ============================================================

const defaultToolbarKeys = [
  "undo", "redo", "|",
  "brush", "eraser", "|",
  "heading", "font-family", "font-size", "|",
  "bold", "italic", "underline", "strike", "code", "|",
  "font-color", "highlight", "|",
  "align", "line-height", "|",
  "bullet-list", "ordered-list", "todo", "|",
  "indent-decrease", "indent-increase", "|",
  "link", "image", "video", "attachment", "|",
  "quote", "code-block", "table", "hr", "|",
  "emoji", "|",
  "source-code", "printer", "fullscreen",
];

// ============================================================
// Markdown → HTML helpers (lightweight, no external deps)
// ============================================================

/** Detect if content is markdown rather than HTML */
function looksLikeMarkdown(content: string): boolean {
  const trimmed = content.trim();
  // Already HTML — starts with a tag
  if (/^<[a-z]/i.test(trimmed)) return false;
  // Contains markdown heading or list markers
  return /^#{1,6}\s/m.test(trimmed) || /^[-*]\s/m.test(trimmed);
}

/** Convert basic markdown to HTML (headings, lists, paragraphs, bold, italic, code) */
function simpleMarkdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered list item
    const listMatch = trimmed.match(/^[-*]\s+(.*)/);
    if (listMatch) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`  <li>${inlineFormat(listMatch[1])}</li>`);
      continue;
    }

    // Empty line ends list / ignored
    if (!trimmed) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }

    // Regular paragraph
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inList) out.push('</ul>');
  return out.join('\n');
}

/** Inline formatting: **bold**, *italic*, `code` */
function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ============================================================
// AiEditor Component
// ============================================================

export const AiEditor = forwardRef<AiEditorHandle, AiEditorProps>(
  ({ config = {}, onChange, onReady, onError, className = "" }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null);
    const configRef = useRef(config);
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      configRef.current = config;
    }, [config]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getHtml: () => editorRef.current?.getHtml() || "",
      getText: () => editorRef.current?.getText() || "",
      getMarkdown: () => editorRef.current?.getMarkdown() || "",
      setContent: (html: string) => editorRef.current?.setContent(html),
      clear: () => editorRef.current?.clear(),
      focus: () => editorRef.current?.focus(),
      getInstance: () => editorRef.current,
    }), []);

    useEffect(() => {
      let mounted = true;

      const initEditor = async () => {
        if (!containerRef.current || editorRef.current) return;

        try {
          const currentConfig = configRef.current;
          // Dynamic import for AiEditor
          const { AiEditor: AiEditorClass } = await import("aieditor");
          // Import styles
          await import("aieditor/dist/style.css");

          if (!mounted || !containerRef.current) return;

          // Build AI configuration using our proxy
          const aiConfig = currentConfig.enableAI !== false ? {
            models: {
              custom: {
                url: "/api/ai/chat",
                headers: () => ({
                  "Content-Type": "application/json",
                }),
                wrapPayload: (prompt: string) => {
                  return JSON.stringify({
                    messages: [
                      { role: "user", content: prompt }
                    ],
                    model: currentConfig.aiModel || "default",
                    stream: true,
                  });
                },
                parseMessage: (message: any) => {
                  // Parse SSE response
                  if (typeof message === "string") {
                    try {
                      const lines = message.split("\n").filter((l: string) => l.startsWith("data: "));
                      let content = "";
                      let done = false;
                      for (const line of lines) {
                        const data = line.slice(6).trim();
                        if (data === "[DONE]") {
                          done = true;
                          continue;
                        }
                        try {
                          const json = JSON.parse(data);
                          const delta = json.choices?.[0]?.delta?.content;
                          if (delta) content += delta;
                          if (json.choices?.[0]?.finish_reason === "stop") done = true;
                        } catch {
                          // Ignore parse errors
                        }
                      }
                      return {
                        role: "assistant" as const,
                        content,
                        index: 0,
                        status: (done ? 2 : 1) as 0 | 1 | 2,
                      };
                    } catch {
                      return { role: "assistant" as const, content: message, index: 0, status: 2 as const };
                    }
                  }
                  // Already parsed object
                  const content = message.choices?.[0]?.delta?.content || 
                                  message.choices?.[0]?.message?.content || "";
                  const done = message.choices?.[0]?.finish_reason === "stop";
                  return {
                    role: "assistant" as const,
                    content,
                    index: 0,
                    status: (done ? 2 : 1) as 0 | 1 | 2,
                  };
                },
                protocol: "sse" as const,
              },
            },
            bubblePanelEnable: true,
            bubblePanelModel: "custom",
            // Slash command menu (type / to open)
            commands: [
              {
                name: "AI Continue Writing",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
                prompt: "Continue writing the following text naturally. Keep the same tone and style. Output only the continuation without any explanation.",
                text: "focusBefore" as const,
                model: "custom",
              },
              {
                name: "AI Question",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
                prompt: "Answer this question helpfully and concisely:",
                text: "focusBefore" as const,
                model: "custom",
              },
              {
                name: "AI Translate",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
                prompt: "Translate the following text. If it's in Chinese, translate to English. If it's in English, translate to Chinese. Output only the translation.",
                text: "focusBefore" as const,
                model: "custom",
              },
              {
                name: "AI Generate Image",
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
                prompt: "Based on the following description, generate a detailed prompt for an image generation AI. Be specific about style, colors, composition, and mood.",
                text: "focusBefore" as const,
                model: "custom",
              },
            ],
            // Text selection bubble menu
            menus: [
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
                name: "AI Continue",
                prompt: "Continue writing the following text naturally. Keep the same tone and style. Output only the continuation without any explanation:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
                name: "Improve Writing",
                prompt: "Improve the following text for better clarity, grammar, and style. Keep the original meaning. Output only the improved text:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`,
                name: "Summarize",
                prompt: "Summarize the following text concisely. Output only the summary:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
                name: "Translate to English",
                prompt: "Translate the following text to English. Output only the translation:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
                name: "Translate to Chinese",
                prompt: "Translate the following text to Chinese. Output only the translation:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`,
                name: "Make Shorter",
                prompt: "Make the following text more concise while keeping the key points. Output only the shortened text:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>`,
                name: "Make Longer",
                prompt: "Expand the following text with more details and examples. Keep the same tone. Output only the expanded text:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
              {
                icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
                name: "Fix Grammar",
                prompt: "Fix all grammar and spelling errors in the following text. Output only the corrected text:\n\n{content}",
                text: "selected" as const,
                model: "custom",
              },
            ],
          } : undefined;

          // English i18n overrides
          const i18nConfig = {
            en: {
              "ai": "AI",
              "ai-continuation": "AI Continue",
              "ai-optimization": "Improve",
              "ai-translation": "Translate",
              "ai-proofreading": "Proofread",
            },
          };

          // Initialize AiEditor with English locale and our AI proxy
          editorRef.current = new AiEditorClass({
            element: containerRef.current,
            lang: "en",
            i18n: i18nConfig,
            placeholder: currentConfig.placeholder || "Start writing...",
            content: currentConfig.content ?? defaultContent,
            editable: !currentConfig.readOnly,
            ai: aiConfig,
            toolbarKeys: currentConfig.toolbarKeys || defaultToolbarKeys,
            onChange: (aiEditor: any) => {
              if (onChange) {
                onChange({
                  html: aiEditor.getHtml(),
                  text: aiEditor.getText(),
                  markdown: aiEditor.getMarkdown(),
                });
              }
            },
          });

          setIsLoaded(true);
          onReady?.(editorRef.current);
        } catch (err) {
          const error = err instanceof Error ? err : new Error("Failed to load AiEditor");
          console.error("[AiEditor] Initialization error:", error);
          setError(error.message);
          onError?.(error);
        }
      };

      initEditor();

      return () => {
        mounted = false;
        if (editorRef.current) {
          editorRef.current.destroy?.();
          editorRef.current = null;
        }
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (error) {
      return (
        <div className={`flex items-center justify-center bg-slate-900 ${className}`} style={{ minHeight: config.height || 500 }}>
          <div className="text-center p-8">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-red-400 font-medium mb-2">Failed to Load Editor</h3>
            <p className="text-sm text-slate-400">{error}</p>
          </div>
        </div>
      );
    }

    return (
      <div className={className}>
        {!isLoaded && (
          <div className="flex items-center justify-center bg-slate-900" style={{ minHeight: config.height || 500 }}>
            <div className="flex items-center gap-3 text-slate-400">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-500" />
              <span>Loading AI Editor...</span>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="aieditor-container overflow-hidden"
          style={{
            minHeight: config.height || 500,
            display: isLoaded ? "block" : "none",
          }}
        />
      </div>
    );
  }
);

AiEditor.displayName = "AiEditor";

// ============================================================
// Preview Component (for Playground)
// ============================================================

export default function AiEditorPreview({ className, onOutput }: ComponentPreviewProps) {
  const editorRef = useRef<AiEditorHandle>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pendingContentRef = useRef<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);

  // Read initial content from workspace store (populated by loadWorkspace → DB)
  const storedContent = useComponentStore(
    (s) => s.componentStates['ai-editor']?.content
  );
  const workspaceId = useWorkspaceId();
  const isDefaultWorkspace = workspaceId === 'default';

  // Determine initial content: stored > empty (real ws) > demo (default)
  const initialContent = storedContent != null ? String(storedContent) : (isDefaultWorkspace ? defaultContent : '');
  const [fallbackHtml, setFallbackHtml] = useState(initialContent);

  const applyEditorContent = useCallback((html: string): boolean => {
    setFallbackHtml(html);
    if (!editorRef.current) return false;
    editorRef.current.setContent(html);
    return true;
  }, []);

  // When stored content arrives async (DB load), update editor
  const hasAppliedDbContent = useRef(false);
  useEffect(() => {
    if (!storedContent || hasAppliedDbContent.current) return;
    if (!applyEditorContent(storedContent)) {
      pendingContentRef.current = storedContent;
      return;
    }
    const currentHtml = editorRef.current?.getHtml() || '';
    if (currentHtml !== storedContent) {
      applyEditorContent(storedContent);
    }
    hasAppliedDbContent.current = true;
  }, [storedContent, applyEditorContent]);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
    const pending = pendingContentRef.current;
    if (pending && applyEditorContent(pending)) {
      pendingContentRef.current = null;
      hasAppliedDbContent.current = true;
    }
  }, [applyEditorContent]);

  // Inject Open button into AiEditor toolbar as first item
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    // Wait for aie-header to render
    const timer = setInterval(() => {
      const toolbar = el.querySelector('aie-header > div');
      if (!toolbar || toolbar.querySelector('[data-custom-open]')) return;
      clearInterval(timer);

      const btn = document.createElement('div');
      btn.className = 'aie-menu-item';
      btn.setAttribute('data-custom-open', '');
      btn.title = 'Open (⌘O)';
      btn.innerHTML = `<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;cursor:pointer;border-radius:3px;white-space:nowrap;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1"/><path d="M20 19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2z"/></svg>
      </div>`;
      btn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('aieditor-open-asset'));
      });

      // Export as Markdown button
      const exportBtn = document.createElement('div');
      exportBtn.className = 'aie-menu-item';
      exportBtn.setAttribute('data-custom-export', '');
      exportBtn.title = 'Export as Markdown';
      exportBtn.innerHTML = `<div style="display:flex;align-items:center;gap:4px;padding:4px 6px;cursor:pointer;border-radius:3px;white-space:nowrap;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>`;
      exportBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('aieditor-export-md'));
      });

      // Insert as first child: Open btn, Export btn, then divider
      const divider = document.createElement('div');
      divider.className = 'aie-menu-divider';
      toolbar.prepend(divider);
      toolbar.prepend(exportBtn);
      toolbar.prepend(btn);
    }, 200);

    return () => clearInterval(timer);
  }, []);

  // Listen for the custom Open event from injected toolbar button
  useEffect(() => {
    const handler = () => setShowAssetBrowser(true);
    window.addEventListener('aieditor-open-asset', handler);
    return () => window.removeEventListener('aieditor-open-asset', handler);
  }, []);

  // Listen for the custom Export event — download notes as Markdown
  useEffect(() => {
    const handler = () => {
      if (!editorRef.current) return;
      const markdown = editorRef.current.getMarkdown();
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'notes.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
    window.addEventListener('aieditor-export-md', handler);
    return () => window.removeEventListener('aieditor-export-md', handler);
  }, []);

  // Debounced content sync to componentStore
  const syncContent = useContentSync('ai-editor', 'content', 1000);

  const handleChange = useCallback((content: { html: string; text: string; markdown: string }) => {
    onOutput?.({
      html: content.html.slice(0, 200),
      textLength: content.text.length,
    });
    // Debounced sync
    syncContent(content.html);
  }, [onOutput, syncContent]);

  const handleAssetSelect = useCallback((asset: AssetItem) => {
    componentEventBus.emit({
      component: 'ai-editor',
      type: 'assetOpen',
      payload: { result: { assetId: asset.id, assetType: asset.type, title: asset.title } },
      timestamp: Date.now(),
    });
  }, []);

  // Cmd+O keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        setShowAssetBrowser(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for notesInsert events from other components (e.g. PDF Reader, Jupyter)
  useComponentBusEvent('ai-editor', 'notesInsert', useCallback((event) => {
    const content = event.payload?.result as string;
    if (content && editorRef.current) {
      const existing = editorRef.current.getHtml();
      editorRef.current.setContent(existing + `\n<hr/>\n${content}`);
    }
  }, []));

  // Agent directive: replace entire editor content (from container plugin)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ content: string }>).detail;
      if (!detail?.content) return;
      // Convert markdown to HTML if the content looks like markdown (not HTML)
      const html = looksLikeMarkdown(detail.content)
        ? simpleMarkdownToHtml(detail.content)
        : detail.content;
      if (!applyEditorContent(html)) {
        pendingContentRef.current = html;
        return;
      }
      pendingContentRef.current = null;
    };
    window.addEventListener('agent:directive:UPDATE_NOTES', handler);
    return () => window.removeEventListener('agent:directive:UPDATE_NOTES', handler);
  }, [applyEditorContent]);

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Editor */}
      <div className="relative flex-1 min-h-0" ref={wrapperRef}>
        {!editorReady && fallbackHtml.trim() && (
          <div
            data-testid="ai-editor-fallback-content"
            className="absolute inset-0 z-10 overflow-auto bg-white/95 p-6"
          >
            <div
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(fallbackHtml) }}
            />
          </div>
        )}
        <AiEditor
          ref={editorRef}
          config={{
            content: initialContent,
            enableAI: true,
            height: '100%',
          }}
          onReady={handleEditorReady}
          onChange={handleChange}
        />
      </div>

      {/* Asset Browser */}
      <AssetBrowser
        isOpen={showAssetBrowser}
        onClose={() => setShowAssetBrowser(false)}
        onSelect={handleAssetSelect}
        filterType="note"
        title="Open Note"
      />

      {/* AiEditor toolbar: single scrollable row instead of wrapping */}
      <style dangerouslySetInnerHTML={{ __html: `
        .aie-container aie-header > div {
          display: flex !important;
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          scrollbar-width: thin;
        }
        .aie-container aie-header > div::-webkit-scrollbar {
          height: 3px;
        }
        .aie-container aie-header > div::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.3);
          border-radius: 2px;
        }
        .aie-container aie-header .aie-menu-item {
          flex-shrink: 0 !important;
        }
        .aie-container aie-header .aie-menu-divider {
          flex-shrink: 0 !important;
        }
      ` }} />
    </div>
  );
}
