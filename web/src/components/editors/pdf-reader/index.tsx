"use client";

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
import { PDFToolbar, ReadingMode } from "./components/PDFToolbar";
import { PDFToolbarInline, PDFViewState } from "./components/PDFToolbarInline";
import { PDFReaderTopBar } from "./components/PDFReaderTopBar";
import { OpenDocument } from "./components/DocumentTabs";
import { PaperLibraryDialog, PaperMeta } from "./components/PaperLibraryDialog";
import { PDFRenderer } from "./components/PDFRenderer";
import { ShortcutsFloatingButton } from "./components/ShortcutsFloatingButton";
import { useLayoutCalculation } from "./hooks/useLayoutCalculation";
import { useEventHandlers } from "./hooks/useEventHandlers";
import { usePDFSearch } from "./hooks/usePDFSearch";
import { useAIPaperReader } from "./hooks/useAIPaperReader";
import { usePageNavigation } from "./hooks/usePageNavigation";
import { api } from "@/lib/api";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./styles/pdf-reader.css";
import { Apis } from "@/constants/api";
import { useFlowStore } from "@/store/flowStore";
import { BlockType } from "@/types/block";
import { disciplineTemplates } from "./types";
import { PDFSource } from "@/types/paperContext";
// usePaperContext is now called internally by useAIPaperReader

// ============================================================================
// FEATURE FLAGS - OCR Service Dependencies
// ============================================================================

/**
 * TODO: [OCR_SERVICE] Sentence-level selection feature
 *
 * Dependency: OCR service provides sentence boundary coordinates (sentence boxes)
 * Data format: Each sentence contains a boxes array, each box has bbox coordinates [x1, y1, x2, y2]
 *
 * Current status: Not available - OCR service not ready
 * How to enable: Set this value to true and ensure pdfData.sents.sentences contains valid data
 *
 * Feature description:
 * - Allows users to select text at the sentence level
 * - Supports drag-selecting multiple sentences
 * - After selection, supports highlighting, annotation, and other operations
 */
const ENABLE_SENTENCE_LAYER = false;

/**
 * [OCR_SERVICE] Image/table object selection feature
 *
 * Dependency: OCR service provides boundary coordinates for images, tables, and other objects
 * Data format: Objects contain type ('image' | 'table' | 'figure') and bbox coordinates
 *
 * Current status: Enabled - automatically enabled based on OCR data availability
 *
 * Feature description:
 * - Allows users to select images, tables, and other objects in the PDF
 * - Hover displays object type and action buttons
 * - Supports "Explain" button to invoke AI explanation of the object
 */
const ENABLE_OBJECT_SELECTION = true;

/**
 * [AI_PANEL] AI-Native right panel (now the only mode)
 *
 * Features include:
 * - Paper Overview: Paper overview card
 * - Quick Insights: AI-generated paper insights
 * - Ask Paper: Conversational paper Q&A
 * - Extracts: Traceable content extraction
 *
 * Current status: Enabled (legacy mode has been removed)
 */

// ============================================================================

// PDF.js worker configuration - only on client side
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PDFReaderProps {
  pdfSource: PDFSource;
  onClose: () => void;
}

interface SentenceTag {
  id: string;
  color: string;
  comments: {
    id: string;
    content: string;
    author: string;
    timestamp: number;
    likes: number;
    isLiked: boolean;
  }[];
  isLiked: boolean;
  isVisible: boolean;
  likes: number;
  pageNumber: number;
  position: { x: number; y: number };
  sentenceContent: string;
  sentenceIds: number[];
  timestamp: number;
}

const leftPanelWidth = 320;

