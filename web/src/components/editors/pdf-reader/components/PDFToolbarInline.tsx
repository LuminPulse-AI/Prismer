/**
 * PDF Toolbar Inline
 * 
 * Toolbar embedded inside the PDF container.
 * Layout: Left (reading mode) - Center (search) - Right (page number + zoom)
 */

"use client";

import React, { useState, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Search,
  X,
  TextSelect,
  AlignLeft,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export type ReadingMode = "single" | "continuous" | "double";

/**
 * Interaction mode (selection granularity)
 * - sentence: Sentence/text block mode - select individual sentences or text blocks
 * - paragraph: Paragraph mode - hover over entire paragraphs for operations
 */
export type InteractionMode = "sentence" | "paragraph";

export interface PDFViewState {
  pageNumber: number;
  numPages: number;
  scale: number;
  readingMode: ReadingMode;
}

export interface PDFToolbarInlineProps {
  viewState: PDFViewState;
  onViewStateChange: (state: Partial<PDFViewState>) => void;
  // Search
  onSearch: (query: string) => void;
  searchResults?: Array<{
    pageNumber: number;
    textContent: string;
    position: { x: number; y: number; width: number; height: number };
  }>;
  currentResultIndex?: number;
  onNavigateResult?: (direction: "prev" | "next") => void;
  onClearSearch?: () => void;
  // Page navigation functions from usePageNavigation
  onPrevPage: () => void;
  onNextPage: () => void;
  canGoToPrev: boolean;
  canGoToNext: boolean;
  // Interaction mode (selection vs translate)
  interactionMode?: InteractionMode;
  onInteractionModeChange?: (mode: InteractionMode) => void;
  /** Whether OCR data is available (paragraph translation mode requires OCR data) */
  hasOCRData?: boolean;
  className?: string;
}

// ============================================================
// Helper Components
// ============================================================

const getModeIcon = (mode: ReadingMode) => {
  switch (mode) {
    case "single":
      return (
        <Image
          src="/assets/img/icon/singlePage.svg"
          alt="single"
          width={16}
          height={16}
          className="w-4 h-4"
        />
      );
    case "continuous":
      return (
        <Image
          src="/assets/img/icon/continuous.svg"
          alt="continuous"
          width={16}
          height={16}
          className="w-4 h-4"
        />
      );
    case "double":
      return (
        <Image
          src="/assets/img/icon/doublePage.svg"
          alt="double"
          width={16}
          height={16}
          className="w-4 h-4"
        />
      );
  }
};

const getModeLabel = (mode: ReadingMode) => {
  switch (mode) {
    case "single":
      return "Single Page";
    case "continuous":
      return "Continuous";
    case "double":
      return "Double Page";
  }
};

// ============================================================
// Component
// ============================================================

export const PDFToolbarInline: React.FC<PDFToolbarInlineProps> = ({
  viewState,
  onViewStateChange,
  onSearch,
  searchResults = [],
  currentResultIndex = 0,
  onNavigateResult,
  onClearSearch,
  onPrevPage,
  onNextPage,
  canGoToPrev,
  canGoToNext,
  interactionMode = "sentence",
  onInteractionModeChange,
  hasOCRData = false,
  className,
}) => {
  const { pageNumber, numPages, scale, readingMode } = viewState;
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  // Toggle interaction mode (sentence/paragraph)
  const handleInteractionModeToggle = useCallback(() => {
    if (!onInteractionModeChange) return;
    const newMode = interactionMode === "sentence" ? "paragraph" : "sentence";
    onInteractionModeChange(newMode);
  }, [interactionMode, onInteractionModeChange]);

  // Handlers
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    onSearch(query);
  }, [onSearch]);

  const handleSearchToggle = useCallback(() => {
    if (isSearchExpanded && !searchQuery) {
      setIsSearchExpanded(false);
    } else if (!isSearchExpanded) {
      setIsSearchExpanded(true);
    }
  }, [isSearchExpanded, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    onClearSearch?.();
    setIsSearchExpanded(false);
  }, [onClearSearch]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigateResult?.("prev");
      } else {
        onNavigateResult?.("next");
      }
    } else if (e.key === "Escape") {
      handleClearSearch();
    }
  }, [onNavigateResult, handleClearSearch]);

  const handleZoomIn = useCallback(() => {
    onViewStateChange({ scale: Math.min(3, scale + 0.1) });
  }, [scale, onViewStateChange]);

  const handleZoomOut = useCallback(() => {
    onViewStateChange({ scale: Math.max(0.5, scale - 0.1) });
  }, [scale, onViewStateChange]);

  const handleModeChange = useCallback((mode: ReadingMode) => {
    onViewStateChange({ readingMode: mode });
  }, [onViewStateChange]);

  // Styles
  const iconClass = "text-stone-600 hover:text-stone-800";
  const buttonClass = "h-8 w-8 hover:bg-stone-200/60";

  return (
    <TooltipProvider>
      <div
        className={cn(
          "flex items-center px-3 py-2 bg-white/90 backdrop-blur-sm border-b border-stone-200",
          className
        )}
      >
        {/* ============================================ */}
        {/* Left Section: Reading Mode */}
        {/* ============================================ */}
        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-1">
          {(["single", "continuous", "double"] as ReadingMode[]).map((mode) => (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <Button
                  variant={readingMode === mode ? "default" : "ghost"}
                  size="sm"
                  onClick={() => handleModeChange(mode)}
                  className={cn(
                    "h-7 px-2 gap-1 text-xs",
                    readingMode === mode
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 [&>img]:brightness-0 [&>img]:invert"
                      : "text-stone-600 hover:text-stone-800 hover:bg-stone-200/60"
                  )}
                >
                  {getModeIcon(mode)}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{getModeLabel(mode)}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* ============================================ */}
        {/* Center Section: Search (Centered) */}
        {/* ============================================ */}
        <div className="flex-1 flex justify-center px-4">
          <div
            className={cn(
              "flex items-center gap-2 bg-stone-100 rounded-lg px-3 py-1.5 transition-all duration-300",
              isSearchExpanded ? "w-80" : "w-56"
            )}
          >
            {!isSearchExpanded ? (
              <button
                onClick={handleSearchToggle}
                className="flex items-center gap-2 w-full text-left text-stone-500 hover:text-stone-700 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span className="text-sm">Search...</span>
                <kbd className="ml-auto text-[10px] bg-stone-200 px-1.5 py-0.5 rounded text-stone-500">
                  ⌘F
                </kbd>
              </button>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search in document..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-stone-800 placeholder-stone-400 min-w-0"
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-stone-600">
                    <span className="whitespace-nowrap">
                      {currentResultIndex + 1}/{searchResults.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigateResult?.("prev")}
                      className="h-5 w-5 p-0"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigateResult?.("next")}
                      className="h-5 w-5 p-0"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearSearch}
                    className="h-5 w-5 p-0 flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ============================================ */}
        {/* Interaction Mode Toggle (Sentence/Paragraph) */}
        {/* ============================================ */}
        {hasOCRData && (
          <div className="flex items-center mr-3">
            <div className="flex items-center bg-stone-100 rounded-lg p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={interactionMode === "sentence" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => onInteractionModeChange?.("sentence")}
                    className={cn(
                      "h-7 w-7",
                      interactionMode === "sentence"
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "text-stone-600 hover:text-stone-800 hover:bg-stone-200/60"
                    )}
                  >
                    <TextSelect className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[9999]">
                  <p className="font-medium">Sentence Mode</p>
                  <p className="text-xs text-stone-400">Select individual sentences</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={interactionMode === "paragraph" ? "default" : "ghost"}
                    size="icon"
                    onClick={() => onInteractionModeChange?.("paragraph")}
                    className={cn(
                      "h-7 w-7",
                      interactionMode === "paragraph"
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "text-stone-600 hover:text-stone-800 hover:bg-stone-200/60"
                    )}
                  >
                    <AlignLeft className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="z-[9999]">
                  <p className="font-medium">Paragraph Mode</p>
                  <p className="text-xs text-stone-400">Hover to interact with paragraphs</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* ============================================ */}
        {/* Right Section: Page Navigation + Zoom */}
        {/* ============================================ */}
        <div className="flex items-center gap-3">
          {/* Page Navigation */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onPrevPage}
                  disabled={!canGoToPrev}
                  className={cn(buttonClass, iconClass)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Previous page</p>
              </TooltipContent>
            </Tooltip>
            <span className="text-sm font-medium text-stone-700 min-w-[60px] text-center tabular-nums">
              {pageNumber} / {numPages}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onNextPage}
                  disabled={!canGoToNext}
                  className={cn(buttonClass, iconClass)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Next page</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="w-px h-5 bg-stone-300" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomOut}
                  disabled={scale <= 0.5}
                  className={cn(buttonClass, iconClass)}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Zoom out</p>
              </TooltipContent>
            </Tooltip>
            <span className="text-sm font-medium text-stone-700 min-w-[45px] text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleZoomIn}
                  disabled={scale >= 3}
                  className={cn(buttonClass, iconClass)}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Zoom in</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default PDFToolbarInline;
