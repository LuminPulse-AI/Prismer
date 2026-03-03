'use client';

/**
 * CodeCell - Code Cell Component
 *
 * Phase 5 enhancements:
 * - Cell type switching
 * - AI toolbar
 * - Pending Edit state display
 * - Context menu
 */

import React, { useCallback, useMemo, memo } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Square, Trash2, ChevronUp, ChevronDown, Code2, FileText } from 'lucide-react';
import type { CodeCell as CodeCellType, KernelStatus } from '../types';
import { OutputArea } from './OutputArea';
import { CellAIToolbar, CellContextMenu, type CellAIAction } from './CellContextMenu';
import { PendingEditBanner } from './PendingEditBanner';

/** Cell theme: consistent with the engineering color scheme */
export type CodeCellTheme = 'default' | 'slate' | 'indigo';

const THEME_STYLES: Record<
  CodeCellTheme,
  { header: string; border: string; runBtn: string; runBtnHover: string; runBtnDisabled: string }
> = {
  default: {
    header: 'bg-slate-50',
    border: 'border-slate-200',
    runBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    runBtnHover: 'hover:bg-indigo-700',
    runBtnDisabled: 'bg-slate-200 text-slate-400 cursor-not-allowed',
  },
  slate: {
    header: 'bg-slate-100',
    border: 'border-slate-300',
    runBtn: 'bg-slate-600 hover:bg-slate-700 text-white',
    runBtnHover: 'hover:bg-slate-700',
    runBtnDisabled: 'bg-slate-200 text-slate-400 cursor-not-allowed',
  },
  indigo: {
    header: 'bg-indigo-50',
    border: 'border-indigo-200',
    runBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    runBtnHover: 'hover:bg-indigo-700',
    runBtnDisabled: 'bg-indigo-100 text-indigo-400 cursor-not-allowed',
  },
};

interface CodeCellProps {
  cell: CodeCellType;
  isActive: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  kernelStatus: KernelStatus;
  /** Theme: default (light + indigo) / slate / indigo */
  theme?: CodeCellTheme;
  pendingEdit?: {
    source: string;
    timestamp: string;
  };
  onExecute: () => void;
  onSourceChange: (source: string) => void;
  onDelete: () => void;
  onFocus: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onChangeType?: (type: 'code' | 'markdown') => void;
  onAIAction?: (action: CellAIAction) => void;
  onConfirmEdit?: () => void;
  onRejectEdit?: () => void;
  readOnly?: boolean;
}

