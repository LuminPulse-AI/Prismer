"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";

/**
 * CustomSelectionLayer - Smart text selection layer
 *
 * Solves issues with PDF.js native text selection:
 * 1. Starting selection from blank areas produces "reverse selection" (selects unwanted content)
 * 2. Selection direction is inconsistent with visual direction
 *
 * How it works:
 * 1. Overlays a transparent layer above the TextLayer
 * 2. Intelligently detects user intent:
 *    - If clicking on an interactive element (annotation, image, table), pass the event through
 *    - If clicking on blank space or text, start text selection
 * 3. Uses Range API to programmatically create selections (character-level precision)
 *
 * Compatibility design:
 * - Supports interaction with AnnotationLayer (click highlights)
 * - Supports interaction with SentenceLayer (sentence selection)
 * - Reserved for ImageLayer/TableLayer interaction (TODO)
 */

// Selector list for interactive elements
const INTERACTIVE_SELECTORS = [
  '[data-annotation-id]',     // Annotation elements
  '[data-sentence-id]',       // Sentence elements
  '[data-image-id]',          // Image elements (reserved)
  '[data-table-id]',          // Table elements (reserved)
  '.annotation-item',         // Annotation items
  '.sentence-box',            // Sentence boxes
  '.interactive-element',     // Generic interactive elements
  '.linkAnnotation',          // PDF internal links (page jumps, external links)
  '.linkAnnotation a',        // PDF link anchor elements
  '.internalLink',            // PDF.js internal links
  'a[data-internal-link]',    // Internal link markers
];

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CustomSelectionLayerProps {
  pageWidth: number;
  pageHeight: number;
  scale: number;
  textLayerRef: React.RefObject<HTMLDivElement>;
  onTextSelect?: (text: string, position: { boundingRect: DOMRect; rects: DOMRect[] }) => void;
  className?: string;
}

