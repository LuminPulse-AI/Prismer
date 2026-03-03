'use client';

/**
 * CodeBlock
 *
 * Executable code block component - Supports syntax highlighting and one-click execution
 */

import React, { memo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Copy, Check, Terminal } from 'lucide-react';
import type { CodeBlockComponent } from '../../types';

interface CodeBlockProps {
  config: CodeBlockComponent;
  onAction: (actionId: string, data?: unknown) => void;
}

export const CodeBlock = memo(function CodeBlock({
  config,
  onAction,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(config.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [config.code]);

  const handleRun = useCallback(() => {
    if (!config.executable) return;
    setIsRunning(true);
    onAction('execute', { code: config.code, language: config.language });
    // Simulate running state
    setTimeout(() => setIsRunning(false), 2000);
  }, [config.code, config.language, config.executable, onAction]);

  // Simple line number rendering
  const lines = config.code.split('\n');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-400 font-mono">
            {config.language}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-slate-700 transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {/* Run button */}
          {config.executable && (
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning}
              className={`
                flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium
                transition-all duration-200
                ${isRunning
                  ? 'bg-green-600/20 text-green-400 cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }
              `}
            >
              <Play className={`w-3 h-3 ${isRunning ? 'animate-pulse' : ''}`} />
              {isRunning ? 'Running...' : 'Run'}
            </button>
          )}
        </div>
      </div>

      {/* Code content */}
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm font-mono leading-relaxed">
          {lines.map((line, index) => (
            <div key={index} className="flex">
              {config.showLineNumbers && (
                <span className="select-none text-slate-600 w-8 text-right pr-4 flex-shrink-0">
                  {index + 1}
                </span>
              )}
              <code className="text-slate-300 whitespace-pre">
                {line || ' '}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </motion.div>
  );
});

export default CodeBlock;
