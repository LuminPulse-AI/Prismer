'use client';

/**
 * VirtualizedCellList - Virtualized Cell List
 *
 * Uses @tanstack/react-virtual for virtual scrolling.
 * Only renders cells in the visible area, improving performance for large notebooks.
 */

import React, { useRef, useCallback, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus } from 'lucide-react';
import { CodeCell } from './CodeCell';
import { AgentCell } from './AgentCell';
import type { 
  Cell, 
  CodeCell as CodeCellType, 
  AgentCell as AgentCellType,
  KernelStatus,
} from '../types';

// ============================================================
// Type Definitions
// ============================================================

interface VirtualizedCellListProps {
  cells: Cell[];
  agentResponses?: AgentCellType[];
  activeCellId: string | null;
  kernelStatus: KernelStatus;
  onExecuteCell: (cellId: string) => void;
  onSourceChange: (cellId: string, source: string) => void;
  onDeleteCell: (cellId: string) => void;
  onFocusCell: (cellId: string) => void;
  onMoveCell?: (cellId: string, direction: 'up' | 'down') => void;
  onAddCell: () => void;
  onAgentExecuteCode?: (code: string) => void;
  onAgentInsertCode?: (code: string) => void;
  estimatedCellHeight?: number;
  overscan?: number;
}

interface CellItem {
  type: 'code' | 'agent';
  id: string;
  data: CodeCellType | AgentCellType;
  index: number;
}

// ============================================================
// VirtualizedCellList Component
// ============================================================

export const VirtualizedCellList = memo(function VirtualizedCellList({
  cells,
  agentResponses = [],
  activeCellId,
  kernelStatus,
  onExecuteCell,
  onSourceChange,
  onDeleteCell,
  onFocusCell,
  onMoveCell,
  onAddCell,
  onAgentExecuteCode,
  onAgentInsertCode,
  estimatedCellHeight = 150,
  overscan = 3,
}: VirtualizedCellListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Merge agent responses and code cells into a unified list
  const items = useMemo((): CellItem[] => {
    const allItems: CellItem[] = [];
    
    // Agent responses come first
    agentResponses.forEach((response, index) => {
      allItems.push({
        type: 'agent',
        id: response.id,
        data: response,
        index,
      });
    });

    // Code cells
    cells.forEach((cell, index) => {
      if (cell.type === 'code') {
        allItems.push({
          type: 'code',
          id: cell.id,
          data: cell as CodeCellType,
          index: agentResponses.length + index,
        });
      }
    });

    return allItems;
  }, [cells, agentResponses]);

  // Dynamically estimate each cell's height
  const estimateSize = useCallback((index: number) => {
    const item = items[index];
    if (!item) return estimatedCellHeight;

    if (item.type === 'agent') {
      const agentCell = item.data as AgentCellType;
      // Estimate height based on content length
      const contentLines = agentCell.content.split('\n').length;
      const actionsHeight = (agentCell.actions?.length || 0) * 100;
      return Math.max(100, contentLines * 24 + actionsHeight + 60);
    }

    if (item.type === 'code') {
      const codeCell = item.data as CodeCellType;
      const sourceLines = codeCell.source.split('\n').length;
      const outputHeight = codeCell.outputs.length > 0 ? 100 : 0;
      // Code line height ~19px, plus header and padding
      return Math.max(80, sourceLines * 19 + 60 + outputHeight);
    }

    return estimatedCellHeight;
  }, [items, estimatedCellHeight]);

  // Create virtualizer
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
    // Enable dynamic size measurement
    measureElement: (element) => {
      return element.getBoundingClientRect().height;
    },
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Render a single cell
  const renderCell = useCallback((item: CellItem, virtualIndex: number) => {
    if (item.type === 'agent') {
      const agentCell = item.data as AgentCellType;
      return (
        <AgentCell
          key={agentCell.id}
          cell={agentCell}
          onExecuteCode={onAgentExecuteCode}
          onInsertCode={onAgentInsertCode}
        />
      );
    }

    if (item.type === 'code') {
      const codeCell = item.data as CodeCellType;
      const cellIndex = cells.findIndex(c => c.id === codeCell.id);
      
      return (
        <CodeCell
          key={codeCell.id}
          cell={codeCell}
          isActive={activeCellId === codeCell.id}
          kernelStatus={kernelStatus}
          onExecute={() => onExecuteCell(codeCell.id)}
          onSourceChange={(source) => onSourceChange(codeCell.id, source)}
          onDelete={() => onDeleteCell(codeCell.id)}
          onFocus={() => onFocusCell(codeCell.id)}
          onMoveUp={cellIndex > 0 && onMoveCell 
            ? () => onMoveCell(codeCell.id, 'up') 
            : undefined}
          onMoveDown={cellIndex < cells.length - 1 && onMoveCell 
            ? () => onMoveCell(codeCell.id, 'down') 
            : undefined}
        />
      );
    }

    return null;
  }, [
    cells, 
    activeCellId, 
    kernelStatus, 
    onExecuteCell, 
    onSourceChange, 
    onDeleteCell, 
    onFocusCell, 
    onMoveCell,
    onAgentExecuteCode,
    onAgentInsertCode,
  ]);

  return (
    <div 
      ref={parentRef}
      className="flex-1 overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        className="p-4"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;

          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderCell(item, virtualRow.index)}
            </div>
          );
        })}

        {/* Add Cell Button - Fixed at bottom */}
        <div
          style={{
            position: 'absolute',
            top: `${virtualizer.getTotalSize()}px`,
            left: 0,
            right: 0,
            padding: '0 16px 16px',
          }}
        >
          <button
            onClick={onAddCell}
            className="w-full py-2 border border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-slate-300 hover:border-slate-500 flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Add Cell
          </button>
        </div>
      </div>
    </div>
  );
});

// ============================================================
// Hooks
// ============================================================

/**
 * Scroll to a specific cell
 */
export function useScrollToCell(
  virtualizerRef: React.RefObject<ReturnType<typeof useVirtualizer> | null>,
  cells: Cell[]
) {
  return useCallback((cellId: string) => {
    if (!virtualizerRef.current) return;
    
    const index = cells.findIndex(c => c.id === cellId);
    if (index !== -1) {
      virtualizerRef.current.scrollToIndex(index, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [cells, virtualizerRef]);
}

export default VirtualizedCellList;
