"use client";

/**
 * PDF Reader Wrapper
 * 
 * Multi-document management wrapper component.
 * - Manages multiple open documents
 * - Handles document switching
 * - Paper library dialog
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PDFSource, createPDFSource } from "@/types/paperContext";
import { useMultiDocumentStore, selectDocumentList } from "./store/multiDocumentStore";
import { PaperLibraryDialog, PaperMeta } from "./components/PaperLibraryDialog";
import { PDFReaderTopBar } from "./components/PDFReaderTopBar";
import PDFReaderContent from "./PDFReaderContent";
import { OpenDocument } from "./components/DocumentTabs";
import { AssetBrowser, type AssetItem } from "@/components/shared/AssetBrowser";
import { FileText } from "lucide-react";
import { StorageProvider } from "@/lib/storage/provider";
import { useWorkspaceId } from "@/app/workspace/components/WorkspaceContext";

// ============================================================================
// Types
// ============================================================================

interface PDFReaderWrapperProps {
  /** Initial PDF source (optional) */
  initialSource?: PDFSource;
  /** Callback to close the reader */
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const PDFReaderWrapper: React.FC<PDFReaderWrapperProps> = ({
  initialSource,
  onClose,
}) => {
  const contextWorkspaceId = useWorkspaceId();
  const workspaceId = contextWorkspaceId && contextWorkspaceId !== 'default' ? contextWorkspaceId : null;
  // Multi-document store
  const {
    documents,
    activeDocumentId,
    tabOrder,
    openDocument,
    closeDocument,
    setActiveDocument,
    updateViewState,
    setDocumentNumPages,
    setDocumentContext,
    setDocumentLoadingState,
  } = useMultiDocumentStore();

  // Dialog states
  const [isPaperLibraryOpen, setIsPaperLibraryOpen] = useState(false);
  const [isAssetBrowserOpen, setIsAssetBrowserOpen] = useState(false);

  // Side panel states - left panel collapsed by default for cleaner initial view
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Get reset function
  const { reset } = useMultiDocumentStore();

  // Track the initial source key to detect changes
  const initialSourceKey = initialSource?.arxivId || initialSource?.path || '';
  
  // Initialize: when the component mounts or initialSource changes, reset the store and open a new document
  useEffect(() => {
    if (initialSource && initialSourceKey) {
      console.log('[PDFReaderWrapper] Initializing with source:', initialSourceKey);
      // Reset store to ensure a clean state each time
      reset();
      // Open the new document
      openDocument(initialSource);
    }

    // Reset store on component unmount
    return () => {
      console.log('[PDFReaderWrapper] Unmounting, resetting store');
      reset();
    };
  }, [initialSourceKey]); // Only depend on sourceKey to avoid infinite loops

  // Get the current active document
  const activeDocument = useMemo(() => {
    if (!activeDocumentId) return null;
    return documents.get(activeDocumentId) || null;
  }, [documents, activeDocumentId]);

  // Convert to OpenDocument format for DocumentTabs
  const openDocuments: OpenDocument[] = useMemo(() => {
    return tabOrder.map((id) => {
      const doc = documents.get(id);
      if (!doc) return null;
      const title = doc.paperContext?.metadata?.title || doc.source.arxivId || "Untitled";
      return {
        id: doc.id,
        title: title.length > 25 ? title.slice(0, 25) + "..." : title,
        arxivId: doc.source.arxivId,
        isDirty: doc.isDirty,
      };
    }).filter(Boolean) as OpenDocument[];
  }, [tabOrder, documents]);

  // Handle paper selection (from the paper library)
  const handleSelectPaper = useCallback((paper: PaperMeta) => {
    // Use API route to fetch the PDF (more reliable)
    const pdfPath = paper.pdfPath || `/api/ocr/${paper.arxivId}/pdf`;
    
    const source: PDFSource = {
      type: "url",
      path: pdfPath,
      arxivId: paper.arxivId,
    };
    
    console.log("[PDFReaderWrapper] Opening document:", source);
    openDocument(source);
  }, [openDocument]);

  // Handle closing a document
  const handleCloseDocument = useCallback((id: string) => {
    const doc = documents.get(id);

    // If the document has unsaved changes, a confirmation dialog can be added here
    if (doc?.isDirty) {
      // TODO: Add a confirmation dialog
      console.log("Document has unsaved changes");
    }
    
    closeDocument(id);
    
    // If all documents are closed, close the entire reader
    if (documents.size <= 1) {
      onClose();
    }
  }, [documents, closeDocument, onClose]);

  // Handle switching documents
  const handleSelectDocument = useCallback((id: string) => {
    setActiveDocument(id);
  }, [setActiveDocument]);

  // Handle adding a document (from the paper library)
  const handleAddDocument = useCallback(() => {
    setIsPaperLibraryOpen(true);
  }, []);

  // Handle adding a document from Assets
  const handleAddFromAssets = useCallback(() => {
    setIsAssetBrowserOpen(true);
  }, []);

  // Handle selecting an Asset
  const handleSelectAsset = useCallback((asset: AssetItem) => {
    // Parse metadata to get sourceId for the PDF source
    const metadata = (asset as unknown as { metadata?: Record<string, unknown> }).metadata;
    const sourceId = metadata?.sourceId as string | undefined;

    let source: PDFSource;
    if (sourceId) {
      // Upload asset with sourceId — use OCR API path
      source = createPDFSource.fromUrl(`/api/ocr/${sourceId}/pdf`, sourceId);
    } else {
      // Fallback: use asset ID as source
      source = createPDFSource.fromUrl(`/api/v2/assets/${asset.id}/file`);
    }

    console.log("[PDFReaderWrapper] Opening asset:", asset.title, source);
    openDocument(source);
  }, [openDocument]);

  // If no document is open, show the empty state
  if (!activeDocument) {
    return (
      <div className="h-full w-full bg-stone-200/50 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <FileText className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-stone-600 mb-2">No Document Open</h2>
          <p className="text-stone-500 mb-4">Open a paper from the library to start reading</p>
          <button
            onClick={() => setIsPaperLibraryOpen(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Open Paper Library
          </button>
        </div>
        
        <PaperLibraryDialog
          isOpen={isPaperLibraryOpen}
          onClose={() => setIsPaperLibraryOpen(false)}
          onSelectPaper={handleSelectPaper}
          workspaceId={workspaceId}
          openPaperIds={tabOrder}
        />
      </div>
    );
  }

  return (
    <div className="pdf-reader-wrapper h-full w-full bg-stone-200/50 flex flex-col overflow-hidden p-2 gap-2">
      {/* Top bar */}
      <PDFReaderTopBar
        documents={openDocuments}
        activeDocumentId={activeDocumentId}
        currentArxivId={activeDocument?.source.arxivId}
        currentTitle={activeDocument?.paperContext?.metadata?.title}
        onSelectDocument={handleSelectDocument}
        onCloseDocument={handleCloseDocument}
        onAddDocument={handleAddDocument}
        onAddFromAssets={handleAddFromAssets}
        onMinimize={onClose}
        isLeftPanelOpen={isLeftPanelOpen}
        onToggleLeftPanel={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
        isRightPanelOpen={isRightPanelOpen}
        onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
      />

      {/* Document content area */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeDocumentId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            <PDFReaderContent
              documentId={activeDocument.id}
              pdfSource={activeDocument.source}
              isLeftPanelOpen={isLeftPanelOpen}
              isRightPanelOpen={isRightPanelOpen}
              onToggleLeftPanel={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
              onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Paper library dialog */}
      <PaperLibraryDialog
        isOpen={isPaperLibraryOpen}
        onClose={() => setIsPaperLibraryOpen(false)}
        onSelectPaper={handleSelectPaper}
        workspaceId={workspaceId}
        openPaperIds={tabOrder}
      />

      {/* Asset browser dialog */}
      <AssetBrowser
        isOpen={isAssetBrowserOpen}
        onClose={() => setIsAssetBrowserOpen(false)}
        onSelect={handleSelectAsset}
        filterType="paper"
        title="Open from Assets"
      />
    </div>
  );
};

/**
 * PDFReaderWrapper with StorageProvider
 * 
 * Wrapper component that ensures StorageProvider is available for persistence hooks.
 */
const PDFReaderWrapperWithStorage: React.FC<PDFReaderWrapperProps> = (props) => {
  return (
    <StorageProvider>
      <PDFReaderWrapper {...props} />
    </StorageProvider>
  );
};

export default PDFReaderWrapperWithStorage;
