import React, { useState } from "react";
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
  Sidebar,
  X,
  PanelRight,
  Search,
} from "lucide-react";

export type ReadingMode = "single" | "continuous" | "double";

interface PDFToolbarProps {
  pageNumber: number;
  numPages: number;
  scale: number;
  // New mode-aware page turn functions
  onPrevPage: () => void;
  onNextPage: () => void;
  canGoToPrev: boolean;
  canGoToNext: boolean;
  onZoomChange: (scale: number) => void;
  onToggleIndexPanel: () => void;
  onToggleRightPanel: () => void;
  onClose?: () => void;
  isIndexPanelOpen: boolean;
  isRightPanelOpen: boolean;
  // Search related props
  onSearch: (query: string) => void;
  searchResults: Array<{
    pageNumber: number;
    textContent: string;
    position: { x: number; y: number; width: number; height: number };
  }>;
  currentResultIndex: number;
  onNavigateResult: (direction: "prev" | "next") => void;
  onClearSearch: () => void;
  // Reading mode related props
  readingMode: ReadingMode;
  onReadingModeChange: (mode: ReadingMode) => void;
  // Sentence interaction layer related props
  isSentenceLayerEnabled?: boolean;
  onToggleSentenceLayer?: () => void;
}

export const PDFToolbar: React.FC<PDFToolbarProps> = ({
  pageNumber,
  numPages,
  scale,
  onPrevPage,
  onNextPage,
  canGoToPrev,
  canGoToNext,
  onZoomChange,
  onToggleIndexPanel,
  onToggleRightPanel,
  onClose,
  isIndexPanelOpen,
  isRightPanelOpen,
  // Search related props
  onSearch,
  searchResults,
  currentResultIndex,
  onNavigateResult,
  onClearSearch,
  // Reading mode related props
  readingMode,
  onReadingModeChange,
  // Sentence interaction layer related props
  isSentenceLayerEnabled = false,
  onToggleSentenceLayer,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

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

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    onSearch(query);
  };

  const handleSearchToggle = () => {
    if (isSearchExpanded && !searchQuery) {
      setIsSearchExpanded(false);
    } else if (!isSearchExpanded) {
      setIsSearchExpanded(true);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onClearSearch();
    setIsSearchExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        onNavigateResult("prev");
      } else {
        onNavigateResult("next");
      }
    } else if (e.key === "Escape") {
      handleClearSearch();
    }
  };

  // Toolbar icon colors - high contrast
  const iconColor = "text-slate-700";
  const iconColorHover = "hover:text-slate-900";
  const iconColorActive = "text-indigo-600";

  return (
    <TooltipProvider>
      <div className="w-full z-40 bg-transparent">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left Section */}
          <div className="flex items-center gap-2 flex-1">
            {/* Close button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className={cn(iconColor, iconColorHover, "hover:bg-slate-200/60")}
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Close</p>
              </TooltipContent>
            </Tooltip>

            <div className="h-6 w-px bg-slate-300" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isIndexPanelOpen ? "default" : "ghost"}
                  size="icon"
                  onClick={onToggleIndexPanel}
                  className={cn(
                    iconColor, iconColorHover, "hover:bg-slate-200/60",
                    isIndexPanelOpen &&
                      "bg-indigo-100 text-indigo-600 border border-indigo-400 hover:bg-indigo-100"
                  )}
                >
                  <Sidebar className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Table of Contents</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Center Section - search and core controls centered layout */}
          <div className="flex items-center gap-4">
            {/* Page navigation controls - using mode-aware page turn functions */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onPrevPage}
                    disabled={!canGoToPrev}
                    className={cn(iconColor, iconColorHover, "hover:bg-slate-200/60")}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Previous page</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-['Source Serif'] text-slate-700 min-w-[4rem] text-center text-sm font-medium">
                {pageNumber} / {numPages}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onNextPage}
                    disabled={!canGoToNext}
                    className={cn(iconColor, iconColorHover, "hover:bg-slate-200/60")}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Next page</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onZoomChange(scale - 0.1)}
                    disabled={scale <= 0.5}
                    className={cn(iconColor, iconColorHover, "hover:bg-slate-200/60")}
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Zoom out</p>
                </TooltipContent>
              </Tooltip>
              <span className="font-['Source Serif'] text-slate-700 min-w-[3rem] text-center text-sm font-medium">
                {Math.round(scale * 100)}%
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onZoomChange(scale + 0.1)}
                    disabled={scale >= 2.0}
                    className={cn(iconColor, iconColorHover, "hover:bg-slate-200/60")}
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Zoom in</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Center search area */}
            <div
              className={cn(
                "flex items-center gap-2 bg-slate-200/50 rounded-lg px-3 py-2 transition-all duration-300",
                isSearchExpanded ? "min-w-[400px]" : "min-w-[300px]"
              )}
            >
              {!isSearchExpanded ? (
                <button
                  onClick={handleSearchToggle}
                  className="flex items-center gap-2 w-full text-left text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  <span className="text-sm">Search PDF Content...</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <Search className="w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search PDF Content..."
                    className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-400"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-slate-600 animate-in fade-in duration-200">
                      <span>
                        {currentResultIndex + 1}/{searchResults.length}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onNavigateResult("prev")}
                            className="h-6 w-6 p-0 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60"
                          >
                            <ChevronLeft className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Previous search result</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onNavigateResult("next")}
                            className="h-6 w-6 p-0 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60"
                          >
                            <ChevronRight className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>Next search result</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                  {searchQuery && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearSearch}
                          className="h-6 w-6 p-0 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>Clear search</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>

            {/* Reading mode toggle */}
            <div className="flex items-center gap-1 bg-slate-200/50 rounded-lg p-1">
              {(["single", "continuous", "double"] as ReadingMode[]).map(
                (mode) => (
                  <Tooltip key={mode}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={readingMode === mode ? "default" : "ghost"}
                        size="sm"
                        onClick={() => onReadingModeChange(mode)}
                        className={cn(
                          "h-7 px-2 gap-1 text-xs",
                          readingMode === mode
                            ? "bg-indigo-600 text-white hover:bg-indigo-700 [&>img]:brightness-0 [&>img]:invert [&:hover>img]:brightness-0 [&:hover>img]:invert"
                            : "text-slate-700 hover:text-slate-900 hover:bg-slate-300/60"
                        )}
                      >
                        {getModeIcon(mode)}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p>{getModeLabel(mode)}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              )}
            </div>

            {/* Sentence interaction layer toggle */}
            {onToggleSentenceLayer && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isSentenceLayerEnabled ? "default" : "ghost"}
                    size="icon"
                    onClick={onToggleSentenceLayer}
                    className={cn(
                      iconColor, iconColorHover, "hover:bg-slate-200/60",
                      isSentenceLayerEnabled &&
                        "bg-indigo-100 text-indigo-600 border border-indigo-400 hover:bg-indigo-100"
                    )}
                  >
                    <Image
                      src={
                        isSentenceLayerEnabled
                          ? "/assets/img/icon/sentenceActive.svg"
                          : "/assets/img/icon/sentence.svg"
                      }
                      alt="sentence"
                      width={16}
                      height={16}
                      className="w-4 h-4"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Sentence interaction</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isRightPanelOpen ? "default" : "ghost"}
                  size="icon"
                  onClick={onToggleRightPanel}
                  className={cn(
                    iconColor, iconColorHover, "hover:bg-slate-200/60",
                    isRightPanelOpen &&
                      "bg-indigo-100 text-indigo-600 border border-indigo-400 hover:bg-indigo-100"
                  )}
                >
                  <PanelRight className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Right panel</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};
