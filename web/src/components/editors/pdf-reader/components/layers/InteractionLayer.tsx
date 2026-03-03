"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";

interface InteractionLayerProps {
  pageWidth: number;
  pageHeight: number;
  onTextSelect?: (text: string) => void;
  onAreaClick?: (x: number, y: number) => void;
  onAnnotationCreate?: (annotation: {
    type: "highlight" | "note";
    position: { x: number; y: number; width?: number; height?: number };
    content: string;
  }) => void;
  className?: string;
}

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const InteractionLayer: React.FC<InteractionLayerProps> = ({
  pageWidth,
  pageHeight,
  onTextSelect,
  onAreaClick,
  onAnnotationCreate,
  className = "",
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionArea, setSelectionArea] = useState<SelectionArea | null>(
    null
  );
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({
    x: 0,
    y: 0,
  });

  // Handle mouse click
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Hide context menu
      setShowContextMenu(false);

      onAreaClick?.(x, y);
    },
    [onAreaClick]
  );

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim();
      onTextSelect?.(selectedText);
    }
  }, [onTextSelect]);

  // Handle mouse down (start area selection)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      // Left button
      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;

      setIsSelecting(true);
      setSelectionArea({
        startX,
        startY,
        endX: startX,
        endY: startY,
      });
    }
  }, []);

  // Handle mouse move (update selection area)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isSelecting && selectionArea) {
        const rect = e.currentTarget.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        setSelectionArea((prev) =>
          prev
            ? {
                ...prev,
                endX,
                endY,
              }
            : null
        );
      }
    },
    [isSelecting, selectionArea]
  );

  // Handle mouse up (complete area selection)
  const handleMouseUp = useCallback(
    () => {
      if (isSelecting && selectionArea) {
        const minWidth = 10;
        const minHeight = 10;
        const width = Math.abs(selectionArea.endX - selectionArea.startX);
        const height = Math.abs(selectionArea.endY - selectionArea.startY);

        // If the selection area is large enough, show the annotation context menu
        if (width > minWidth && height > minHeight) {
          setContextMenuPosition({
            x: Math.max(selectionArea.startX, selectionArea.endX),
            y: Math.min(selectionArea.startY, selectionArea.endY),
          });
          setShowContextMenu(true);
        }
      }

      setIsSelecting(false);
      handleTextSelection();
    },
    [isSelecting, selectionArea, handleTextSelection]
  );

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setContextMenuPosition({ x, y });
    setShowContextMenu(true);
  }, []);

  // Create highlight annotation
  const createHighlightAnnotation = useCallback(() => {
    if (selectionArea && onAnnotationCreate) {
      const x = Math.min(selectionArea.startX, selectionArea.endX);
      const y = Math.min(selectionArea.startY, selectionArea.endY);
      const width = Math.abs(selectionArea.endX - selectionArea.startX);
      const height = Math.abs(selectionArea.endY - selectionArea.startY);

      onAnnotationCreate({
        type: "highlight",
        position: { x, y, width, height },
        content: 'Highlighted area',
      });
    }

    setShowContextMenu(false);
    setSelectionArea(null);
  }, [selectionArea, onAnnotationCreate]);

  // Create note annotation
  const createNoteAnnotation = useCallback(() => {
    if (selectionArea && onAnnotationCreate) {
      const content = prompt("Enter your note content:");
      if (content) {
        onAnnotationCreate({
          type: "note",
          position: {
            x: contextMenuPosition.x,
            y: contextMenuPosition.y,
          },
          content,
        });
      }
    }

    setShowContextMenu(false);
    setSelectionArea(null);
  }, [selectionArea, contextMenuPosition, onAnnotationCreate]);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (layerRef.current && !layerRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
        setSelectionArea(null);
      }
    };

    if (showContextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showContextMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowContextMenu(false);
        setSelectionArea(null);
        setIsSelecting(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      ref={layerRef}
      className={`interaction-layer absolute top-0 left-0 ${className}`}
      style={{
        width: pageWidth,
        height: pageHeight,
        zIndex: 10,
        // Use text cursor, consistent with TextLayer, for better UX
        cursor: 'text',
      }}
      data-layer="interaction"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      {/* Selection area indicator */}
      {isSelecting && selectionArea && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-20 pointer-events-none"
          style={{
            left: Math.min(selectionArea.startX, selectionArea.endX),
            top: Math.min(selectionArea.startY, selectionArea.endY),
            width: Math.abs(selectionArea.endX - selectionArea.startX),
            height: Math.abs(selectionArea.endY - selectionArea.startY),
          }}
        />
      )}

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="absolute bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          style={{
            left: Math.min(contextMenuPosition.x, pageWidth - 150),
            top: Math.min(contextMenuPosition.y, pageHeight - 100),
          }}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors"
            onClick={createHighlightAnnotation}
          >
            📝 Create Highlight
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 transition-colors"
            onClick={createNoteAnnotation}
          >
            💬 Add Note
          </button>
          <hr className="my-1 border-gray-200" />
          <button
            className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-100 transition-colors"
            onClick={() => setShowContextMenu(false)}
          >
            ❌ Cancel
          </button>
        </div>
      )}
    </div>
  );
};
