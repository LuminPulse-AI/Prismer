'use client';

/**
 * AgentCell - AI Agent Response Component
 *
 * Displays the Agent's reply, including:
 * - Text responses (Markdown)
 * - Code suggestions (with confirm-to-execute)
 * - Thinking process
 */

import React, { useState } from 'react';
import { 
  Bot, 
  Play, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp,
  AlertTriangle,
  Code2,
  MessageSquare,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { AgentCell as AgentCellType, AgentAction } from '../types';

interface AgentCellProps {
  cell: AgentCellType;
  onExecuteCode?: (code: string) => void;
  onInsertCode?: (code: string) => void;
}

export function AgentCell({ cell, onExecuteCode, onInsertCode }: AgentCellProps) {
  const { content, actions, thinking, status } = cell;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-2 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <Bot size={14} className="text-indigo-600" />
        <span className="text-xs font-medium text-slate-700">AI Assistant</span>
        {status === 'thinking' && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            Thinking...
          </span>
        )}
      </div>

      {/* Thinking Process (Collapsible) */}
      {thinking && <ThinkingSection content={thinking} />}

      {/* Main Content */}
      <div className="px-4 py-3 text-slate-800">
        <MarkdownRenderer 
          content={content} 
          onCodeExecute={onExecuteCode ? (code) => onExecuteCode(code) : undefined}
          variant="light"
        />
      </div>

      {/* Code Actions */}
      {actions && actions.length > 0 && (
        <div className="border-t border-slate-200">
          {actions.map((action, index) => (
            <ActionRenderer 
              key={index} 
              action={action}
              onExecute={onExecuteCode}
              onInsert={onInsertCode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ThinkingSection({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-b border-slate-200">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-50 transition-colors"
      >
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        <span>Thinking process</span>
      </button>
      {isExpanded && (
        <div className="px-4 pb-3 text-sm text-slate-600 italic">
          {content}
        </div>
      )}
    </div>
  );
}

interface ActionRendererProps {
  action: AgentAction;
  onExecute?: (code: string) => void;
  onInsert?: (code: string) => void;
}

function ActionRenderer({ action, onExecute, onInsert }: ActionRendererProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCopy = () => {
    if (action.type === 'create_cell' || action.type === 'update_cell') {
      navigator.clipboard.writeText(action.code || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (action.type === 'create_cell' || action.type === 'update_cell') {
    const code = action.code || '';
    const isUpdate = action.type === 'update_cell';

    return (
      <div className="border-t border-slate-200 first:border-t-0">
        {/* Action Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Code2 size={14} className="text-indigo-600 flex-shrink-0" />
            <span className="text-xs text-slate-600 flex-shrink-0">
              {isUpdate ? 'Update Code' : 'Suggested Code'}
            </span>
            {action.description && (
              <span className="text-xs text-slate-500 truncate">— {action.description}</span>
            )}
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-700 flex-shrink-0"
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* Code Block */}
        {isExpanded && (
          <>
            <div className="relative group">
              <pre className="px-4 py-3 text-sm font-mono text-slate-800 bg-slate-100 border-y border-slate-200 overflow-x-auto">
                <code>{code}</code>
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 p-1.5 bg-white border border-slate-200 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-slate-800"
                title="Copy code"
              >
                {copied ? (
                  <Check size={14} className="text-green-600" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 px-3 py-2 bg-white border-t border-slate-200 flex-wrap">
              {onExecute && (
                <button
                  onClick={() => onExecute(code)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                >
                  <Play size={12} />
                  Run Code
                </button>
              )}
              {onInsert && (
                <button
                  onClick={() => onInsert(code)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-medium rounded transition-colors"
                >
                  <Code2 size={12} />
                  Insert Cell
                </button>
              )}
              <span className="text-xs text-slate-500">
                Press Enter to confirm
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  if (action.type === 'execute_cell') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 text-xs">
        <AlertTriangle size={14} />
        <span>Agent wants to execute cell: {action.cellId}</span>
        {onExecute && (
          <button
            onClick={() => onExecute(action.cellId || '')}
            className="ml-auto px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
          >
            Allow
          </button>
        )}
      </div>
    );
  }

  if (action.type === 'explain') {
    return (
      <div className="flex items-start gap-2 px-4 py-3 bg-slate-50 border-t border-slate-200">
        <MessageSquare size={14} className="text-indigo-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-slate-700">{action.description}</div>
      </div>
    );
  }

  return null;
}

export default AgentCell;