const PDFReader: React.FC<PDFReaderProps> = ({ onClose, pdfSource: initialPdfSource }) => {
  const { setPendingItems } = useFlowStore();
  
  // Support dynamically switching PDF source (selected from the paper library)
  const [currentPdfSource, setCurrentPdfSource] = useState<PDFSource>(initialPdfSource);
  
  // When the externally provided pdfSource changes, sync the internal state
  const initialSourceKey = initialPdfSource?.arxivId || initialPdfSource?.path || '';
  useEffect(() => {
    if (initialSourceKey) {
      console.log('[PDFReader] External source changed, updating:', initialSourceKey);
      setCurrentPdfSource(initialPdfSource);
    }
  }, [initialSourceKey, initialPdfSource]);
  
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [originalPageSize, setOriginalPageSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Reading mode state (must be declared before usePageNavigation)
  const [readingMode, setReadingMode] = useState<ReadingMode>("single");

  // Unified page navigation hook - resolves issues like double-page mode page turning
  const {
    pageNumber,
    goToPage,
    goToPrevPage,
    goToNextPage,
    canGoToPrev,
    canGoToNext,
    getDisplayedPages,
  } = usePageNavigation(numPages, readingMode);

  // AI Paper Reader Hook - loads Agent and Paper Context
  // This is the sole source of paperContext, ensuring sync with aiStore
  const {
    paperContext,
    hasOCRData,
    isLoadingContext,
    contextError,
    isAgentReady,
  } = useAIPaperReader(currentPdfSource, goToPage);

  // Get PDF URL and sentences from paperContext
  const pdfUrl = useMemo(() => {
    if (!currentPdfSource.path) {
      console.error("path is missing from pdfSource");
      return "";
    }
    return currentPdfSource.path;
  }, [currentPdfSource.path]);

  // Get paperId for API calls
  const paperId = useMemo(() => {
    return currentPdfSource.arxivId || "unknown";
  }, [currentPdfSource.arxivId]);

  // Get sentences from paperContext (if OCR data is available)
  // NOTE: Currently PageContent doesn't have a sentences property
  // This is a placeholder for future sentence-level interaction
  const sentences = useMemo<Array<{ id: string; content: string; property?: { page?: number } }>>(() => {
    // TODO: Implement sentences extraction when OCR data includes sentence-level information
    return [];
  }, []);

  // Panel states
  const [isIndexPanelOpen, setIsIndexPanelOpen] = useState(true); // Left sidebar open by default to show Insight
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true); // Right sidebar open by default
  const [rightPanelWidth, setRightPanelWidth] = useState(380);

  // Multi-document management state (Phase 1: single document support)
  const documents: OpenDocument[] = useMemo(() => {
    const title = paperContext?.metadata?.title || currentPdfSource.arxivId || "Untitled";
    return [{
      id: currentPdfSource.arxivId || "doc-1",
      title: title.length > 30 ? title.slice(0, 30) + "..." : title,
      arxivId: currentPdfSource.arxivId,
      isDirty: false,
    }];
  }, [currentPdfSource.arxivId, paperContext?.metadata?.title]);

  const activeDocumentId = documents[0]?.id || null;

  // Notes editor state
  const [notesContent, setNotesContent] = useState<string>("");

  // Sentence interaction layer state
  // Note: controlled by the ENABLE_SENTENCE_LAYER feature flag
  const [isSentenceLayerEnabled, setIsSentenceLayerEnabled] = useState(
    ENABLE_SENTENCE_LAYER // Use the feature flag as the initial value
  );
  const [selectedSentences, setSelectedSentences] = useState<any>(null);

  // Tag system state
  const [sentenceTags, setSentenceTags] = useState<SentenceTag[]>([]);

  // PDF outline state

  // Shortcuts floating button state
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Container ref
  const containerRef = useRef<HTMLDivElement>(null);

  // Note: useAIPaperReader is called above, providing paperContext and AI-related functionality

  // Use layout calculation hook
  const layoutCalculation = useLayoutCalculation({
    scale,
    originalPageSize,
    isTagPanelOpen: isRightPanelOpen,
    isNotesPanelOpen: false,
    isGraphPanelOpen: false,
    isIndexPanelOpen: isIndexPanelOpen,
    leftPanelWidth,
    rightPanelWidth,
    readingMode,
  });

  const { needsCompression, rightMargin, leftMargin, maxPdfContainerWidth } =
    layoutCalculation;

  // Use event handlers hook - pass in mode-aware page turn functions
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

  // Sentence highlight IDs (currently empty, can be obtained from aiStore extracts)
  const highlightedSentenceIds: number[] = [];

  // Use PDF search hook
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

  // Handle content insertion into the editor
  const handleInsertToEditor = useCallback(
    (content: string, type: "text" | "quote" = "quote") => {
      // Ensure the right panel is open
      if (!isRightPanelOpen) {
        setIsRightPanelOpen(true);
      }

      // TODO: Implement proper insert to notes functionality
      // Currently AIRightPanel doesn't expose a ref interface for this
      console.log("Insert content to editor:", { content, type });
    },
    [isRightPanelOpen]
  );

  // Load PDF outline data
  useEffect(() => {
    const loadPDFOutline = async () => {
      try {
        const pdf = await pdfjs.getDocument(pdfUrl).promise;
        const outline = await pdf.getOutline();
        if (outline) {
          // Process each outline item to get page numbers
          const processedOutline = await Promise.all(
            outline.map(async (item: any) => {
              try {
                const dest = await pdf.getDestination(item.dest);
                if (dest) {
                  const pageNumber = (await pdf.getPageIndex(dest[0])) + 1;
                  return {
                    ...item,
                    pageNumber,
                    items: item.items
                      ? await Promise.all(
                          item.items.map(async (subItem: any) => {
                            try {
                              const subDest = await pdf.getDestination(
                                subItem.dest
                              );
                              if (subDest) {
                                const subPageNumber =
                                  (await pdf.getPageIndex(subDest[0])) + 1;
                                return {
                                  ...subItem,
                                  pageNumber: subPageNumber,
                                };
                              }
                              return subItem;
                            } catch (error) {
                              console.error(
                                "Error processing sub-item:",
                                error
                              );
                              return subItem;
                            }
                          })
                        )
                      : undefined,
                  };
                }
                return item;
              } catch (error) {
                console.error("Error processing outline item:", error);
                return item;
              }
            })
          );
          console.log("PDF outline loaded:", processedOutline);
        }
      } catch (error) {
        console.error("Failed to load PDF outline:", error);
      }
    };

    if (pdfUrl) {
      loadPDFOutline();
    }
  }, [pdfUrl]);

  // Handle sentence click
  const handleSentenceClick = useCallback(
    (
      sentenceIds: (string | number)[],
      position: { x: number; y: number },
      clickedPageNumber?: number
    ) => {
      if (sentenceIds.length === 0) {
        // Clear selection (but keep saved tag highlights)
        setSelectedSentences(null);
        // Do not clear highlightedSentenceIds since those are saved tags
        return;
      }

      // Get the content of selected sentences
      const stringIds = sentenceIds.map(String);
      const selectedSentenceData = sentences.filter((s) =>
        stringIds.includes(s.id)
      );
      const sentenceContents = selectedSentenceData.map((s) => s.content);

      // Determine the correct page number: prefer the page number at click time, otherwise use the sentence's own page number
      const actualPageNumber =
        clickedPageNumber ||
        selectedSentenceData[0]?.property?.page ||
        pageNumber;

      console.log("Sentence click handling:", {
        sentenceIds,
        clickedPageNumber,
        actualPageNumber,
        currentPageNumber: pageNumber,
        readingMode,
      });

      // Set the selected sentences and popup position
      setSelectedSentences({
        ids: sentenceIds,
        contents: sentenceContents,
        position,
        actualPageNumber, // Add the actual page number
      });
    },
    [sentences, pageNumber, readingMode]
  );

  // Handle sentence highlighting (create annotation)
  const handleSentenceHighlight = useCallback(
    (color: string) => {
      if (!selectedSentences) return;

      // Use the actual page number instead of the currently displayed page number
      const targetPageNumber = selectedSentences.actualPageNumber || pageNumber;

      // Create a sentence tag to record the highlight
      const newTag = {
        id: `sentence-tag-${Date.now()}`,
        sentenceIds: selectedSentences.ids,
        sentenceContent: selectedSentences.contents.join(" "),
        pageNumber: targetPageNumber,
        position: selectedSentences.position,
        color: color,
        timestamp: Date.now(),
        comments: [],
        isVisible: true,
        likes: 0,
        isLiked: false,
      };

      setSentenceTags((prev) => [...prev, newTag]);
      setSelectedSentences(null);
      handleSentenceClick([], { x: 0, y: 0 }, pageNumber);
    },
    [selectedSentences, pageNumber]
  );

  // Handle tag click (navigate to PDF location)
  const handleTagClick = useCallback((tag: any) => {
    // Navigate to the page where the tag is located
    goToPage(tag.pageNumber);
  }, [goToPage]);

  // Handle tag visibility toggle
  const handleTagVisibilityToggle = useCallback((tagId: string) => {
    setSentenceTags((prev) => {
      const updatedTags = prev.map((tag) =>
        tag.id === tagId ? { ...tag, isVisible: !tag.isVisible } : tag
      );

      return updatedTags;
    });
  }, []);

  // Handle tag deletion
  const handleTagDelete = useCallback((tagId: string) => {
    setSentenceTags((prev) => prev.filter((tag) => tag.id !== tagId));
  }, []);

  // Handle adding a comment
  const handleAddComment = useCallback((tagId: string, content: string) => {
    const newComment = {
      id: `comment-${Date.now()}`,
      content: content,
      author: "Current User", // TODO: Get from user system
      timestamp: Date.now(),
      likes: 0,
      isLiked: false,
    };

    setSentenceTags((prev) =>
      prev.map((tag) =>
        tag.id === tagId
          ? { ...tag, comments: [...tag.comments, newComment] }
          : tag
      )
    );
  }, []);

  // Handle tag like
  const handleLikeTag = useCallback((tagId: string) => {
    setSentenceTags((prev) =>
      prev.map((tag) =>
        tag.id === tagId
          ? {
              ...tag,
              isLiked: !tag.isLiked,
              likes: tag.isLiked ? tag.likes - 1 : tag.likes + 1,
            }
          : tag
      )
    );
  }, []);

  // Handle comment like
  const handleLikeComment = useCallback((tagId: string, commentId: string) => {
    setSentenceTags((prev) =>
      prev.map((tag) =>
        tag.id === tagId
          ? {
              ...tag,
              comments: tag.comments.map((comment: any) =>
                comment.id === commentId
                  ? {
                      ...comment,
                      isLiked: !comment.isLiked,
                      likes: comment.isLiked
                        ? comment.likes - 1
                        : comment.likes + 1,
                    }
                  : comment
              ),
            }
          : tag
      )
    );
  }, []);

  // Load notes data from API
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const response = await api.get<{ id: number; content: string }>(
          `${Apis["pdf-notes"]}?block_id=${paperId}`
        );
        if (response.id) {
          setNotesContent(response.content);
        }
      } catch (error) {
        console.error("Failed to load notes from API:", error);
      }
    };

    loadNotes();
  }, [paperId]);

  // Memoize PDF options - use local paths to avoid CDN dependencies
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
    }),
    []
  );

  // Handle PDF internal link click - uses goToPage (which includes normalization logic)
  const handlePDFItemClick = useCallback(
    (item: { pageNumber?: number; dest?: unknown }) => {
      if (item && typeof item.pageNumber === "number") {
        goToPage(item.pageNumber);
      }
    },
    [goToPage]
  );

  // Reading mode switch handler
  // Note: The usePageNavigation hook automatically handles page number normalization on mode switch
  const handleReadingModeChange = useCallback(
    (mode: ReadingMode) => {
      setReadingMode(mode);
    },
    []
  );

  // Calculate fit-to-container scale
  const calculateFitToWidthScale = useCallback(
    (pageWidth: number): number => {
      if (!pageWidth || !containerRef.current) return 1;

      // Get container width
      const containerWidth = containerRef.current.clientWidth;

      // Calculate the width occupied by left and right panels
      const leftPanelSpace = isIndexPanelOpen ? leftPanelWidth : 0;
      const rightPanelSpace = isRightPanelOpen ? rightPanelWidth : 0;
      
      // Calculate available width
      const padding = 48; // Left and right padding
      const availableWidth = containerWidth - leftPanelSpace - rightPanelSpace - padding;

      // Adjust based on reading mode
      let targetWidth = availableWidth;
      if (readingMode === "double") {
        targetWidth = (availableWidth - 16) / 2;
      }

      targetWidth = Math.max(targetWidth, 300);
      const calculatedScale = targetWidth / pageWidth;

      const minScale = 0.25;
      const maxScale = 2.0;

      return Math.min(Math.max(calculatedScale, minScale), maxScale);
    },
    [isIndexPanelOpen, isRightPanelOpen, rightPanelWidth, readingMode]
  );

  // Handle page size change
  const handlePageLoadSuccess = useCallback(
    (page: {
      getViewport: (options: { scale: number }) => {
        width: number;
        height: number;
      };
    }) => {
      try {
        // Get original page dimensions (scale = 1)
        const originalViewport = page.getViewport({ scale: 1 });
        const pageWidth = originalViewport.width;
        const pageHeight = originalViewport.height;

        // Save original dimensions
        setOriginalPageSize({
          width: pageWidth,
          height: pageHeight,
        });

        if (scale === 1.0) {
          const autoScale = calculateFitToWidthScale(pageWidth);
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
      console.error("PDF URL:", pdfUrl);
      setError(`PDF loading failed: ${error.message}`);
      setLoading(false);
    },
    [pdfUrl]
  );

  // Handle document load success
  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setLoading(false);
      setError("");
      console.log("PDF loaded successfully, pages:", numPages);

      // Wait briefly to ensure the DOM is fully rendered before calculating the optimal scale
      setTimeout(() => {
        if (originalPageSize.width > 0 && scale === 1.0) {
          const autoScale = calculateFitToWidthScale(originalPageSize.width);
          setScale(autoScale);
          console.log("Auto-calculated scale after document load:", autoScale);
        }
      }, 100);
    },
    [originalPageSize.width, scale, calculateFitToWidthScale]
  );

  // Check if PDF URL is valid
  useEffect(() => {
    if (!pdfUrl) {
      setError("Invalid PDF URL: missing file path or API base URL");
      setLoading(false);
    } else {
      setError("");
      setLoading(true);
    }
  }, [pdfUrl]);

  // Add global click event listener to clear selection state when clicking outside the PDF area
  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if the click is inside the PDF content area, toolbar, or popup
      const isPDFContent = target.closest("[data-page-number]");
      const isToolbar = target.closest(".pdf-toolbar");
      const isPopup =
        target.closest(".selection-popup") || target.closest('[role="dialog"]');
      const isRightPanel = target.closest(".right-panel");

      // If click is outside the PDF area and not in the toolbar or popup, clear selection state
      if (!isPDFContent && !isToolbar && !isPopup && !isRightPanel) {
        setSelectedText(null);
        setSelectedSentences(null);
        setHoveredWord(null);
      }
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Check if inside an input field; if so, do not process global shortcuts
      const target = event.target as HTMLElement;
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true";

      if (isInputElement) return;

      // "?" key toggles the shortcuts panel
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };

    document.addEventListener("click", handleGlobalClick);
    document.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      document.removeEventListener("click", handleGlobalClick);
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [setSelectedText, setHoveredWord]);

  const handleAddToCanvas = useCallback(async () => {
    try {
      // Check if notes content is empty or contains only whitespace (including newlines)
      if (!notesContent || !notesContent.toString().replace(/\s/g, "").trim()) {
        console.warn("Notes content is empty, cannot add to canvas");
        return;
      }

      // Create markdown file content
      const markdownContent = notesContent;
      const fileName = `notes-${Date.now()}.md`;

      const file = new File([markdownContent], fileName, {
        type: "text/markdown",
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "markdown");

      const uploadResponse = await api.post<{
        file_path: string;
        [key: string]: unknown;
      }>(Apis.upload, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const item = {
        type: BlockType.Markdown,
        item: {
          link: uploadResponse.file_path,
          link_type: "s3",
          name: fileName,
        },
      };

      // Create block
      const createBlockResponse = await api.post<{
        id: number;
      }>(Apis["create-block"], item);

      await setPendingItems([
        {
          id: createBlockResponse.id,
          type: BlockType.Markdown,
          data: { content: notesContent },
        },
      ]);
      onClose();
    } catch (error) {
      console.error("Failed to add to canvas:", error);
      // Error notification can be added here
    }
  }, [notesContent, setPendingItems, onClose]);

  // Recalculate scale when panel state or reading mode changes
  useEffect(() => {
    if (originalPageSize.width > 0) {
      const timeoutId = setTimeout(() => {
        const newScale = calculateFitToWidthScale(originalPageSize.width);
        setScale(newScale);
        console.log("Scale updated due to layout change:", newScale);
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [
    isRightPanelOpen,
    isIndexPanelOpen,
    rightPanelWidth,
    readingMode,
    calculateFitToWidthScale,
    originalPageSize.width,
  ]);

  // PDF view state object (for PDFToolbarInline)
  const pdfViewState: PDFViewState = useMemo(() => ({
    pageNumber,
    numPages,
    scale,
    readingMode,
  }), [pageNumber, numPages, scale, readingMode]);

  // Handle view state change
  const handleViewStateChange = useCallback((state: Partial<PDFViewState>) => {
    if (state.scale !== undefined) setScale(state.scale);
    if (state.readingMode !== undefined) handleReadingModeChange(state.readingMode);
  }, [handleReadingModeChange]);

  // Paper library dialog state
  const [isPaperLibraryOpen, setIsPaperLibraryOpen] = useState(false);

  // Multi-document callbacks
  const handleSelectDocument = useCallback((_id: string) => {
    // Phase 2: Implement multi-document switching
    console.log("Document switch not yet implemented");
  }, []);

  const handleCloseDocument = useCallback((_id: string) => {
    // Phase 2: Implement multi-document closing
    onClose();
  }, [onClose]);

  const handleAddDocument = useCallback(() => {
    // Open the paper library dialog
    setIsPaperLibraryOpen(true);
  }, []);

  const handleSelectPaperFromLibrary = useCallback((paper: PaperMeta) => {
    console.log("Selected paper from library:", paper.arxivId);
    
    // Use API route to fetch PDF (avoid issues with direct static file access)
    // Format: /api/ocr/{arxivId}/pdf
    const pdfPath = paper.pdfPath || `/api/ocr/${paper.arxivId}/pdf`;
    
    // Create a new PDF source
    const newSource: PDFSource = {
      type: "url",
      path: pdfPath,
      arxivId: paper.arxivId,
    };
    
    console.log("New PDF source:", newSource);
    
    // Reset state
    setLoading(true);
    setError("");
    setNumPages(0);
    setScale(1.0);
    
    // Switch to the new PDF source
    setCurrentPdfSource(newSource);

    // Close the paper library dialog
    setIsPaperLibraryOpen(false);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="pdf-reader-container relative h-full w-full bg-stone-200/50 flex flex-col overflow-hidden p-2 gap-2"
    >
      {/* Top bar - document tabs + panel toggles */}
      <PDFReaderTopBar
        documents={documents}
        activeDocumentId={activeDocumentId}
        onSelectDocument={handleSelectDocument}
        onCloseDocument={handleCloseDocument}
        onAddDocument={handleAddDocument}
        onMinimize={onClose}
        isLeftPanelOpen={isIndexPanelOpen}
        onToggleLeftPanel={() => setIsIndexPanelOpen(!isIndexPanelOpen)}
        isRightPanelOpen={isRightPanelOpen}
        onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
      />

      {/* Main content area - three-column layout */}
      <div className="flex-1 flex overflow-hidden relative gap-2">
        {/* Left panel - Index Panel (fixed width) */}
        <IndexPanel
          file={pdfUrl}
          currentPage={pageNumber}
          numPages={numPages}
          onPageChange={goToPage}
          isOpen={isIndexPanelOpen}
          onClose={() => setIsIndexPanelOpen(false)}
          paperContext={paperContext}
          onOpenReferenceInReader={(arxivId) => {
            // Get paper PDF path from API and load it
            handleSelectPaperFromLibrary({
              id: arxivId,
              title: "",
              authors: [],
              arxivId,
              pdfPath: `/data/output/${arxivId}/${arxivId}.pdf`,
              hasOCRData: true,
            });
          }}
        />

        {/* Center PDF container (inline toolbar + renderer) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-stone-200/80">
          {/* Inline toolbar - reading mode / search / page number / zoom */}
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
                pdfOptions={pdfOptions}
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
                // Sentence interaction layer props
                // TODO: [OCR_SERVICE] When ENABLE_SENTENCE_LAYER = false, SentenceLayer will not render
                isSentenceLayerEnabled={ENABLE_SENTENCE_LAYER && isSentenceLayerEnabled}
                sentences={ENABLE_SENTENCE_LAYER ? sentences : []}
                selectedSentenceIds={ENABLE_SENTENCE_LAYER ? highlightedSentenceIds : []}
                onSentenceClick={ENABLE_SENTENCE_LAYER ? handleSentenceClick : undefined}
                // Object selection layer props (images, tables, etc.)
                // Enabled when OCR data is available and detections is not empty
                isObjectLayerEnabled={ENABLE_OBJECT_SELECTION && hasOCRData}
                pageDetections={paperContext?.detections || []}
                // OCR image dimensions (from first page meta, used for coordinate conversion)
                ocrImageSize={paperContext?.pages?.[0]?.meta}
                // Paper ID for image path construction
                paperId={paperId}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-red-600 mb-2">PDF Loading Failed</p>
                  <p className="text-gray-600 text-sm">
                    {error || "Invalid PDF URL"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right AI panel */}
        <AIRightPanel
          isOpen={isRightPanelOpen}
          onClose={() => setIsRightPanelOpen(false)}
          onWidthChange={setRightPanelWidth}
          onNavigateToPage={goToPage}
        />
      </div>

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
        isIndexPanelOpen={isIndexPanelOpen}
        isOpen={isShortcutsOpen}
        onToggle={setIsShortcutsOpen}
      />

      {/* Paper library dialog */}
      <PaperLibraryDialog
        isOpen={isPaperLibraryOpen}
        onClose={() => setIsPaperLibraryOpen(false)}
        onSelectPaper={handleSelectPaperFromLibrary}
        openPaperIds={documents.map((d) => d.id)}
      />
    </div>
  );
};

export default PDFReader;

// Multi-document version exports
export { PDFReaderWrapper } from "./PDFReaderWrapper";
export { PDFReaderContent } from "./PDFReaderContent";
export { useMultiDocumentStore } from "./store/multiDocumentStore";
