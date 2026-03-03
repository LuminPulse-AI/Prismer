import React, { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

// Sentence data structure (based on sentences.json)
interface SentenceBox {
  line_no: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] normalized coordinates
}

interface Sentence {
  id: number;
  content: string;
  boxes: SentenceBox[];
  page_id: number;
  property: {
    page: number;
    block_no: number;
    line_nos: number[];
  };
}

interface SentenceLayerProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  sentences: Sentence[];
  isEnabled: boolean;
  selectedSentenceIds?: number[];
  onSentenceClick?: (
    sentenceIds: number[],
    position: { x: number; y: number },
    clickedPageNumber?: number
  ) => void;
  className?: string;
}

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const SentenceLayer: React.FC<SentenceLayerProps> = ({
  pageNumber,
  pageWidth,
  pageHeight,
  scale,
  sentences,
  isEnabled,
  selectedSentenceIds = [],
  onSentenceClick,
  className = "",
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const sentenceRectsRef = useRef<Map<number, DOMRect[]>>(new Map());

  // State management
  const [hoveredSentenceId, setHoveredSentenceId] = useState<number | null>(
    null
  );
  const [selectedSentences, setSelectedSentences] = useState<Set<number>>(
    new Set()
  );
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionArea, setSelectionArea] = useState<SelectionArea | null>(
    null
  );
  const [previewSelectedSentences, setPreviewSelectedSentences] = useState<
    Set<number>
  >(new Set());
  const [isCommandPressed, setIsCommandPressed] = useState(false);

  // Filter sentences for the current page
  const pageSentences = sentences.filter(
    (sentence) => sentence.property.page === pageNumber
  );

  // Listen for keyboard events (Cmd/Ctrl key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        setIsCommandPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) {
        setIsCommandPressed(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Coordinate conversion: convert normalized coordinates to actual pixel coordinates
  const convertCoordinates = useCallback(
    (bbox: [number, number, number, number]) => {
      const [x1, y1, x2, y2] = bbox;
      return {
        left: x1 * pageWidth * scale,
        top: y1 * pageHeight * scale,
        width: (x2 - x1) * pageWidth * scale,
        height: (y2 - y1) * pageHeight * scale,
      };
    },
    [pageWidth, pageHeight, scale]
  );

  // Check if a point is inside a rectangle
  const isPointInRect = useCallback((x: number, y: number, rect: DOMRect) => {
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }, []);

  // Check if two rectangles intersect
  const doRectsIntersect = useCallback(
    (
      rect1: DOMRect,
      rect2: { left: number; top: number; width: number; height: number }
    ) => {
      const rect2Right = rect2.left + rect2.width;
      const rect2Bottom = rect2.top + rect2.height;

      return !(
        rect1.right < rect2.left ||
        rect1.left > rect2Right ||
        rect1.bottom < rect2.top ||
        rect1.top > rect2Bottom
      );
    },
    []
  );

  // Find a sentence at the given mouse position
  const findSentenceAtPoint = useCallback(
    (x: number, y: number) => {
      for (const sentence of pageSentences) {
        const rects = sentenceRectsRef.current.get(sentence.id);
        if (rects) {
          for (const rect of rects) {
            if (isPointInRect(x, y, rect)) {
              return sentence.id;
            }
          }
        }
      }
      return null;
    },
    [pageSentences, isPointInRect]
  );

  // Find sentences within the selection area
  const findSentencesInArea = useCallback(
    (selectionRect: {
      left: number;
      top: number;
      width: number;
      height: number;
    }) => {
      const intersectedSentences = new Set<number>();

      for (const sentence of pageSentences) {
        const rects = sentenceRectsRef.current.get(sentence.id);
        if (rects) {
          for (const rect of rects) {
            if (doRectsIntersect(rect, selectionRect)) {
              intersectedSentences.add(sentence.id);
              break;
            }
          }
        }
      }

      return intersectedSentences;
    },
    [pageSentences, doRectsIntersect]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isEnabled || isSelecting) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const sentenceId = findSentenceAtPoint(x, y);
      setHoveredSentenceId(sentenceId);
    },
    [isEnabled, isSelecting, findSentenceAtPoint]
  );

  const handleMouseClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEnabled) return;

      if (isSelecting) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const sentenceId = findSentenceAtPoint(x, y);

      if (sentenceId) {
        let newSelectedSentences: Set<number>;

        if (isCommandPressed) {
          newSelectedSentences = new Set(selectedSentenceIds);
          if (newSelectedSentences.has(sentenceId)) {
            newSelectedSentences.delete(sentenceId);
          } else {
            newSelectedSentences.add(sentenceId);
          }
        } else {
          newSelectedSentences = new Set([sentenceId]);
        }

        console.log("Sentence selected:", Array.from(newSelectedSentences));

        setSelectedSentences(newSelectedSentences);

        if (onSentenceClick) {
          console.log(
            "Triggering onSentenceClick callback with:",
            Array.from(newSelectedSentences)
          );
          onSentenceClick(
            Array.from(newSelectedSentences),
            {
              x: e.clientX,
              y: e.clientY,
            },
            pageNumber
          );
        } else {
          console.log("onSentenceClick callback not provided");
        }
      }
    },
    [
      isEnabled,
      isSelecting,
      findSentenceAtPoint,
      isCommandPressed,
      selectedSentenceIds,
      onSentenceClick,
      pageNumber,
    ]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isEnabled || e.button !== 0) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;

      const clickedSentence = findSentenceAtPoint(startX, startY);

      if (!clickedSentence) {
        setSelectedSentences(new Set());

        if (onSentenceClick) {
          onSentenceClick(
            [],
            {
              x: e.clientX,
              y: e.clientY,
            },
            pageNumber
          );
        }
      }

      if (clickedSentence && !isCommandPressed) {
        return;
      }

      // Start drag selection
      setIsSelecting(true);
      setSelectionArea({
        startX,
        startY,
        endX: startX,
        endY: startY,
      });
      setPreviewSelectedSentences(new Set());

      e.preventDefault();
    },
    [
      isEnabled,
      findSentenceAtPoint,
      isCommandPressed,
      selectedSentenceIds,
      onSentenceClick,
      pageNumber,
    ]
  );

  // Handle drag selection movement
  const handleSelectionMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting || !selectionArea) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const newSelectionArea = { ...selectionArea, endX, endY };
      setSelectionArea(newSelectionArea);

      // Calculate and preview sentences within the drag area in real time
      const selectionRect = {
        left: Math.min(newSelectionArea.startX, newSelectionArea.endX),
        top: Math.min(newSelectionArea.startY, newSelectionArea.endY),
        width: Math.abs(newSelectionArea.endX - newSelectionArea.startX),
        height: Math.abs(newSelectionArea.endY - newSelectionArea.startY),
      };

      // Only show preview when the drag area is large enough
      if (selectionRect.width > 3 && selectionRect.height > 3) {
        const intersectedSentences = findSentencesInArea(selectionRect);

        let previewSentences: Set<number>;

        if (isCommandPressed) {
          // Cmd/Ctrl pressed: show incremental selection preview (based on persistent highlight state)
          previewSentences = new Set(selectedSentenceIds);
          intersectedSentences.forEach((id) => {
            if (previewSentences.has(id)) {
              previewSentences.delete(id); // Deselect
            } else {
              previewSentences.add(id); // Add to selection
            }
          });
        } else {
          // Normal drag: show replacement selection preview
          previewSentences = intersectedSentences;
        }

        setPreviewSelectedSentences(previewSentences);
      } else {
        // Drag area too small, clear preview
        setPreviewSelectedSentences(new Set());
      }
    },
    [
      isSelecting,
      selectionArea,
      findSentencesInArea,
      isCommandPressed,
      selectedSentenceIds,
    ]
  );

  // Handle mouse up (complete drag selection)
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting || !selectionArea) return;

      const selectionRect = {
        left: Math.min(selectionArea.startX, selectionArea.endX),
        top: Math.min(selectionArea.startY, selectionArea.endY),
        width: Math.abs(selectionArea.endX - selectionArea.startX),
        height: Math.abs(selectionArea.endY - selectionArea.startY),
      };

      if (selectionRect.width > 5 && selectionRect.height > 5) {
        const intersectedSentences = findSentencesInArea(selectionRect);

        let newSelectedSentences: Set<number>;

        if (isCommandPressed) {
          newSelectedSentences = new Set(selectedSentenceIds);
          intersectedSentences.forEach((id) => {
            if (newSelectedSentences.has(id)) {
              newSelectedSentences.delete(id); // Deselect
            } else {
              newSelectedSentences.add(id); // Add selection
            }
          });
        } else {
          newSelectedSentences = intersectedSentences;
        }

        console.log("Selection result:", Array.from(newSelectedSentences));

        setSelectedSentences(newSelectedSentences);

        if (onSentenceClick) {
          console.log(
            "Triggering onSentenceClick callback with:",
            Array.from(newSelectedSentences),
            {
              x: e.clientX,
              y: e.clientY,
            }
          );
          onSentenceClick(
            Array.from(newSelectedSentences),
            {
              x: e.clientX,
              y: e.clientY,
            },
            pageNumber
          );
        } else {
          console.log("onSentenceClick callback not provided");
        }
      } else {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const clickedSentence = findSentenceAtPoint(clickX, clickY);

        if (!clickedSentence) {
          console.log("Small drag ended on empty area, clearing selection");

          setSelectedSentences(new Set());
          if (selectedSentenceIds.length > 0) {
            if (onSentenceClick) {
              onSentenceClick(
                [],
                {
                  x: e.clientX,
                  y: e.clientY,
                },
                pageNumber
              );
            }
          }
        } else {
          console.log("Selection area too small, ignoring");
        }
      }

      setIsSelecting(false);
      setSelectionArea(null);

      setPreviewSelectedSentences(new Set());
    },
    [
      isSelecting,
      selectionArea,
      findSentencesInArea,
      isCommandPressed,
      selectedSentenceIds,
      onSentenceClick,
      pageNumber,
      findSentenceAtPoint,
    ]
  );

  useEffect(() => {
    const updateSentenceRects = () => {
      const newRects = new Map<number, DOMRect[]>();

      pageSentences.forEach((sentence) => {
        const rects: DOMRect[] = [];
        sentence.boxes.forEach((box) => {
          const coords = convertCoordinates(box.bbox);
          rects.push(
            new DOMRect(coords.left, coords.top, coords.width, coords.height)
          );
        });
        newRects.set(sentence.id, rects);
      });

      sentenceRectsRef.current = newRects;
    };

    updateSentenceRects();
  }, [pageSentences, convertCoordinates]);

  const prevSelectedSentenceIdsRef = useRef<number[]>(selectedSentenceIds);

  useEffect(() => {
    const prevIds = prevSelectedSentenceIdsRef.current;
    const currentIds = selectedSentenceIds;

    const removedIds = prevIds.filter((id) => !currentIds.includes(id));

    if (removedIds.length > 0 && selectedSentences.size > 0) {
      const hasRemovedSentence = removedIds.some((id) =>
        selectedSentences.has(id)
      );

      if (hasRemovedSentence) {
        setSelectedSentences(new Set());
      }
    }

    prevSelectedSentenceIdsRef.current = selectedSentenceIds;
  }, [selectedSentenceIds, selectedSentences]);

  useEffect(() => {
    if (!isEnabled) {
      setSelectedSentences(new Set());
      setHoveredSentenceId(null);
      setIsSelecting(false);
      setSelectionArea(null);
      setPreviewSelectedSentences(new Set());
      if (onSentenceClick) {
        onSentenceClick([], { x: 0, y: 0 }, pageNumber);
      }
    }
  }, [isEnabled]);

  const renderSentenceRects = () => {
    return pageSentences.map((sentence) => {
      const isHovered = hoveredSentenceId === sentence.id;
      const isTemporarySelected = selectedSentences.has(sentence.id);
      const isPermanentlyHighlighted = selectedSentenceIds.includes(
        sentence.id
      );
      const isPreviewSelected =
        isSelecting && previewSelectedSentences.has(sentence.id);

      const color = "#32AECA"; // Default sentence highlight color

      return sentence.boxes.map((box, index) => {
        const coords = convertCoordinates(box.bbox);

        return (
          <div
            key={`sentence-${sentence.id}-box-${index}`}
            className={cn(
              "absolute pointer-events-none transition-all duration-200",
              {
                "bg-blue-200 bg-opacity-60 shadow-md":
                  isHovered &&
                  !isTemporarySelected &&
                  !isPermanentlyHighlighted &&
                  !isPreviewSelected,
                "bg-[#32AECA] bg-opacity-40":
                  isTemporarySelected && !isPreviewSelected,
                "bg-yellow-200 bg-opacity-60":
                  isPermanentlyHighlighted &&
                  !isTemporarySelected &&
                  !isPreviewSelected,
                "bg-orange-300 bg-opacity-50": isPreviewSelected,
              }
            )}
            style={{
              left: coords.left,
              top: coords.top,
              width: coords.width,
              height: coords.height,
              borderRadius: "2px",
              zIndex: isPreviewSelected
                ? 3
                : isPermanentlyHighlighted
                  ? 2
                  : isTemporarySelected
                    ? 2
                    : isHovered
                      ? 1
                      : 0,
              ...(isPreviewSelected && {
                backgroundColor: "rgba(251, 146, 60, 0.4)",
                border: "2px solid #f97316",
                boxSizing: "border-box",
              }),
              ...(isPermanentlyHighlighted &&
                !isTemporarySelected &&
                !isPreviewSelected && {
                  backgroundColor: color,
                  border: `2px solid ${color.substring(0, 7)}`,
                  boxSizing: "border-box",
                }),
              ...(isTemporarySelected &&
                !isPreviewSelected && {
                  backgroundColor: "rgba(50, 174, 202, 0.4)",
                  border: "2px solid #32AECA",
                  boxSizing: "border-box",
                }),
            }}
          />
        );
      });
    });
  };

  if (!isEnabled) {
    return null;
  }

  return (
    <div
      ref={layerRef}
      className={cn(
        "sentence-layer absolute top-0 left-0 pointer-events-auto",
        className
      )}
      style={{
        width: pageWidth * scale,
        height: pageHeight * scale,
        zIndex: 15,
      }}
      data-layer="sentence"
      onMouseMove={isSelecting ? handleSelectionMove : handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleMouseClick}
    >
      {/* Render sentence highlight rectangles */}
      {renderSentenceRects()}

      {/* Drag selection area indicator */}
      {isSelecting && selectionArea && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-200 bg-opacity-20 pointer-events-none"
          style={{
            left: Math.min(selectionArea.startX, selectionArea.endX),
            top: Math.min(selectionArea.startY, selectionArea.endY),
            width: Math.abs(selectionArea.endX - selectionArea.startX),
            height: Math.abs(selectionArea.endY - selectionArea.startY),
            borderRadius: "2px",
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
};
