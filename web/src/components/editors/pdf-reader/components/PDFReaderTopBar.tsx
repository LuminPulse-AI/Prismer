"use client";

import React, { useCallback } from "react";
import {
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Library,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DocumentTabs, OpenDocument } from "./DocumentTabs";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

interface PDFReaderTopBarProps {
  /** List of open documents */
  documents: OpenDocument[];
  /** Currently active document ID */
  activeDocumentId: string | null;
  /** ArXiv ID of the active document (for Save to Assets) */
  currentArxivId?: string;
  /** Title of the active document */
  currentTitle?: string;
  /** Callback to switch documents */
  onSelectDocument: (id: string) => void;
  /** Callback to close a document */
  onCloseDocument: (id: string) => void;
  /** Callback to add a new document */
  onAddDocument: () => void;
  /** Callback to add a document from Assets */
  onAddFromAssets?: () => void;
  /** Callback to minimize the reader (return to Library home) */
  onMinimize: () => void;
  /** Left sidebar state */
  isLeftPanelOpen: boolean;
  /** Toggle left sidebar */
  onToggleLeftPanel: () => void;
  /** Right sidebar state */
  isRightPanelOpen: boolean;
  /** Toggle right sidebar */
  onToggleRightPanel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const PDFReaderTopBar: React.FC<PDFReaderTopBarProps> = ({
  documents,
  activeDocumentId,
  currentArxivId,
  onSelectDocument,
  onCloseDocument,
  onAddDocument,
  onAddFromAssets,
  onMinimize,
  isLeftPanelOpen,
  onToggleLeftPanel,
  isRightPanelOpen,
  onToggleRightPanel,
}) => {
  const handleSaveToAssets = useCallback(() => {
    if (!currentArxivId) {
      toast.error("Cannot save: no document ID available");
      return;
    }
    toast.info("Assets module is not included in workspace-only open-source mode.");
  }, [currentArxivId]);

  return (
    <TooltipProvider>
      <div className="pdf-reader-topbar flex items-center justify-between px-3 py-2 
                      bg-white rounded-xl shadow-sm border border-stone-200/80">
        {/* Left: minimize button + left sidebar toggle */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onMinimize}
                className="p-2 rounded-lg hover:bg-amber-100 transition-colors text-stone-600 hover:text-amber-700"
              >
                <Minus className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Minimize to sidebar (Esc)</p>
            </TooltipContent>
          </Tooltip>
          
          <div className="w-px h-6 bg-stone-200" />
          
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleLeftPanel}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  isLeftPanelOpen
                    ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                    : "hover:bg-stone-100 text-stone-600 hover:text-stone-800"
                )}
              >
                {isLeftPanelOpen ? (
                  <PanelLeftClose className="w-5 h-5" />
                ) : (
                  <PanelLeftOpen className="w-5 h-5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isLeftPanelOpen ? "Hide left panel" : "Show left panel"}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Center: document tabs */}
        <div className="flex-1 mx-4 overflow-hidden">
          <DocumentTabs
            documents={documents}
            activeDocumentId={activeDocumentId}
            onSelectDocument={onSelectDocument}
            onCloseDocument={onCloseDocument}
            onAddDocument={onAddDocument}
            onAddFromAssets={onAddFromAssets}
          />
        </div>

        {/* Right: Save to Assets + right sidebar toggle */}
        <div className="flex items-center gap-2">
          {/* Save to Assets Button */}
          {currentArxivId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSaveToAssets}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    "hover:bg-blue-100 text-stone-600 hover:text-blue-600",
                    "disabled:cursor-not-allowed"
                  )}
                >
                  <Library className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Save to Assets (disabled in open-source mode)</p>
              </TooltipContent>
            </Tooltip>
          )}

          <div className="w-px h-6 bg-stone-200" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleRightPanel}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  isRightPanelOpen
                    ? "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
                    : "hover:bg-stone-100 text-stone-600 hover:text-stone-800"
                )}
              >
                {isRightPanelOpen ? (
                  <PanelRightClose className="w-5 h-5" />
                ) : (
                  <PanelRightOpen className="w-5 h-5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isRightPanelOpen ? "Hide panel" : "Show panel"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default PDFReaderTopBar;
