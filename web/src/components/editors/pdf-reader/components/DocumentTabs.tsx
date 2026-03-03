/**
 * Document Tabs Component
 * 
 * Multi-document tab component.
 * Supports: switching, closing, and adding documents.
 */

"use client";

import React, { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, FileText, Library, FolderOpen } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============================================================
// Types
// ============================================================

export interface OpenDocument {
  /** Unique document ID */
  id: string;
  /** Document title */
  title: string;
  /** ArXiv ID (if available) */
  arxivId?: string;
  /** Whether there are unsaved changes */
  isDirty?: boolean;
}

export interface DocumentTabsProps {
  /** List of open documents */
  documents: OpenDocument[];
  /** Currently active document ID */
  activeDocumentId: string | null;
  /** Switch document */
  onSelectDocument: (id: string) => void;
  /** Close document */
  onCloseDocument: (id: string) => void;
  /** Add new document (backward compatible) */
  onAddDocument: () => void;
  /** Add document from Assets (optional, shows dropdown menu when provided) */
  onAddFromAssets?: () => void;
  /** Custom styles */
  className?: string;
}

// ============================================================
// Document Tab Component
// ============================================================

interface DocumentTabProps {
  document: OpenDocument;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
}

const DocumentTab: React.FC<DocumentTabProps> = ({
  document,
  isActive,
  onSelect,
  onClose,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  }, [onClose]);

  // Truncate title - increased display length
  const displayTitle = document.title.length > 30
    ? document.title.slice(0, 27) + '...'
    : document.title;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "group relative flex items-center gap-2.5 px-4 py-2 rounded-lg",
              "cursor-pointer transition-all duration-200 max-w-[280px] min-w-[140px]",
              "border",
              isActive
                ? "bg-white border-stone-200 shadow-md z-10"
                : "bg-stone-100/80 border-stone-200/50 hover:bg-stone-200/80 hover:border-stone-300/80"
            )}
            onClick={onSelect}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Document Icon */}
            <FileText className={cn(
              "w-4 h-4 flex-shrink-0",
              isActive ? "text-indigo-600" : "text-stone-400"
            )} />

            {/* Dirty Indicator */}
            {document.isDirty && (
              <span className="absolute top-2 left-2 w-2 h-2 rounded-full bg-amber-500" />
            )}

            {/* Title */}
            <span className={cn(
              "truncate text-sm font-medium",
              isActive ? "text-stone-800" : "text-stone-600"
            )}>
              {displayTitle}
            </span>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className={cn(
                "flex-shrink-0 w-5 h-5 rounded flex items-center justify-center",
                "transition-all duration-150",
                (isActive || isHovered)
                  ? "opacity-100 hover:bg-stone-300/60"
                  : "opacity-0"
              )}
            >
              <X className="w-3.5 h-3.5 text-stone-500" />
            </button>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-0.5">
            <p className="font-medium text-sm">{document.title}</p>
            {document.arxivId && (
              <p className="text-xs text-stone-400">arXiv: {document.arxivId}</p>
            )}
            {document.isDirty && (
              <p className="text-xs text-amber-600">Unsaved changes</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// ============================================================
// Main Component
// ============================================================

export const DocumentTabs: React.FC<DocumentTabsProps> = ({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
  onAddDocument,
  onAddFromAssets,
  className,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  const handleBlur = useCallback(() => {
    // Delay to allow click events on menu items
    setTimeout(() => setIsMenuOpen(false), 150);
  }, []);

  return (
    <div className={cn(
      "flex items-center gap-2 h-11 overflow-x-auto scrollbar-none",
      className
    )}>
      <AnimatePresence mode="popLayout">
        {documents.map((doc) => (
          <DocumentTab
            key={doc.id}
            document={doc}
            isActive={doc.id === activeDocumentId}
            onSelect={() => onSelectDocument(doc.id)}
            onClose={() => onCloseDocument(doc.id)}
          />
        ))}
      </AnimatePresence>

      {/* Add Document Button */}
      <div className="relative" ref={menuRef} onBlur={handleBlur}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (onAddFromAssets) {
                    setIsMenuOpen(!isMenuOpen);
                  } else {
                    onAddDocument();
                  }
                }}
                className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg",
                  "bg-indigo-100 hover:bg-indigo-200 transition-colors",
                  "text-indigo-600 hover:text-indigo-700",
                  "border-2 border-dashed border-indigo-300 hover:border-indigo-400"
                )}
              >
                <Plus className="w-5 h-5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Add Document</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Dropdown menu */}
        {isMenuOpen && onAddFromAssets && (
          <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
            <button
              onClick={() => { setIsMenuOpen(false); onAddDocument(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Library className="w-4 h-4 text-indigo-500" />
              From Paper Library
            </button>
            <button
              onClick={() => { setIsMenuOpen(false); onAddFromAssets(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FolderOpen className="w-4 h-4 text-amber-500" />
              From Assets
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Add Document Dialog (Placeholder)
// ============================================================

export interface AddDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPaper: (paperId: string) => void;
}

/**
 * Add Document Dialog
 * 
 * TODO: Implement full functionality in Phase 2
 * - Select papers from Library
 * - Enter arXiv ID
 * - Upload local files
 */
export const AddDocumentDialog: React.FC<AddDocumentDialogProps> = ({
  isOpen,
  onClose,
  onSelectPaper,
}) => {
  if (!isOpen) return null;

  // Simple dialog placeholder
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Add Document</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-stone-100"
          >
            <X className="w-5 h-5 text-stone-500" />
          </button>
        </div>

        <div className="space-y-4">
          {/* From Library Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-stone-600">From Library</h3>
            <p className="text-xs text-stone-400">
              Select from processed papers in your library.
            </p>
            <div className="p-4 bg-stone-50 rounded-lg text-center text-sm text-stone-500">
              Loading papers from library...
            </div>
          </div>

          {/* From URL Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-stone-600">From arXiv ID</h3>
            <input
              type="text"
              placeholder="e.g., 2601.02346"
              className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-stone-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // TODO: Implement add logic
              onClose();
            }}
            className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            Add
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default DocumentTabs;