export const CustomSelectionLayer: React.FC<CustomSelectionLayerProps> = ({
  pageWidth,
  pageHeight,
  scale,
  textLayerRef,
  onTextSelect,
  className = "",
}) => {
  const layerRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionArea, setSelectionArea] = useState<SelectionArea | null>(null);
  // Track absolute coordinate start and end points
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const endPointRef = useRef<{ x: number; y: number } | null>(null);

  // Get all text span elements and their positions
  const getTextSpans = useCallback(() => {
    if (!textLayerRef.current) return [];
    
    // Find all spans in .textLayer
    const textLayer = textLayerRef.current.querySelector('.textLayer');
    if (!textLayer) return [];
    
    const spans = textLayer.querySelectorAll('span');
    const spanInfos: Array<{
      element: HTMLSpanElement;
      rect: DOMRect;
      text: string;
    }> = [];
    
    spans.forEach((span) => {
      const text = span.textContent || '';
      if (text.trim()) {
        const rect = span.getBoundingClientRect();
        spanInfos.push({ element: span as HTMLSpanElement, rect, text });
      }
    });
    
    return spanInfos;
  }, [textLayerRef]);

  // Check if a rectangle intersects with the selection area
  const isRectIntersecting = useCallback((
    rect: DOMRect,
    selection: { left: number; top: number; right: number; bottom: number }
  ) => {
    return !(
      rect.right < selection.left ||
      rect.left > selection.right ||
      rect.bottom < selection.top ||
      rect.top > selection.bottom
    );
  }, []);

  // Use binary search to find the exact character position at a point within a span
  const getCharacterIndexAtPoint = useCallback((
    span: HTMLSpanElement, 
    pointX: number
  ): number => {
    const textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return 0;
    
    const text = textNode.textContent || '';
    if (!text) return 0;
    
    // Use binary search to find the character position closest to pointX
    let left = 0;
    let right = text.length;
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      
      // Create a Range from the start to mid
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, mid);
      
      const rangeRect = range.getBoundingClientRect();
      
      if (rangeRect.right < pointX) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    
    return left;
  }, []);

  // Find text elements that intersect with the selection area
  const findIntersectingSpans = useCallback((area: SelectionArea) => {
    const spans = getTextSpans();
    const layerRect = layerRef.current?.getBoundingClientRect();
    if (!layerRect || spans.length === 0) return [];

    // Calculate absolute coordinates of the selection area
    const selectionRect = {
      left: layerRect.left + Math.min(area.startX, area.endX),
      top: layerRect.top + Math.min(area.startY, area.endY),
      right: layerRect.left + Math.max(area.startX, area.endX),
      bottom: layerRect.top + Math.max(area.startY, area.endY),
    };

    // Filter intersecting spans and sort by visual position (top to bottom, left to right)
    const intersecting = spans.filter(({ rect }) => 
      isRectIntersecting(rect, selectionRect)
    );

    // Sort by visual order: first by y coordinate (rows), then by x coordinate (columns)
    intersecting.sort((a, b) => {
      const rowThreshold = 5; // Row detection threshold (pixels)
      const rowDiff = a.rect.top - b.rect.top;
      if (Math.abs(rowDiff) > rowThreshold) {
        return rowDiff;
      }
      return a.rect.left - b.rect.left;
    });

    return intersecting;
  }, [getTextSpans, isRectIntersecting]);

  // Programmatically create text selection (character-level precision)
  const createSelection = useCallback((
    spans: Array<{ element: HTMLSpanElement; rect: DOMRect; text: string }>,
    startPoint: { x: number; y: number } | null,
    endPoint: { x: number; y: number } | null
  ) => {
    if (spans.length === 0) {
      window.getSelection()?.removeAllRanges();
      return;
    }

    const selection = window.getSelection();
    if (!selection) return;

    // Check if this is a single click (start and end points too close, no actual drag)
    if (startPoint && endPoint) {
      const distance = Math.sqrt(
        Math.pow(endPoint.x - startPoint.x, 2) + 
        Math.pow(endPoint.y - startPoint.y, 2)
      );
      if (distance < 5) {
        selection.removeAllRanges();
        return;
      }
    }

    selection.removeAllRanges();

    try {
      const range = document.createRange();
      
      // Spans are already sorted in visual order (top to bottom, left to right)
      const topSpan = spans[0];
      const bottomSpan = spans[spans.length - 1];
      
      const topTextNode = topSpan.element.firstChild;
      const bottomTextNode = bottomSpan.element.firstChild;
      
      if (!topTextNode || !bottomTextNode) return;

      // Determine selection direction:
      // Forward selection: top to bottom (or same row left to right)
      // Reverse selection: bottom to top (or same row right to left)
      const isForwardSelection = startPoint && endPoint && 
        (startPoint.y < endPoint.y - 5 || 
         (Math.abs(startPoint.y - endPoint.y) <= 5 && startPoint.x < endPoint.x));

      // Determine which point corresponds to which span based on selection direction
      // Forward selection: startPoint corresponds to topSpan, endPoint to bottomSpan
      // Reverse selection: startPoint corresponds to bottomSpan, endPoint to topSpan
      const topPoint = isForwardSelection ? startPoint : endPoint;
      const bottomPoint = isForwardSelection ? endPoint : startPoint;

      // Calculate character offset for topSpan (selection start position)
      let topOffset = 0;
      if (topPoint) {
        const topRect = topSpan.rect;
        const isOnSameRow = Math.abs(topPoint.y - (topRect.top + topRect.height / 2)) < topRect.height;
        if (isOnSameRow && topPoint.x > topRect.left) {
          topOffset = getCharacterIndexAtPoint(topSpan.element, topPoint.x);
        }
      }
      
      // Calculate character offset for bottomSpan (selection end position)
      let bottomOffset = bottomTextNode.textContent?.length || 0;
      if (bottomPoint) {
        const bottomRect = bottomSpan.rect;
        const isOnSameRow = Math.abs(bottomPoint.y - (bottomRect.top + bottomRect.height / 2)) < bottomRect.height;
        if (isOnSameRow && bottomPoint.x < bottomRect.right && bottomPoint.x > bottomRect.left) {
          bottomOffset = getCharacterIndexAtPoint(bottomSpan.element, bottomPoint.x);
        } else if (isOnSameRow && bottomPoint.x <= bottomRect.left) {
          // Point is to the left of bottomSpan, select to the start of this span
          bottomOffset = 0;
        }
      }
      
      // Ensure offset doesn't exceed bounds
      topOffset = Math.max(0, Math.min(topOffset, topTextNode.textContent?.length || 0));
      bottomOffset = Math.max(0, Math.min(bottomOffset, bottomTextNode.textContent?.length || 0));
      
      // For the same span, ensure topOffset < bottomOffset
      if (topSpan.element === bottomSpan.element) {
        if (topOffset === bottomOffset) {
          selection.removeAllRanges();
          return;
        }
        if (topOffset > bottomOffset) {
          [topOffset, bottomOffset] = [bottomOffset, topOffset];
        }
      }
      
      range.setStart(topTextNode, topOffset);
      range.setEnd(bottomTextNode, bottomOffset);
      selection.addRange(range);
    } catch (error) {
      console.warn("Failed to create selection:", error);
    }
  }, [getCharacterIndexAtPoint]);

  // Check if the click target is an interactive element
  const isInteractiveElement = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    
    // Check if the target element or its ancestors match interactive selectors
    for (const selector of INTERACTIVE_SELECTORS) {
      if (target.closest(selector)) {
        return true;
      }
    }
    
    return false;
  }, []);

  // Find interactive element at click position (by coordinates)
  const findInteractiveElementAtPoint = useCallback((x: number, y: number): Element | null => {
    // Temporarily hide CustomSelectionLayer to detect elements below
    const layer = layerRef.current;
    if (!layer) return null;
    
    const originalPointerEvents = layer.style.pointerEvents;
    layer.style.pointerEvents = 'none';
    
    const elementBelow = document.elementFromPoint(x, y);
    
    layer.style.pointerEvents = originalPointerEvents;
    
    if (!elementBelow) return null;
    
    // Check if it is an interactive element
    for (const selector of INTERACTIVE_SELECTORS) {
      const interactive = elementBelow.closest(selector);
      if (interactive) {
        return interactive;
      }
    }
    
    return null;
  }, []);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only handle left button

    // Check if clicking on an interactive element
    const interactiveElement = findInteractiveElementAtPoint(e.clientX, e.clientY);
    
    if (interactiveElement) {
      // Let the event pass through to the interactive element below
      // Don't prevent default behavior, don't start selection
      console.log('[CustomSelectionLayer] Click on interactive element, passing through:', interactiveElement);
      
      // For link elements, directly trigger their native behavior
      const linkElement = interactiveElement.closest('a') as HTMLAnchorElement;
      if (linkElement) {
        // Temporarily disable the selection layer
        const layer = layerRef.current;
        if (layer) {
          layer.style.pointerEvents = 'none';
        }
        
        // If it's an internal link (hash or page=), let PDF.js handle it
        const href = linkElement.getAttribute('href') || '';
        if (href.startsWith('#') || href.includes('page=')) {
          // Internal link: click directly
          linkElement.click();
        } else if (href.startsWith('http')) {
          // External link: open in new tab
          window.open(href, '_blank', 'noopener,noreferrer');
        } else {
          // Other links: click directly
          linkElement.click();
        }
        
        // Restore pointer-events
        requestAnimationFrame(() => {
          if (layer) {
            layer.style.pointerEvents = 'auto';
          }
        });
        return;
      }

      // Non-link interactive element, simulate click
      const layer = layerRef.current;
      if (layer) {
        layer.style.pointerEvents = 'none';
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        interactiveElement.dispatchEvent(clickEvent);
        
        // Restore pointer-events
        requestAnimationFrame(() => {
          if (layer) {
            layer.style.pointerEvents = 'auto';
          }
        });
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;

    // Record absolute coordinates
    startPointRef.current = { x: e.clientX, y: e.clientY };
    endPointRef.current = { x: e.clientX, y: e.clientY };

    // Clear previous selection
    window.getSelection()?.removeAllRanges();

    setIsSelecting(true);
    setSelectionArea({
      startX,
      startY,
      endX: startX,
      endY: startY,
    });

    e.preventDefault(); // Prevent default text selection behavior
  }, [findInteractiveElementAtPoint]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !selectionArea) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    // Update the end point absolute coordinates
    endPointRef.current = { x: e.clientX, y: e.clientY };

    const newArea = { ...selectionArea, endX, endY };
    setSelectionArea(newArea);

    // Find intersecting text in real time and create precise selection
    const intersecting = findIntersectingSpans(newArea);
    createSelection(intersecting, startPointRef.current, endPointRef.current);
  }, [isSelecting, selectionArea, findIntersectingSpans, createSelection]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !selectionArea) {
      setIsSelecting(false);
      setSelectionArea(null);
      return;
    }

    // Finalize selection
    const intersecting = findIntersectingSpans(selectionArea);
    createSelection(intersecting, startPointRef.current, endPointRef.current);

    // Trigger callback
    const selection = window.getSelection();
    if (selection && selection.toString().trim() && onTextSelect) {
      const range = selection.getRangeAt(0);
      const boundingRect = range.getBoundingClientRect();
      const rects: DOMRect[] = [];
      const clientRects = range.getClientRects();
      for (let i = 0; i < clientRects.length; i++) {
        rects.push(clientRects[i]);
      }
      onTextSelect(selection.toString().trim(), { boundingRect, rects });
    }

    setIsSelecting(false);
    setSelectionArea(null);
    startPointRef.current = null;
    endPointRef.current = null;
  }, [isSelecting, selectionArea, findIntersectingSpans, createSelection, onTextSelect]);

  // Listen for global mouse up (in case mouse moves outside the layer)
  useEffect(() => {
    if (!isSelecting) return;

    const handleGlobalMouseUp = () => {
      setIsSelecting(false);
      setSelectionArea(null);
      startPointRef.current = null;
      endPointRef.current = null;
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isSelecting]);

  return (
    <div
      ref={layerRef}
      className={`custom-selection-layer absolute top-0 left-0 ${className}`}
      style={{
        width: pageWidth * scale,
        height: pageHeight * scale,
        // zIndex layer hierarchy:
        // - TextLayer: 2
        // - AnnotationLayer: 5
        // - CustomSelectionLayer: 6 (slightly above AnnotationLayer)
        // - InteractionLayer: 10
        // - SentenceLayer: 15
        // - Future ImageLayer/TableLayer: adjust as needed
        zIndex: 6,
        cursor: "text",
        // Intercept mouse events, but intelligently detect and pass through interactive elements
        pointerEvents: "auto",
        background: "transparent",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      data-layer="custom-selection"
    >
      {/*
        Smart selection layer - compatibility design:
        1. Detects click target; if it's an interactive element, pass the event through
        2. Otherwise start text selection
        3. Uses data-* attributes to identify different types of interactive elements

        When adding new interactive layers:
        - Add the corresponding selector to INTERACTIVE_SELECTORS
        - Ensure the new layer's elements have the correct data-* attributes
      */}
    </div>
  );
};

