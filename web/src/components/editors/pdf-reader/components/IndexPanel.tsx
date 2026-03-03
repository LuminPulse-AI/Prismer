"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { pdfjs } from "react-pdf";
import {
  ChevronLeft,
  LayoutList,
  Image,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Info,
  Lightbulb,
  BookMarked,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MetaPanel } from "./MetaPanel";
import { ThumbnailGrid } from "./ThumbnailGrid";
import { InsightPanelLeft } from "./left/InsightPanelLeft";
import { RefsPanel } from "./left/RefsPanel";
import type { PaperInsight, PaperContext } from "@/types/paperContext";
import { useAIStore } from "../store/aiStore";

interface OutlineItem {
  title: string;
  dest: string | any[] | null;
  items?: OutlineItem[];
  expanded?: boolean;
  pageNumber?: number;
}

// Width range - default 15% ratio (approx. 250px on a 1680px screen)
const DEFAULT_WIDTH = 250;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

type LeftPanelView = "thumbnails" | "outline" | "meta" | "insights" | "refs";

interface IndexPanelProps {
  file: string;
  currentPage: number;
  numPages: number;
  onPageChange: (pageNumber: number) => void;
  isOpen: boolean;
  onClose: () => void;
  /** Callback for adding an Insight to Notes */
  onAddInsightToNotes?: (insight: PaperInsight) => void;
  /** Paper context (for the references panel) */
  paperContext?: PaperContext | null;
  /** Callback to open a referenced paper in the reader */
  onOpenReferenceInReader?: (arxivId: string) => void;
  /** Width change callback */
  onWidthChange?: (width: number) => void;
}

