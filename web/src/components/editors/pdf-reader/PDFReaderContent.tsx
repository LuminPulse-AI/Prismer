"use client";

/**
 * PDF Reader Content
 * 
 * Main content area of the PDF reader.
 * Contains: left sidebar, PDF renderer (with inline toolbar), and right sidebar.
 *
 * This component does not include the top bar, which is managed by PDFReaderWrapper.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
import { pdfjs } from "react-pdf";
import { IndexPanel } from "./components/IndexPanel";
import { SelectionPopup } from "./components/SelectionPopup";
import { AIRightPanel } from "./components/ai";
import { ReadingMode } from "./components/PDFToolbar";
import { PDFToolbarInline, PDFViewState, InteractionMode } from "./components/PDFToolbarInline";
import { PDFRenderer } from "./components/PDFRenderer";
import { ShortcutsFloatingButton } from "./components/ShortcutsFloatingButton";
import { useLayoutCalculation } from "./hooks/useLayoutCalculation";
import { useEventHandlers } from "./hooks/useEventHandlers";
import { usePDFSearch } from "./hooks/usePDFSearch";
import { useAIPaperReader } from "./hooks/useAIPaperReader";
import { usePageNavigation } from "./hooks/usePageNavigation";
import { useStoragePersistence, useLoadPaperInsights } from "./hooks/useStoragePersistence";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./styles/pdf-reader.css";
import { PDFSource } from "@/types/paperContext";
import { useMultiDocumentStore } from "./store/multiDocumentStore";
import { useAIStore } from "./store/aiStore";

import { createEditorEventEmitter } from "@/lib/events";

const emitEvent = createEditorEventEmitter('pdf-reader');

// ============================================================================
// Feature Flags
// ============================================================================

const ENABLE_SENTENCE_LAYER = false;
const ENABLE_OBJECT_SELECTION = true;

// ============================================================================
// PDF.js Configuration
// ============================================================================

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

// PDF Document options - defined outside component to ensure reference stability
// This prevents react-pdf's Document from warning about options prop changes
// Using local paths to avoid external CDN dependencies and "Failed to fetch" errors
const PDF_OPTIONS = {
  // CMap files - use local copy or fallback to CDN
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  // Standard fonts - use local copy or fallback to CDN
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

// ============================================================================
// Types
// ============================================================================

interface PDFReaderContentProps {
  documentId: string;
  pdfSource: PDFSource;
  isLeftPanelOpen: boolean;
  isRightPanelOpen: boolean;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const PDFReaderContent: React.FC<PDFReaderContentProps> = ({
  documentId,
  pdfSource,
  isLeftPanelOpen,
  isRightPanelOpen,
  onToggleLeftPanel,
  onToggleRightPanel,
}) => {
  // Multi-document store
  const { updateViewState, setDocumentNumPages } = useMultiDocumentStore();

  // Storage persistence - syncs chat sessions, notebooks, and insights to IndexedDB
  useStoragePersistence();

  // Emit 'ready' event when component mounts (for demo flow)
  useEffect(() => {
    emitEvent({ type: 'ready' });
  }, []);

  // Get AI store actions for demo integration
  const { setPendingQuestion, setRightPanelTab } = useAIStore();

  // Listen for demo:sendChat events to auto-send questions
  useEffect(() => {
    const handleDemoSendChat = (event: CustomEvent) => {
      const { component, message } = event.detail || {};
      if (component === 'pdf-reader' && message) {
        console.log('[PDFReader] Received demo:sendChat, setting pending question:', message);
        // Set the pending question - AskPaperChat will auto-send when ready
        setPendingQuestion(message);
        // Switch to chat tab
        setRightPanelTab('chat');
      }
    };

    window.addEventListener('demo:sendChat', handleDemoSendChat as EventListener);
    return () => {
      window.removeEventListener('demo:sendChat', handleDemoSendChat as EventListener);
    };
  }, [setPendingQuestion, setRightPanelTab]);

  // Local state
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [originalPageSize, setOriginalPageSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });
  const [readingMode, setReadingMode] = useState<ReadingMode>("single");
  const [leftPanelWidth, setLeftPanelWidth] = useState(250); // 15% ratio
  const [rightPanelWidth, setRightPanelWidth] = useState(500); // 35% ratio
  const [isSentenceLayerEnabled, setIsSentenceLayerEnabled] = useState(ENABLE_SENTENCE_LAYER);
  const [selectedSentences, setSelectedSentences] = useState<any>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  // Interaction mode: sentence (sentence selection) or paragraph (paragraph operations)
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("sentence");

  const containerRef = useRef<HTMLDivElement>(null);

  // Page navigation hook
  const {
    pageNumber,
    goToPage,
    goToPrevPage,
    goToNextPage,
    canGoToPrev,
    canGoToNext,
    getDisplayedPages,
  } = usePageNavigation(numPages, readingMode);

  // AI Paper Reader hook
  const {
    paperContext,
    hasOCRData,
    isLoadingContext,
    contextError,
    isAgentReady,
  } = useAIPaperReader(pdfSource, goToPage);

  // PDF URL
  const pdfUrl = useMemo(() => {
    if (!pdfSource.path) {
      console.error("path is missing from pdfSource");
      return "";
    }
    return pdfSource.path;
  }, [pdfSource.path]);

  const paperId = useMemo(() => {
    return pdfSource.arxivId || "unknown";
  }, [pdfSource.arxivId]);

  // Load insights for current paper from IndexedDB (if cached)
  useLoadPaperInsights(paperId === "unknown" ? null : paperId);

  // Sentences (placeholder)
  const sentences = useMemo<Array<{ id: string; content: string; property?: { page?: number } }>>(() => {
    return [];
  }, []);

  // Layout calculation
  const layoutCalculation = useLayoutCalculation({
    scale,
    originalPageSize,
    isTagPanelOpen: isRightPanelOpen,
    isNotesPanelOpen: false,
    isGraphPanelOpen: false,
    isIndexPanelOpen: isLeftPanelOpen,
    leftPanelWidth,
    rightPanelWidth,
    readingMode,
  });

  // Event handlers
  const eventHandlers = useEventHandlers({
    paperId,
    pageNumber,
    scale,
    numPages,
    goToPrevPage,
    goToNextPage,
    canGoToPrev,
    canGoToNext,
    setScale,
  });

  const {
    selectedText,
    hoverTimerRef,
    setHoveredWord,
    setSelectedText,
  } = eventHandlers;

  const highlightedSentenceIds: number[] = [];

  // PDF search
  const pdfSearch = usePDFSearch({
    pdfUrl,
    currentPageNumber: pageNumber,
    onPageChange: goToPage,
  });

  const {
    searchResults,
    currentResultIndex,
    searchPDF,
    navigateResult,
    clearSearch,
  } = pdfSearch;

  // Handle reading mode change
  const handleReadingModeChange = useCallback((mode: ReadingMode) => {
    setReadingMode(mode);
    updateViewState(documentId, { readingMode: mode });
  }, [documentId, updateViewState]);

  // Handle PDF item click (e.g., internal links)
  const handlePDFItemClick = useCallback(
    async (item: { pageNumber?: number; dest?: unknown; url?: string }) => {
      const { dest, pageNumber: targetPage } = item;
      if (targetPage) {
        goToPage(targetPage);
      } else if (dest) {
        try {
          const pdf = await pdfjs.getDocument(pdfUrl).promise;
          const destArray = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
          if (destArray && Array.isArray(destArray)) {
            const pageIndex = await pdf.getPageIndex(destArray[0]);
            goToPage(pageIndex + 1);
          }
        } catch (error) {
          console.error("Error navigating to destination:", error);
        }
      }
    },
    [pdfUrl, goToPage]
  );

  // Handle sentence click
  const handleSentenceClick = useCallback(
    (sentenceIds: number[], position: { x: number; y: number }, clickedPageNumber?: number) => {
      // Convert sentenceIds to contents based on sentences array
      const contents = sentenceIds.map((id) => {
        const sentence = sentences.find((s) => parseInt(s.id) === id);
        return sentence?.content || "";
      }).filter(Boolean);
      
      setSelectedSentences({
        sentenceIds,
        position,
        contents,
      });
    },
    [sentences]
  );

  // Calculate fit-to-width scale
  const calculateFitToWidthScale = useCallback(
    (pageWidth: number) => {
      if (!containerRef.current) return 1.0;

      const containerWidth = containerRef.current.clientWidth;
      let availableWidth = containerWidth - 100;

      if (isLeftPanelOpen) availableWidth -= leftPanelWidth;
      if (isRightPanelOpen) availableWidth -= rightPanelWidth;

      if (readingMode === "double") {
        availableWidth = availableWidth / 2 - 20;
      }

      const targetWidth = Math.max(availableWidth, 400);
      const calculatedScale = targetWidth / pageWidth;
      return Math.min(Math.max(calculatedScale, 0.25), 2.0);
    },
    [isLeftPanelOpen, isRightPanelOpen, rightPanelWidth, readingMode]
  );

  // Handle page load success
  const handlePageLoadSuccess = useCallback(
    (page: {
      getViewport: (options: { scale: number }) => { width: number; height: number };
    }) => {
      try {
        const originalViewport = page.getViewport({ scale: 1 });
        setOriginalPageSize({
          width: originalViewport.width,
          height: originalViewport.height,
        });

        if (scale === 1.0) {
          const autoScale = calculateFitToWidthScale(originalViewport.width);
          setScale(autoScale);
        }
      } catch (error) {
        console.error("Error getting page viewport:", error);
      }
    },
    [scale, calculateFitToWidthScale]
  );

  // Handle document load error
  const handleLoadError = useCallback(
    (error: Error) => {
      console.error("PDF loading error:", error);
      setError(`PDF loading failed: ${error.message}`);
      setLoading(false);
    },
    []
  );

  // Handle document load success
  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setDocumentNumPages(documentId, numPages);
      setLoading(false);
      setError("");

      setTimeout(() => {
        if (originalPageSize.width > 0 && scale === 1.0) {
          const autoScale = calculateFitToWidthScale(originalPageSize.width);
          setScale(autoScale);
        }
      }, 100);

      // Emit event for demo flow (if in workspace context)
      emitEvent({
        type: 'contentLoaded',
        payload: {
          action: 'document_loaded',
          result: { documentId, numPages },
        },
      });
    },
    [documentId, originalPageSize.width, scale, calculateFitToWidthScale, setDocumentNumPages]
  );

  // Check PDF URL validity
  useEffect(() => {
    if (!pdfUrl) {
      setError("Invalid PDF URL: missing file path");
      setLoading(false);
    } else {
      setError("");
      setLoading(true);
    }
  }, [pdfUrl]);

  // Update scale when layout changes
  useEffect(() => {
    if (originalPageSize.width > 0) {
      const timeoutId = setTimeout(() => {
        const newScale = calculateFitToWidthScale(originalPageSize.width);
        setScale(newScale);
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [isRightPanelOpen, isLeftPanelOpen, rightPanelWidth, readingMode, calculateFitToWidthScale, originalPageSize.width]);

  // Sync view state to store
  useEffect(() => {
    updateViewState(documentId, { pageNumber, scale, readingMode });
  }, [documentId, pageNumber, scale, readingMode, updateViewState]);

  // PDF view state for toolbar
  const pdfViewState: PDFViewState = useMemo(() => ({
    pageNumber,
    numPages,
    scale,
    readingMode,
  }), [pageNumber, numPages, scale, readingMode]);

  // Handle view state change from toolbar
  const handleViewStateChange = useCallback((state: Partial<PDFViewState>) => {
    if (state.scale !== undefined) setScale(state.scale);
    if (state.readingMode !== undefined) handleReadingModeChange(state.readingMode);
  }, [handleReadingModeChange]);

  return (
    <div ref={containerRef} className="h-full flex overflow-hidden gap-2">
      {/* Left panel */}
      <IndexPanel
        file={pdfUrl}
        currentPage={pageNumber}
        numPages={numPages}
        onPageChange={goToPage}
        isOpen={isLeftPanelOpen}
        onClose={onToggleLeftPanel}
        paperContext={paperContext}
        onWidthChange={setLeftPanelWidth}
      />

      {/* Center PDF container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-stone-200/80">
        {/* Inline toolbar */}
        <PDFToolbarInline
          viewState={pdfViewState}
          onViewStateChange={handleViewStateChange}
          onSearch={searchPDF}
          searchResults={searchResults}
          currentResultIndex={currentResultIndex}
          onNavigateResult={navigateResult}
          onClearSearch={clearSearch}
          onPrevPage={goToPrevPage}
          onNextPage={goToNextPage}
          canGoToPrev={canGoToPrev}
          canGoToNext={canGoToNext}
          interactionMode={interactionMode}
          onInteractionModeChange={setInteractionMode}
          hasOCRData={hasOCRData}
          className="rounded-t-xl"
        />

        {/* PDF rendering area */}
        <div className="flex-1 overflow-auto">
          {pdfUrl ? (
            <PDFRenderer
              pdfUrl={pdfUrl}
              numPages={numPages}
              pageNumber={pageNumber}
              scale={scale}
              loading={loading}
              error={error}
              readingMode={readingMode}
              originalPageSize={originalPageSize}
              pdfOptions={PDF_OPTIONS}
              onLoadSuccess={handleLoadSuccess}
              onLoadError={handleLoadError}
              onPageLoadSuccess={handlePageLoadSuccess}
              hoverTimerRef={hoverTimerRef}
              setHoveredWord={setHoveredWord}
              selectedText={selectedText}
              setSelectedText={setSelectedText}
              searchResults={searchResults}
              currentResultIndex={currentResultIndex}
              onPageChange={goToPage}
              onItemClick={handlePDFItemClick}
              isSentenceLayerEnabled={ENABLE_SENTENCE_LAYER && isSentenceLayerEnabled}
              sentences={ENABLE_SENTENCE_LAYER ? sentences : []}
              selectedSentenceIds={ENABLE_SENTENCE_LAYER ? highlightedSentenceIds : []}
              onSentenceClick={ENABLE_SENTENCE_LAYER ? handleSentenceClick : undefined}
              isObjectLayerEnabled={ENABLE_OBJECT_SELECTION && hasOCRData}
              pageDetections={paperContext?.detections || []}
              ocrImageSize={paperContext?.pages?.[0]?.meta}
              paperId={paperId}
              interactionMode={interactionMode}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-600 mb-2">PDF Loading Failed</p>
                <p className="text-gray-600 text-sm">{error || "Invalid PDF URL"}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right AI panel */}
      <AIRightPanel
        isOpen={isRightPanelOpen}
        onClose={onToggleRightPanel}
        onWidthChange={setRightPanelWidth}
        onNavigateToPage={goToPage}
      />

      {/* Text selection popup */}
      {selectedText && (
        <SelectionPopup
          position={selectedText.position}
          selectedText={selectedText.text}
          pageNumber={pageNumber}
          onClose={() => setSelectedText(null)}
        />
      )}

      {/* Sentence selection popup */}
      {selectedSentences && (
        <SelectionPopup
          position={selectedSentences.position}
          selectedText={selectedSentences.contents.join(" ")}
          pageNumber={pageNumber}
          onClose={() => setSelectedSentences(null)}
        />
      )}

      {/* Shortcuts floating button */}
      <ShortcutsFloatingButton
        isIndexPanelOpen={isLeftPanelOpen}
        isOpen={isShortcutsOpen}
        onToggle={setIsShortcutsOpen}
      />
    </div>
  );
};

export default PDFReaderContent;

