/**
 * usePageNavigation - Unified page navigation hook
 *
 * Problems solved:
 * 1. Bug where keyboard page turns in double-page mode required two presses
 * 2. Inconsistent semantics across different navigation methods
 * 3. Page number normalization across different reading modes
 *
 * Core principles:
 * - In double-page mode, pageNumber is always odd (left page number)
 * - All navigation methods are mode-aware
 * - Provides a unified API for all callers
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

export type ReadingMode = 'single' | 'continuous' | 'double';

export interface PageNavigationAPI {
  // State
  pageNumber: number;
  
  // Core navigation methods
  goToPage: (targetPage: number) => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  
  // Direct setter (backward compatible with old API)
  setPageNumber: (page: number) => void;
  
  // Helper methods
  normalizePageNumber: (page: number) => number;
  getDisplayedPages: () => number[];
  canGoToPrev: boolean;
  canGoToNext: boolean;
}

export function usePageNavigation(
  numPages: number,
  readingMode: ReadingMode,
  initialPage: number = 1
): PageNavigationAPI {
  const [pageNumber, setPageNumberInternal] = useState(initialPage);

  /**
   * Normalize page number
   * - Ensures it is within valid range [1, numPages]
   * - In double-page mode, ensures it is odd (left page)
   */
  const normalizePageNumber = useCallback((page: number): number => {
    // Boundary check
    if (numPages <= 0) return 1;
    const clamped = Math.max(1, Math.min(page, numPages));
    
    // Double-page mode: ensure it is odd (left page)
    if (readingMode === 'double' && clamped % 2 === 0 && clamped > 1) {
      return clamped - 1;
    }
    
    return clamped;
  }, [readingMode, numPages]);

  /**
   * Navigate to a specific page (auto-normalizes).
   * This is the unified entry point for all page navigation.
   */
  const goToPage = useCallback((targetPage: number) => {
    const normalized = normalizePageNumber(targetPage);
    setPageNumberInternal(normalized);
  }, [normalizePageNumber]);

  /**
   * Previous page (mode-aware)
   * - Single/continuous mode: -1
   * - Double-page mode: -2
   */
  const goToPrevPage = useCallback(() => {
    setPageNumberInternal(prev => {
      const step = readingMode === 'double' ? 2 : 1;
      const newPage = prev - step;
      return normalizePageNumber(newPage);
    });
  }, [readingMode, normalizePageNumber]);

  /**
   * Next page (mode-aware)
   * - Single/continuous mode: +1
   * - Double-page mode: +2
   */
  const goToNextPage = useCallback(() => {
    setPageNumberInternal(prev => {
      const step = readingMode === 'double' ? 2 : 1;
      const newPage = prev + step;
      return normalizePageNumber(newPage);
    });
  }, [readingMode, normalizePageNumber]);

  /**
   * Get the list of currently displayed pages
   * - Single/continuous mode: [pageNumber]
   * - Double-page mode: [leftPage, rightPage] or [leftPage] (if it's the last page)
   */
  const getDisplayedPages = useCallback((): number[] => {
    if (readingMode === 'double') {
      const leftPage = pageNumber;
      const rightPage = pageNumber + 1;
      if (rightPage <= numPages) {
        return [leftPage, rightPage];
      }
      return [leftPage];
    }
    return [pageNumber];
  }, [readingMode, pageNumber, numPages]);

  /**
   * Whether it is possible to go to the previous page
   */
  const canGoToPrev = useMemo(() => {
    return pageNumber > 1;
  }, [pageNumber]);

  /**
   * Whether it is possible to go to the next page
   */
  const canGoToNext = useMemo(() => {
    if (readingMode === 'double') {
      // Double-page mode: check if there are pages after the right page
      return pageNumber + 2 <= numPages;
    }
    return pageNumber < numPages;
  }, [pageNumber, numPages, readingMode]);

  /**
   * Normalize current page number when reading mode changes.
   * For example: when switching from single to double-page mode, if the current page is even, adjust to odd.
   */
  useEffect(() => {
    const normalized = normalizePageNumber(pageNumber);
    if (normalized !== pageNumber) {
      setPageNumberInternal(normalized);
    }
  }, [readingMode, normalizePageNumber, pageNumber]);

  /**
   * When numPages changes (e.g., PDF finishes loading), ensure the page number is valid.
   */
  useEffect(() => {
    if (numPages > 0 && pageNumber > numPages) {
      setPageNumberInternal(normalizePageNumber(numPages));
    }
  }, [numPages, pageNumber, normalizePageNumber]);

  return {
    pageNumber,
    goToPage,
    goToPrevPage,
    goToNextPage,
    setPageNumber: goToPage, // Backward compatible with old API
    normalizePageNumber,
    getDisplayedPages,
    canGoToPrev,
    canGoToNext,
  };
}

export default usePageNavigation;