export const IndexPanel: React.FC<IndexPanelProps> = ({
  file,
  currentPage,
  numPages,
  onPageChange,
  isOpen,
  onClose,
  onAddInsightToNotes,
  paperContext,
  onOpenReferenceInReader,
  onWidthChange,
}) => {
  const [view, setView] = useState<LeftPanelView>("insights");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { addExtract, setRightPanelTab } = useAIStore();

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = width;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + deltaX));
      setWidth(newWidth);
      onWidthChange?.(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange]);

  // Handle adding an Insight to Notes
  const handleAddInsightToNotes = useCallback((insight: PaperInsight) => {
    if (onAddInsightToNotes) {
      onAddInsightToNotes(insight);
    } else {
      // Remove [[detection_id]] tags, keep pure Markdown
      const cleanContent = insight.content.replace(/\[\[p\d+_\w+_\d+\]\]/g, '');
      
      // Default behavior: add to extracts and switch to Notes tab
      addExtract({
        type: 'ai_insight',
        content: `## ${insight.type.replace('_', ' ').toUpperCase()}\n\n${cleanContent}`,
        source: insight.citations?.[0] || { pageNumber: 1, excerpt: '' },
        tags: [],
      });
      setRightPanelTab('notes');
    }
  }, [onAddInsightToNotes, addExtract, setRightPanelTab]);

  useEffect(() => {
    const loadOutline = async () => {
      try {
        const pdf = await pdfjs.getDocument(file).promise;
        const outline = await pdf.getOutline();
        if (outline) {
          // Helper function to resolve destination to page number
          const resolveDestToPage = async (dest: string | any[] | null): Promise<number | undefined> => {
            if (!dest) return undefined;
            try {
              // If dest is a string (named destination), resolve it
              const resolvedDest = typeof dest === 'string' 
                ? await pdf.getDestination(dest) 
                : dest;
              if (resolvedDest && Array.isArray(resolvedDest) && resolvedDest.length > 0) {
                return (await pdf.getPageIndex(resolvedDest[0])) + 1;
              }
            } catch (e) {
              console.warn('Failed to resolve outline destination:', e);
            }
            return undefined;
          };

          // Process each outline item to get page numbers
          const processedOutline = await Promise.all(
            outline.map(async (item: OutlineItem) => {
              const pageNumber = await resolveDestToPage(item.dest);
              return {
                ...item,
                pageNumber,
                expanded: true,
                items: item.items
                  ? await Promise.all(
                      item.items.map(async (subItem: OutlineItem) => {
                        const subPageNumber = await resolveDestToPage(subItem.dest);
                        return { ...subItem, pageNumber: subPageNumber };
                      })
                    )
                  : undefined,
              };
            })
          );
          setOutline(processedOutline);

          // Expand all top-level items by default
          const expanded = new Set<string>();
          processedOutline.forEach((item) => expanded.add(item.title));
          setExpandedItems(expanded);
        }
      } catch (error) {
        console.error("Failed to load outline:", error);
      }
    };

    if (file) {
      loadOutline();
    }
  }, [file]);

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const renderOutlineItem = (item: OutlineItem, level: number = 0) => {
    const isExpanded = expandedItems.has(item.title);
    const hasSubItems = item.items && item.items.length > 0;

    return (
      <div key={`${item.title}-${level}`} className="outline-item">
        <div
          className={cn(
            "w-full text-left px-3 py-2 hover:bg-[var(--bg-box-nor)] rounded text-sm flex items-center gap-2 cursor-pointer",
            "transition-colors duration-200 text-[var(--text-1)]",
            currentPage === item.pageNumber &&
              "bg-[var(--main-color)]/10 text-[var(--main-color)]"
          )}
          style={{ paddingLeft: `${level * 16 + 12}px` }}
          onClick={async () => {
            if (item.pageNumber) {
              onPageChange(item.pageNumber);
            }
          }}
        >
          {hasSubItems && (
            <button
              type="button"
              className="p-1 hover:bg-[var(--bg-box-act)] rounded text-[var(--text-3)]"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(item.title);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRightIcon className="w-3 h-3" />
              )}
            </button>
          )}
          <span className="truncate flex-1">{item.title}</span>
          {item.pageNumber && (
            <span className="text-xs text-[var(--text-3)]">
              {item.pageNumber}
            </span>
          )}
        </div>

        {hasSubItems && isExpanded && (
          <div className="ml-2">
            {item.items!.map((subItem) =>
              renderOutlineItem(subItem, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            opacity: { duration: 0.2 },
          }}
          className={cn(
            "flex-shrink-0 h-full bg-white rounded-xl shadow-sm z-40 border border-stone-200/80 overflow-hidden relative",
            isResizing && "select-none"
          )}
          style={{ width }}
        >
          {/* Panel header */}
          <TooltipProvider>
            <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50 rounded-t-xl">
              <div className="flex bg-stone-100 rounded-lg p-1 gap-0.5">
                {/* Insights - First and default */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200",
                        view === "insights"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-stone-600 hover:bg-stone-200 hover:text-stone-800"
                      )}
                      onClick={() => setView("insights")}
                    >
                      <Lightbulb className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Quick Insights</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200",
                        view === "thumbnails"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-stone-600 hover:bg-stone-200 hover:text-stone-800"
                      )}
                      onClick={() => setView("thumbnails")}
                    >
                      <Image className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Thumbnails</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200",
                        view === "outline"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-stone-600 hover:bg-stone-200 hover:text-stone-800"
                      )}
                      onClick={() => setView("outline")}
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Outline</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200",
                        view === "meta"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-stone-600 hover:bg-stone-200 hover:text-stone-800"
                      )}
                      onClick={() => setView("meta")}
                    >
                      <Info className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>Metadata</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200",
                        view === "refs"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-stone-600 hover:bg-stone-200 hover:text-stone-800"
                      )}
                      onClick={() => setView("refs")}
                    >
                      <BookMarked className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>References</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-stone-200 rounded-full transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-stone-500" />
              </button>
            </div>
          </TooltipProvider>

          {/* Panel content */}
          <div className="h-[calc(100%-60px)] overflow-y-auto">
            {view === "thumbnails" && (
              <div className="p-4 space-y-4 max-w-full overflow-hidden">
                <ThumbnailGrid
                  file={file}
                  numPages={numPages}
                  currentPage={currentPage}
                  onPageChange={onPageChange}
                />
              </div>
            )}

            {view === "outline" && (
              <div className="p-4">
                {outline.length > 0 ? (
                  <div className="space-y-1">
                    {outline.map((item) => renderOutlineItem(item))}
                  </div>
                ) : (
                  <p className="text-center text-[var(--text-3)] mt-4">
                    No outline available
                  </p>
                )}
              </div>
            )}

            {view === "meta" && <MetaPanel file={file} numPages={numPages} />}

            {view === "insights" && (
              <InsightPanelLeft
                // onAddToNotes disabled - Notes feature is currently disabled
                // onAddToNotes={handleAddInsightToNotes}
                onNavigateToPage={onPageChange}
              />
            )}

            {view === "refs" && (
              <RefsPanel
                paperContext={paperContext || null}
                onOpenInReader={onOpenReferenceInReader}
              />
            )}
          </div>

          {/* Resize Handle - unified light gray semi-transparent style */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 flex items-center justify-center group"
            onMouseDown={handleMouseDown}
          >
            {/* Background hover effect */}
            <div className={cn(
              "absolute inset-0 bg-transparent transition-colors",
              "group-hover:bg-stone-300/40 group-active:bg-indigo-300/50",
              isResizing && "bg-indigo-300/50"
            )} />
            {/* Drag indicator bar */}
            <div className={cn(
              "relative w-1 h-16 rounded-full transition-colors",
              "bg-stone-300/60 group-hover:bg-stone-400 group-active:bg-indigo-500",
              isResizing && "bg-indigo-500"
            )} />
          </div>

          {/* Resize cursor overlay */}
          {isResizing && (
            <div className="fixed inset-0 cursor-col-resize z-50" />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
