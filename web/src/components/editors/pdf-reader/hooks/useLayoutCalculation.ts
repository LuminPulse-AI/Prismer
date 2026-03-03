import { useState, useEffect, useMemo } from "react";
import { ReadingMode } from "../components/PDFToolbar";

interface LayoutCalculationParams {
  scale: number;
  originalPageSize: { width: number; height: number };
  isTagPanelOpen: boolean;
  isNotesPanelOpen: boolean;
  isGraphPanelOpen: boolean;
  isIndexPanelOpen: boolean;
  rightPanelWidth: number;
  leftPanelWidth: number;
  readingMode: ReadingMode;
}

interface LayoutResult {
  windowWidth: number;
  availableContentWidth: number;
  currentPdfWidth: number;
  spaceNeeded: number;
  needsCompression: boolean;
  rightMargin: number;
  leftMargin: number;
  maxPdfContainerWidth: number;
}

export const useLayoutCalculation = ({
  scale,
  originalPageSize,
  isTagPanelOpen,
  isNotesPanelOpen,
  isGraphPanelOpen,
  rightPanelWidth,
  isIndexPanelOpen,
  leftPanelWidth,
  readingMode,
}: LayoutCalculationParams): LayoutResult => {
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  // Listen for window resize events
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Smart compression strategy calculation
  const layoutCalculation = useMemo(() => {
    const isAnyRightPanelOpen =
      isTagPanelOpen || isNotesPanelOpen || isGraphPanelOpen;
    const isAnyLeftPanelOpen = isIndexPanelOpen;

    // Calculate actual widths and positions of components
    const containerPadding = 32; // Left/right page padding (16px * 2)
    const minGap = 32; // Minimum gap between right panel and PDF

    // Calculate available space for the PDF content area
    const availableContentWidth = windowWidth - containerPadding;
    const rightPanelTotalWidth = isAnyRightPanelOpen ? rightPanelWidth : 0;
    const leftPanelTotalWidth = isAnyLeftPanelOpen ? leftPanelWidth : 0;

    // Calculate actual width of PDF content based on reading mode
    let currentPdfWidth: number;
    switch (readingMode) {
      case "single":
      case "continuous":
        currentPdfWidth = originalPageSize.width * scale;
        break;
      case "double":
        // Double page mode: width of two pages + gap between pages
        const doublePageGap = 16; // Gap between the two pages
        currentPdfWidth = originalPageSize.width * scale * 2 + doublePageGap;
        break;
      default:
        currentPdfWidth = originalPageSize.width * scale;
    }

    // Determine if compression is needed: when left panel + right panel + min gap + current PDF width > available space
    const spaceNeeded =
      leftPanelTotalWidth + rightPanelTotalWidth + minGap + currentPdfWidth;
    const needsCompression =
      (isAnyRightPanelOpen || isAnyLeftPanelOpen) && spaceNeeded > availableContentWidth;

    // Calculate the actual right margin
    const rightMargin = isAnyRightPanelOpen 
      ? (needsCompression ? rightPanelTotalWidth + minGap : rightPanelTotalWidth + minGap)
      : 0;
    // Calculate the actual left margin
    const leftMargin = isAnyLeftPanelOpen
      ? (needsCompression ? leftPanelTotalWidth + minGap : leftPanelTotalWidth + minGap)
      : 0;

    // Calculate the maximum width of the PDF container
    const maxPdfContainerWidth = needsCompression
      ? availableContentWidth -
        rightPanelTotalWidth -
        leftPanelTotalWidth -
        minGap
      : availableContentWidth;

    return {
      windowWidth,
      availableContentWidth,
      currentPdfWidth,
      spaceNeeded,
      needsCompression,
      rightMargin,
      leftMargin,
      maxPdfContainerWidth,
    };
  }, [
    windowWidth,
    scale,
    originalPageSize,
    isTagPanelOpen,
    isNotesPanelOpen,
    isGraphPanelOpen,
    rightPanelWidth,
    leftPanelWidth,
    isIndexPanelOpen,
    readingMode,
  ]);

  return layoutCalculation;
};
