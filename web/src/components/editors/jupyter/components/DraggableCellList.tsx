'use client';

/**
 * DraggableCellList - Drag-and-drop Sortable Cell List
 *
 * Uses @dnd-kit for drag-and-drop sorting
 */

import React, { memo, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Cell, CodeCell as CodeCellType, KernelStatus } from '../types';

// ============================================================
// Type Definitions
// ============================================================

interface DraggableCellListProps {
  cells: Cell[];
  activeCellId: string | null;
  selectedCellIds: string[];
  kernelStatus: KernelStatus;
  onReorder: (startIndex: number, endIndex: number) => void;
  onSelectCell: (cellId: string, multi?: boolean) => void;
  renderCell: (cell: Cell, index: number) => React.ReactNode;
  className?: string;
}

interface SortableCellItemProps {
  cell: Cell;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (multi?: boolean) => void;
  children: React.ReactNode;
}

// ============================================================
// SortableCellItem Component
// ============================================================

const SortableCellItem = memo(function SortableCellItem({
  cell,
  index,
  isActive,
  isSelected,
  onSelect,
  children,
}: SortableCellItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cell.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect(e.metaKey || e.ctrlKey);
  }, [onSelect]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative ${isActive ? 'ring-2 ring-blue-500' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
      onClick={handleClick}
    >
      {/* Position indicator */}
      <div className="absolute left-0 top-0 bottom-0 w-8 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing text-stone-500 hover:text-stone-700 hover:bg-stone-200/60 rounded"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </button>
        {/* Position number */}
        <span className="text-xs text-stone-400 mt-1">{index + 1}</span>
      </div>

      {/* Cell content */}
      <div className="ml-8">
        {children}
      </div>
    </div>
  );
});

// ============================================================
// DraggableCellList Component
// ============================================================

export const DraggableCellList = memo(function DraggableCellList({
  cells,
  activeCellId,
  selectedCellIds,
  kernelStatus,
  onReorder,
  onSelectCell,
  renderCell,
  className = '',
}: DraggableCellListProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const cellIds = useMemo(() => cells.map(c => c.id), [cells]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = cells.findIndex(c => c.id === active.id);
      const newIndex = cells.findIndex(c => c.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(oldIndex, newIndex);
      }
    }
  }, [cells, onReorder]);

  const activeCell = activeId ? cells.find(c => c.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={cellIds} strategy={verticalListSortingStrategy}>
        <div className={`space-y-2 ${className}`}>
          {cells.map((cell, index) => (
            <SortableCellItem
              key={cell.id}
              cell={cell}
              index={index}
              isActive={activeCellId === cell.id}
              isSelected={selectedCellIds.includes(cell.id)}
              onSelect={(multi) => onSelectCell(cell.id, multi)}
            >
              {renderCell(cell, index)}
            </SortableCellItem>
          ))}
        </div>
      </SortableContext>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeCell && (
          <div className="opacity-80 bg-white rounded-lg shadow-xl border border-blue-500">
            {renderCell(activeCell, cells.findIndex(c => c.id === activeCell.id))}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
});

export default DraggableCellList;
