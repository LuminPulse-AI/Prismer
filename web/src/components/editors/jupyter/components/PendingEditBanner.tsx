'use client';

/**
 * PendingEditBanner - Agent Edit Pending Confirmation Banner
 *
 * Displays Agent-proposed code changes with confirm/reject actions
 */

import React, { memo, useState, useMemo } from 'react';
import {
  Bot,
  Check,
  X,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';

// ============================================================
// Type Definitions
// ============================================================

interface PendingEditBannerProps {
  originalSource: string;
  newSource: string;
  timestamp: string;
  onConfirm: () => void;
  onReject: () => void;
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  lineNumber: { old?: number; new?: number };
}

// ============================================================
// PendingEditBanner Component
// ============================================================

export const PendingEditBanner = memo(function PendingEditBanner({
  originalSource,
  newSource,
  timestamp,
  onConfirm,
  onReject,
}: PendingEditBannerProps) {
  const [showDiff, setShowDiff] = useState(true);
  const [showFullDiff, setShowFullDiff] = useState(false);

  // Compute diff
  const diffLines = useMemo(() => {
    return computeDiff(originalSource, newSource);
  }, [originalSource, newSource]);

  // Count changes
  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  // Limit displayed lines
  const displayLines = showFullDiff ? diffLines : diffLines.slice(0, 10);
  const hasMore = diffLines.length > 10;

  return (
    <div className="border-2 border-yellow-500/50 bg-yellow-900/10 rounded-lg overflow-hidden mb-2">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-yellow-900/20 border-b border-yellow-500/30">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-yellow-400" />
          <span className="text-sm font-medium text-yellow-300">
            AI suggests changes
          </span>
          <span className="text-xs text-yellow-500">
            {new Date(timestamp).toLocaleTimeString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-400">+{stats.added}</span>
          <span className="text-xs text-red-400">-{stats.removed}</span>
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="p-1 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/30 rounded"
            title={showDiff ? 'Hide diff' : 'Show diff'}
          >
            {showDiff ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      {/* Diff View */}
      {showDiff && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <tbody>
              {displayLines.map((line, index) => (
                <DiffLineRow key={index} line={line} />
              ))}
            </tbody>
          </table>
          
          {hasMore && !showFullDiff && (
            <button
              onClick={() => setShowFullDiff(true)}
              className="w-full py-2 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 flex items-center justify-center gap-1"
            >
              <ChevronDown size={12} />
              Show {diffLines.length - 10} more lines
            </button>
          )}
          
          {showFullDiff && hasMore && (
            <button
              onClick={() => setShowFullDiff(false)}
              className="w-full py-2 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 flex items-center justify-center gap-1"
            >
              <ChevronUp size={12} />
              Show less
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between px-3 py-2 bg-stone-50 border-t border-yellow-500/20">
        <span className="text-xs text-stone-500">
          Review the changes before applying
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-stone-600 hover:text-stone-800 hover:bg-stone-200/60 rounded transition-colors"
          >
            <X size={14} />
            Reject
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
          >
            <Check size={14} />
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
});

// ============================================================
// DiffLineRow Component
// ============================================================

interface DiffLineRowProps {
  line: DiffLine;
}

const DiffLineRow = memo(function DiffLineRow({ line }: DiffLineRowProps) {
  const bgClass = {
    unchanged: 'bg-transparent',
    added: 'bg-green-900/20',
    removed: 'bg-red-900/20',
  }[line.type];

  const textClass = {
    unchanged: 'text-stone-600',
    added: 'text-green-400',
    removed: 'text-red-400',
  }[line.type];

  const prefix = {
    unchanged: ' ',
    added: '+',
    removed: '-',
  }[line.type];

  return (
    <tr className={bgClass}>
      {/* Line Numbers */}
      <td className="w-10 px-2 py-0.5 text-right text-xs text-stone-400 select-none border-r border-stone-200">
        {line.lineNumber.old || ''}
      </td>
      <td className="w-10 px-2 py-0.5 text-right text-xs text-stone-400 select-none border-r border-stone-200">
        {line.lineNumber.new || ''}
      </td>
      
      {/* Prefix */}
      <td className={`w-6 px-1 py-0.5 text-center ${textClass} select-none`}>
        {prefix}
      </td>
      
      {/* Content */}
      <td className={`px-2 py-0.5 whitespace-pre ${textClass}`}>
        {line.content || '\u00A0'}
      </td>
    </tr>
  );
});

// ============================================================
// Diff Computation
// ============================================================

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  
  const result: DiffLine[] = [];
  
  // Simple line-by-line comparison (could be optimized with a more complex LCS algorithm)
  let oldIdx = 0;
  let newIdx = 0;
  
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];
    
    if (oldIdx >= oldLines.length) {
      // Only new lines remain
      result.push({
        type: 'added',
        content: newLine,
        lineNumber: { new: newIdx + 1 },
      });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Only old lines remain
      result.push({
        type: 'removed',
        content: oldLine,
        lineNumber: { old: oldIdx + 1 },
      });
      oldIdx++;
    } else if (oldLine === newLine) {
      // Unchanged
      result.push({
        type: 'unchanged',
        content: oldLine,
        lineNumber: { old: oldIdx + 1, new: newIdx + 1 },
      });
      oldIdx++;
      newIdx++;
    } else {
      // Different - simple handling: remove then add
      result.push({
        type: 'removed',
        content: oldLine,
        lineNumber: { old: oldIdx + 1 },
      });
      result.push({
        type: 'added',
        content: newLine,
        lineNumber: { new: newIdx + 1 },
      });
      oldIdx++;
      newIdx++;
    }
  }
  
  return result;
}

export default PendingEditBanner;
