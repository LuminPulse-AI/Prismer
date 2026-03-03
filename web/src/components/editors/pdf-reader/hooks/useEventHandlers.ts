import { useState, useCallback, useRef, useEffect } from "react";

interface EventHandlersParams {
  paperId: string | number;
  pageNumber: number;
  scale: number;
  numPages: number;
  // Mode-aware page navigation functions
  goToPrevPage: () => void;
  goToNextPage: () => void;
  canGoToPrev: boolean;
  canGoToNext: boolean;
  setScale: (scale: number) => void;
}

export const useEventHandlers = ({
  paperId,
  pageNumber,
  scale,
  numPages,
  goToPrevPage,
  goToNextPage,
  canGoToPrev,
  canGoToNext,
  setScale,
}: EventHandlersParams) => {
  const [hoveredWord, setHoveredWord] = useState<{
    text: string;
    position: { x: number; y: number };
  } | null>(null);
  const [selectedText, setSelectedText] = useState<{
    text: string;
    position: { x: number; y: number };
  } | null>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function: find the page number from a selection range
  const findPageFromSelection = useCallback((range: Range): number | null => {
    // Get the common ancestor container of the selection range
    let container = range.commonAncestorContainer;

    // If it's a text node, traverse up to find an element node
    if (container.nodeType === Node.TEXT_NODE) {
      container = container.parentElement!;
    }

    // Traverse up the DOM tree to find an element with data-page-number
    let current = container as HTMLElement;
    while (current && current !== document.body) {
      if (current.hasAttribute && current.hasAttribute("data-page-number")) {
        const pageNum = parseInt(
          current.getAttribute("data-page-number") || "0",
          10
        );
        return pageNum > 0 ? pageNum : null;
      }

      // Check if there is a page container in the parent elements
      const pageContainer = current.closest(
        "[data-page-number]"
      ) as HTMLElement;
      if (pageContainer) {
        const pageNum = parseInt(
          pageContainer.getAttribute("data-page-number") || "0",
          10
        );
        return pageNum > 0 ? pageNum : null;
      }

      current = current.parentElement!;
    }

    // If not found, try to infer from position (handles certain edge cases)
    const rect = range.getBoundingClientRect();
    const elements = document.elementsFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );

    for (const element of elements) {
      const pageContainer = element.closest(
        "[data-page-number]"
      ) as HTMLElement;
      if (pageContainer) {
        const pageNum = parseInt(
          pageContainer.getAttribute("data-page-number") || "0",
          10
        );
        return pageNum > 0 ? pageNum : null;
      }
    }

    return null;
  }, []);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const range = selection.getRangeAt(0);

      // Check if the selected text is from the PDF content area
      const pageNumber = findPageFromSelection(range);
      if (!pageNumber) {
        // If the selected text is not within the PDF area, clear the selection state
        setSelectedText(null);
        return;
      }

      const rect = range.getBoundingClientRect();

      setSelectedText({
        text: selection.toString().trim(),
        position: {
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY + 10,
        },
      });
    } else {
      setSelectedText(null);
    }
  }, [findPageFromSelection]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // If the user is typing in an input field, do not process shortcuts
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // If it's a search-related shortcut, let the search hook handle it
      if (e.ctrlKey && e.key === "f") {
        return; // Let usePDFSearch handle this
      }
      if (
        e.key === "[" ||
        e.key === "<" ||
        e.key === "]" ||
        e.key === ">" ||
        e.key === "Escape"
      ) {
        return; // Let usePDFSearch handle this
      }

      // Left/right arrow keys for page navigation - using mode-aware navigation functions
      if (e.key === "ArrowLeft" && canGoToPrev) {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === "ArrowRight" && canGoToNext) {
        e.preventDefault();
        goToNextPage();
      }

      // Shift + + zoom in, Shift + - zoom out
      if (e.shiftKey) {
        // Zoom in: handle Shift + = (typically +)
        if (e.key === "+" || e.key === "=" || e.code === "Equal") {
          e.preventDefault();
          const newScale = Math.min(2.0, scale + 0.1);
          setScale(newScale);
        }
        // Zoom out: handle Shift + - (or _)
        else if (e.key === "-" || e.key === "_" || e.code === "Minus") {
          e.preventDefault();
          const newScale = Math.max(0.5, scale - 0.1);
          setScale(newScale);
        }
      }
    },
    [scale, canGoToPrev, canGoToNext, goToPrevPage, goToNextPage, setScale]
  );

  // Listen for text selection events
  useEffect(() => {
    document.addEventListener("mouseup", handleTextSelection);
    return () => document.removeEventListener("mouseup", handleTextSelection);
  }, [handleTextSelection]);

  // Add and remove keyboard event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return {
    hoveredWord,
    selectedText,
    hoverTimerRef,
    setHoveredWord,
    setSelectedText,
    handleTextSelection,
    handleKeyDown,
  };
};
