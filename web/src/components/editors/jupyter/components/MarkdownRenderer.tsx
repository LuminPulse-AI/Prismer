'use client';

/**
 * MarkdownRenderer - Enhanced Markdown Renderer
 *
 * Uses react-markdown + remark-gfm + rehype-highlight
 * Supports:
 * - GFM (tables, strikethrough, task lists)
 * - Code highlighting
 * - Custom code blocks
 */

import React, { memo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Play } from 'lucide-react';

// ============================================================
// Type Definitions
// ============================================================

interface MarkdownRendererProps {
  content: string;
  className?: string;
  onCodeExecute?: (code: string, language: string) => void;
  /** Use light theme (for AI Assistant in light container). Default: dark (prose-invert). */
  variant?: 'dark' | 'light';
}

interface CodeBlockProps {
  language: string;
  code: string;
  onExecute?: (code: string) => void;
  variant?: 'dark' | 'light';
}

// ============================================================
// MarkdownRenderer Component
// ============================================================

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = '',
  onCodeExecute,
  variant = 'dark',
}: MarkdownRendererProps) {
  const isLight = variant === 'light';
  const proseClass = isLight
    ? 'prose prose-sm max-w-none prose-headings:text-slate-800 prose-p:text-slate-700 prose-li:text-slate-700'
    : 'prose prose-invert prose-sm max-w-none';

  return (
    <div className={`${proseClass} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code rendering
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const code = String(children).replace(/\n$/, '');
            
            const isInline = !match && !code.includes('\n');
            if (isInline) {
              return (
                <code 
                  className={isLight ? "px-1.5 py-0.5 bg-slate-200 rounded text-slate-800 text-sm font-mono" : "px-1.5 py-0.5 bg-slate-800 rounded text-blue-300 text-sm font-mono"}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            return (
              <CodeBlock
                language={language}
                code={code}
                onExecute={
                  onCodeExecute && (language === 'python' || language === 'py')
                    ? () => onCodeExecute(code, language)
                    : undefined
                }
                variant={variant}
              />
            );
          },
          
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          
          thead({ children }) {
            return (
              <thead className={isLight ? "bg-slate-100 border-b border-slate-200" : "bg-slate-800 border-b border-slate-700"}>
                {children}
              </thead>
            );
          },
          
          th({ children }) {
            return (
              <th className={isLight ? "px-4 py-2 text-left text-sm font-medium text-slate-700" : "px-4 py-2 text-left text-sm font-medium text-slate-300"}>
                {children}
              </th>
            );
          },
          
          td({ children }) {
            return (
              <td className={isLight ? "px-4 py-2 text-sm text-slate-600 border-b border-slate-200" : "px-4 py-2 text-sm text-slate-400 border-b border-slate-700/50"}>
                {children}
              </td>
            );
          },
          
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={isLight ? "text-indigo-600 hover:text-indigo-700 underline" : "text-blue-400 hover:text-blue-300 underline"}
              >
                {children}
              </a>
            );
          },
          
          ul({ children }) {
            return <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>;
          },
          
          ol({ children }) {
            return <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>;
          },
          
          li({ children }) {
            return <li className={isLight ? "text-slate-700" : "text-slate-300"}>{children}</li>;
          },
          
          h1({ children }) {
            return <h1 className={isLight ? "text-xl font-bold text-slate-800 mt-4 mb-2" : "text-xl font-bold text-white mt-4 mb-2"}>{children}</h1>;
          },
          
          h2({ children }) {
            return <h2 className={isLight ? "text-lg font-semibold text-slate-800 mt-4 mb-2" : "text-lg font-semibold text-white mt-4 mb-2"}>{children}</h2>;
          },
          
          h3({ children }) {
            return <h3 className={isLight ? "text-base font-semibold text-slate-800 mt-3 mb-2" : "text-base font-semibold text-white mt-3 mb-2"}>{children}</h3>;
          },
          
          blockquote({ children }) {
            return (
              <blockquote className={isLight ? "border-l-4 border-slate-300 pl-4 my-4 text-slate-600 italic" : "border-l-4 border-blue-500 pl-4 my-4 text-slate-400 italic"}>
                {children}
              </blockquote>
            );
          },
          
          p({ children }) {
            return <p className={isLight ? "text-slate-700 my-2" : "text-slate-300 my-2"}>{children}</p>;
          },
          
          input({ type, checked }) {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  className="mr-2 accent-indigo-600"
                />
              );
            }
            return <input type={type} />;
          },
          
          hr() {
            return <hr className={isLight ? "border-slate-200 my-4" : "border-slate-700 my-4"} />;
          },
          
          strong({ children }) {
            return <strong className={isLight ? "font-semibold text-slate-900" : "font-semibold text-white"}>{children}</strong>;
          },
          
          em({ children }) {
            return <em className={isLight ? "italic text-slate-700" : "italic text-slate-300"}>{children}</em>;
          },
          
          del({ children }) {
            return <del className={isLight ? "line-through text-slate-500" : "line-through text-slate-500"}>{children}</del>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// ============================================================
// CodeBlock Component
// ============================================================

const CodeBlock = memo(function CodeBlock({
  language,
  code,
  onExecute,
  variant = 'dark',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const isLight = variant === 'light';

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const highlightedCode = useMemo(() => {
    return highlightCode(code, language, isLight);
  }, [code, language, isLight]);

  return (
    <div className={isLight ? "relative group my-4 rounded-lg overflow-hidden bg-slate-100 border border-slate-200" : "relative group my-4 rounded-lg overflow-hidden bg-slate-900 border border-slate-700"}>
      <div className={isLight ? "flex items-center justify-between px-3 py-1.5 bg-slate-200/80 border-b border-slate-200" : "flex items-center justify-between px-3 py-1.5 bg-slate-800 border-b border-slate-700"}>
        <span className={isLight ? "text-xs text-slate-600 font-mono" : "text-xs text-slate-500 font-mono"}>
          {language || 'code'}
        </span>
        <div className="flex items-center gap-1">
          {onExecute && (
            <button
              onClick={() => onExecute(code)}
              className={isLight ? "p-1 text-green-700 hover:text-green-800 hover:bg-green-200/50 rounded transition-colors" : "p-1 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded transition-colors"}
              title="Run code"
            >
              <Play size={12} />
            </button>
          )}
          <button
            onClick={handleCopy}
            className={isLight ? "p-1 text-slate-600 hover:text-slate-800 hover:bg-slate-300/50 rounded transition-colors" : "p-1 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"}
            title="Copy code"
          >
            {copied ? (
              <Check size={12} className={isLight ? "text-green-600" : "text-green-400"} />
            ) : (
              <Copy size={12} />
            )}
          </button>
        </div>
      </div>

      <pre className={isLight ? "p-4 overflow-x-auto text-sm font-mono text-slate-800" : "p-4 overflow-x-auto text-sm font-mono"}>
        <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
      </pre>
    </div>
  );
});

// ============================================================
// Simple Syntax Highlighting
// ============================================================

function useMemo<T>(factory: () => T, deps: React.DependencyList): T {
  return React.useMemo(factory, deps);
}

function highlightCode(code: string, language: string, isLight = false): string {
  const classes = isLight
    ? { string: 'text-green-800', comment: 'text-slate-500', number: 'text-purple-700', keyword: 'text-indigo-700' }
    : { string: 'text-green-400', comment: 'text-slate-500', number: 'text-purple-400', keyword: 'text-pink-400' };
  // Simple keyword highlighting
  const keywords = {
    python: ['def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'with', 'as', 'in', 'not', 'and', 'or', 'True', 'False', 'None', 'lambda', 'yield', 'raise', 'pass', 'break', 'continue', 'async', 'await'],
    javascript: ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'class', 'import', 'export', 'from', 'async', 'await', 'true', 'false', 'null', 'undefined', 'new', 'this'],
    typescript: ['function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'class', 'import', 'export', 'from', 'async', 'await', 'true', 'false', 'null', 'undefined', 'new', 'this', 'interface', 'type', 'enum'],
  };

  const langKeywords = keywords[language as keyof typeof keywords] || [];
  
  let result = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // String highlighting
  result = result.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, `<span class="${classes.string}">$&</span>`);
  
  // Comment highlighting
  result = result.replace(/(#.*)$/gm, `<span class="${classes.comment}">$1</span>`);
  result = result.replace(/(\/\/.*)$/gm, `<span class="${classes.comment}">$1</span>`);
  
  // Number highlighting
  result = result.replace(/\b(\d+\.?\d*)\b/g, `<span class="${classes.number}">$1</span>`);
  
  // Keyword highlighting
  langKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
    result = result.replace(regex, `<span class="${classes.keyword}">$1</span>`);
  });
  
  return result;
}

export default MarkdownRenderer;