export const CodeCell = memo(function CodeCell({
  cell,
  isActive,
  isFirst = false,
  isLast = false,
  kernelStatus,
  pendingEdit,
  onExecute,
  onSourceChange,
  onDelete,
  onFocus,
  onMoveUp,
  onMoveDown,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onChangeType,
  onAIAction,
  onConfirmEdit,
  onRejectEdit,
  readOnly = false,
  theme = 'default',
}: CodeCellProps) {
  const isRunning = cell.executionState === 'running';
  const canExecute = kernelStatus === 'idle' && !isRunning;
  const hasPendingEdit = !!pendingEdit;
  const styles = THEME_STYLES[theme];
  
  // Compute execution indicator
  const executionIndicator = useMemo(() => {
    if (isRunning) {
      return (
        <div className="w-6 h-6 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    if (cell.executionCount !== null) {
      return (
        <span className="text-slate-500 text-xs font-mono">
          [{cell.executionCount}]
        </span>
      );
    }
    return (
      <span className="text-slate-400 text-xs font-mono">[ ]</span>
    );
  }, [isRunning, cell.executionCount]);

  // Status bar color (left vertical bar)
  const statusColor = useMemo(() => {
    if (hasPendingEdit) return 'bg-yellow-500';
    switch (cell.executionState) {
      case 'running':
        return 'bg-indigo-500';
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return isActive ? 'bg-indigo-400' : 'bg-slate-200';
    }
  }, [cell.executionState, isActive, hasPendingEdit]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) {
      e.preventDefault();
      if (canExecute) {
        onExecute();
      }
    }
  }, [canExecute, onExecute]);

  // Calculate editor height
  const editorHeight = useMemo(() => {
    const lines = cell.source.split('\n').length;
    return Math.max(60, Math.min(400, lines * 19 + 20));
  }, [cell.source]);

  return (
    <div 
      className={`group relative rounded-xl overflow-hidden border ${styles.border} bg-white mb-2 transition-colors shadow-sm`}
      onClick={onFocus}
      onKeyDown={handleKeyDown}
    >
      {/* Status indicator bar (left vertical bar) */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${statusColor}`} aria-hidden />

      <div className="pl-4">
        {/* Pending Edit Banner */}
        {pendingEdit && onConfirmEdit && onRejectEdit && (
          <PendingEditBanner
            originalSource={cell.source}
            newSource={pendingEdit.source}
            timestamp={pendingEdit.timestamp}
            onConfirm={onConfirmEdit}
            onReject={onRejectEdit}
          />
        )}

        {/* Cell Header */}
        <div className={`flex items-center justify-between px-3 py-1.5 ${styles.header} rounded-t-xl`}>
          <div className="flex items-center gap-2">
          {/* Execution indicator */}
          <div className="w-12 flex justify-end pl-1">
            {executionIndicator}
          </div>
          
          {/* Type selector */}
          {onChangeType ? (
            <select
              value={cell.type}
              onChange={(e) => onChangeType(e.target.value as 'code' | 'markdown')}
              className="text-xs text-slate-600 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="code">Code</option>
              <option value="markdown">Markdown</option>
            </select>
          ) : (
            <span className="text-xs text-slate-600 bg-white/80 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
              <Code2 size={10} />
              {cell.language}
            </span>
          )}
          
          {/* Source label */}
          {cell.createdBy === 'agent' && (
            <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
              AI
            </span>
          )}
          
          {/* Status label */}
          {cell.executionState === 'error' && (
            <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
              Error
            </span>
          )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* AI toolbar */}
          {onAIAction && (
            <CellAIToolbar cell={cell} onAction={onAIAction} />
          )}

          <div className="w-px h-4 bg-stone-200 mx-1" />

          {/* Move buttons */}
          {onMoveUp && !isFirst && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              className="p-1 hover:bg-stone-200/60 rounded text-stone-500 hover:text-stone-800"
              title="Move Up"
            >
              <ChevronUp size={14} />
            </button>
          )}
          {onMoveDown && !isLast && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              className="p-1 hover:bg-stone-200/60 rounded text-stone-500 hover:text-stone-800"
              title="Move Down"
            >
              <ChevronDown size={14} />
            </button>
          )}

          {/* Context menu */}
          {onCopy && onCut && onPaste && onDuplicate && onAIAction && (
            <CellContextMenu
              cell={cell}
              isFirst={isFirst}
              isLast={isLast}
              onCopy={onCopy}
              onCut={onCut}
              onPaste={onPaste}
              onDelete={onDelete}
              onMoveUp={onMoveUp || (() => {})}
              onMoveDown={onMoveDown || (() => {})}
              onDuplicate={onDuplicate}
              onAIAction={onAIAction}
            />
          )}

          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 hover:bg-red-100 rounded text-stone-500 hover:text-red-600"
            title="Delete Cell"
          >
            <Trash2 size={14} />
          </button>

          {/* Execute button */}
          <button
            onClick={(e) => { e.stopPropagation(); onExecute(); }}
            disabled={!canExecute}
            className={`p-1.5 rounded-lg flex items-center gap-1 text-sm ${
              canExecute ? styles.runBtn : styles.runBtnDisabled
            }`}
            title={isRunning ? 'Running...' : 'Run (Shift+Enter)'}
          >
            {isRunning ? (
              <Square size={12} />
            ) : (
              <Play size={12} />
            )}
          </button>
          </div>
        </div>

        {/* Editor — light theme consistent with engineering color scheme */}
        <div className="overflow-hidden border-b border-slate-200/80 bg-slate-50/50">
          <Editor
            height={editorHeight}
            language={cell.language === 'python' ? 'python' : cell.language}
            value={cell.source}
            onChange={(value) => onSourceChange(value || '')}
            theme="vs"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
            lineNumbers: 'on',
            lineNumbersMinChars: 3,
            folding: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            readOnly: readOnly || hasPendingEdit,
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: isActive ? 'all' : 'none',
            scrollbar: {
              vertical: 'hidden',
              horizontal: 'auto',
            },
          }}
            />
        </div>

        {/* Output Area */}
        <OutputArea
          outputs={cell.outputs}
          executionCount={cell.executionCount}
          isExecuting={isRunning}
        />
      </div>
    </div>
  );
});

export default CodeCell;
