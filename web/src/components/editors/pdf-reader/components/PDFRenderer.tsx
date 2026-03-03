import React, { useRef, useCallback, useEffect, useState } from "react";
import { Document, Page } from "react-pdf";
import { motion, AnimatePresence } from "framer-motion";
import { SentenceLayer } from "./layers/SentenceLayer";
import { ObjectSelectionLayer } from "./layers/ObjectSelectionLayer";
import { TextBlockLayer } from "./layers/TextBlockLayer";
import { CustomSelectionLayer } from "./layers/CustomSelectionLayer";
import { CitationHighlightLayer } from "./layers/CitationHighlightLayer";
import { SearchHighlight } from "./SearchHighlight";
import { PDFStatus } from "./PDFStatus";
import { ReadingMode } from "./PDFToolbar";
import { InteractionMode } from "./PDFToolbarInline";
import { PageDetection, Detection } from "@/types/paperContext";
import { useCitationStore } from "../store/citationStore";
import { TargetLanguage, DEFAULT_LANGUAGE } from "../services/translateService";

/**
 * TODO: [SELECTION_MODE] Text selection mode toggle
 *
 * When enabled, uses CustomSelectionLayer instead of native TextLayer selection.
 * Pros: Fixes the "reverse selection" issue when starting selection from whitespace.
 * Cons: May slightly affect performance.
 *
 * Set to true to enable the custom selection layer.
 */
const ENABLE_CUSTOM_SELECTION = true;

interface PDFRendererProps {
  pdfUrl: string;
  numPages: number;
  pageNumber: number;
  scale: number;
  loading: boolean;
  error: string;
  readingMode: ReadingMode;
  originalPageSize: { width: number; height: number };
  pdfOptions: any;
  // Event handlers
  onLoadSuccess: ({ numPages }: { numPages: number }) => void;
  onLoadError: (error: Error) => void;
  onPageLoadSuccess: (page: any) => void;
  hoverTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  setHoveredWord: (word: any) => void;
  // Text selection and highlighting
  selectedText: any;
  setSelectedText: (text: any) => void;
  // Search
  searchResults: any[];
  currentResultIndex: number;
  // For continuous mode scroll handling
  onPageChange?: (pageNumber: number) => void;
  // PDF internal link navigation
  onItemClick?: (item: {
    pageNumber?: number;
    dest?: unknown;
    url?: string;
  }) => void;
  // Sentence interaction layer
  isSentenceLayerEnabled?: boolean;
  sentences?: any[];
  selectedSentenceIds?: number[];
  onSentenceClick?: (
    sentenceIds: number[],
    position: { x: number; y: number },
    clickedPageNumber?: number
  ) => void;
  // Object selection layer (images, tables, etc.)
  isObjectLayerEnabled?: boolean;
  pageDetections?: PageDetection[];
  /** OCR image dimensions (for coordinate conversion). Format: { width: number, height: number } */
  ocrImageSize?: { width: number; height: number };
  onObjectClick?: (detection: Detection, position: { x: number; y: number }) => void;
  onExplainObject?: (detection: Detection) => void;
  /** Paper ID for constructing image paths */
  paperId?: string;
  /** Interaction mode: selection (text selection) or translate (paragraph translation) */
  interactionMode?: InteractionMode;
}

export const PDFRenderer: React.FC<PDFRendererProps> = ({
  pdfUrl,
  numPages,
  pageNumber,
  scale,
  loading,
  error,
  readingMode,
  originalPageSize,
  pdfOptions,
  onLoadSuccess,
  onLoadError,
  onPageLoadSuccess,
  hoverTimerRef,
  setHoveredWord,
  setSelectedText,
  searchResults,
  currentResultIndex,
  onPageChange,
  onItemClick,
  isSentenceLayerEnabled = false,
  sentences = [],
  selectedSentenceIds = [],
  onSentenceClick,
  isObjectLayerEnabled = false,
  pageDetections = [],
  ocrImageSize,
  onObjectClick,
  onExplainObject,
  paperId,
  interactionMode = "sentence",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const isProgrammaticScroll = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  
  // Clean up on component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clean up timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  
  // Translation layer state
  const [translateLanguage, setTranslateLanguage] = useState<TargetLanguage>(DEFAULT_LANGUAGE);
  
  // Determine which layer to enable based on interaction mode
  // sentence mode: enable CustomSelectionLayer (sentence/text selection)
  // paragraph mode: enable TextBlockLayer (paragraph translation)
  const isTranslateLayerEnabled = isObjectLayerEnabled && interactionMode === "paragraph";
  const isCustomSelectionEnabled = ENABLE_CUSTOM_SELECTION && interactionMode === "sentence";

  // Handle links in the PDF annotation layer, making them open in a new tab
  React.useEffect(() => {
    const handleLinkAnnotations = () => {
      // Find all links in PDF annotation layers
      const annotationLinks = document.querySelectorAll('.linkAnnotation a[href]');
      
      annotationLinks.forEach((link) => {
        const anchor = link as HTMLAnchorElement;
        // Only handle external links (not internal page jump links)
        if (anchor.href && !anchor.href.startsWith('#') && !anchor.href.includes('page=')) {
          anchor.setAttribute('target', '_blank');
          anchor.setAttribute('rel', 'noopener noreferrer');
        }
      });
    };

    // Use MutationObserver to watch DOM changes, since PDF pages are rendered asynchronously
    const observer = new MutationObserver(() => {
      handleLinkAnnotations();
    });

    // Start observing document changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href']
    });

    // Initial handling of existing links
    handleLinkAnnotations();

    return () => {
      observer.disconnect();
    };
  }, [pageNumber, scale]); // Re-process when page number or scale changes

  // Handle scroll for continuous mode
  const handleScroll = useCallback(() => {
    if (isProgrammaticScroll.current) return;

    if (readingMode !== "continuous" || !onPageChange) return;

    const container = containerRef.current;
    if (!container) return;

    const containerTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const centerY = containerTop + containerHeight / 2;

    // Find which page is currently in the center of the view
    for (let i = 1; i <= numPages; i++) {
      const pageElement = pageRefs.current[i];
      if (!pageElement) continue;

      const pageTop = pageElement.offsetTop;
      const pageBottom = pageTop + pageElement.offsetHeight;

      if (centerY >= pageTop && centerY <= pageBottom) {
        onPageChange(i);
        break;
      }
    }
  }, [readingMode, numPages, onPageChange]);

  // Use refs to store latest values - synchronous updates (assigned directly during each render)
  const lastScrollTargetRef = useRef<{ page: number; time: number } | null>(null);
  const currentPageRef = useRef(pageNumber);
  const readingModeRef = useRef(readingMode);
  const onPageChangeRef = useRef(onPageChange);
  const ocrImageSizeRef = useRef(ocrImageSize);
  
  // Synchronously update ref values (without useEffect, ensuring values are updated before events fire)
  currentPageRef.current = pageNumber;
  readingModeRef.current = readingMode;
  onPageChangeRef.current = onPageChange;
  ocrImageSizeRef.current = ocrImageSize;

  // Listen for scroll-to-detection events (for bidirectional index navigation)
  useEffect(() => {
    const handleScrollToDetection = (event: CustomEvent<{
      detectionId: string;
      pageNumber: number;
      bbox?: { x1_px: number; y1_px: number; x2_px: number; y2_px: number };
    }>) => {
      // Safety check: ensure the component is still mounted
      if (!isMountedRef.current) {
        return;
      }
      
      // Safety check: ensure event.detail exists
      if (!event.detail) {
        console.warn('[PDFRenderer] Received scroll event with null detail');
        return;
      }
      
      const { pageNumber: targetPage, bbox, detectionId } = event.detail;
      
      // Safety check: ensure targetPage is a valid number
      if (typeof targetPage !== 'number' || isNaN(targetPage)) {
        console.warn('[PDFRenderer] Invalid targetPage:', targetPage);
        return;
      }
      
      const currentPage = currentPageRef.current;
      const mode = readingModeRef.current;
      const pageChanger = onPageChangeRef.current;
      const imgSize = ocrImageSizeRef.current;
      
      console.log('[PDFRenderer] Received scroll event:', {
        detectionId,
        targetPage,
        currentPage,
        readingMode: mode,
      });
      
      // If target page is the same as current page, return immediately
      if (targetPage === currentPage) {
        console.log('[PDFRenderer] Already on target page, skipping');
        return;
      }
      
      // Debounce: do not repeat navigation to the same target page within 500ms
      const now = Date.now();
      if (lastScrollTargetRef.current && 
          lastScrollTargetRef.current.page === targetPage &&
          now - lastScrollTargetRef.current.time < 500) {
        console.log('[PDFRenderer] Debounced - same target within 500ms');
        return;
      }
      lastScrollTargetRef.current = { page: targetPage, time: now };
      
      // Get the target page element
      const pageElement = pageRefs.current[targetPage];
      
      // Handle different reading modes
      if (mode === 'continuous') {
        // Continuous mode: scroll to target page
        console.log('[PDFRenderer] Continuous mode - scrolling to page', targetPage);
        if (pageElement) {
          isProgrammaticScroll.current = true;
          
          // 如果有 bbox，计算精确滚动位置
          if (bbox && imgSize) {
            const pageRect = pageElement.getBoundingClientRect();
            const container = containerRef.current;

            if (container) {
              // Calculate the relative position of the bbox within the page
              const relativeTop = bbox.y1_px / imgSize.height;
              const targetScrollY = pageElement.offsetTop + (pageRect.height * relativeTop) - (container.clientHeight / 3);
              
              container.scrollTo({
                top: Math.max(0, targetScrollY),
                behavior: 'smooth'
              });
            }
          } else {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          scrollTimeoutRef.current = setTimeout(() => {
            isProgrammaticScroll.current = false;
          }, 1000);
        }
      } else {
        // Single/double page mode
        console.log('[PDFRenderer] Single/Double mode - changing to page:', targetPage);
        if (pageChanger) {
          // Immediately update ref to prevent stale values during rapid clicks
          currentPageRef.current = targetPage;
          pageChanger(targetPage);
        }
      }
    };

    window.addEventListener('pdf-scroll-to-detection', handleScrollToDetection as EventListener);
    console.log('[PDFRenderer] Event listener added');
    
    return () => {
      window.removeEventListener('pdf-scroll-to-detection', handleScrollToDetection as EventListener);
      console.log('[PDFRenderer] Event listener removed');
    };
  }, []); // Empty dependency array, only add once on mount

  // Create refs for each page for CustomSelectionLayer
  const pageContentRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // Generic page rendering function
  const renderPage = (pageNum: number, showPageNumber = false) => (
    <div
      className="relative rounded-2xl overflow-hidden bg-white shadow-lg pdf-page-container"
      style={{
        width: originalPageSize.width * scale,
        height: originalPageSize.height * scale,
      }}
      data-page-number={pageNum}
      onMouseLeave={() => {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        setHoveredWord(null);
      }}
    >
      <div 
        ref={(el) => { pageContentRefs.current[pageNum] = el; }}
        className="absolute top-0 left-0 w-full h-full rounded-2xl overflow-hidden"
      >
        <Page
          pageNumber={pageNum}
          scale={scale}
          renderTextLayer
          renderAnnotationLayer
          onLoadSuccess={pageNum === pageNumber ? onPageLoadSuccess : undefined}
          onRenderError={(error) =>
            console.warn(`Page ${pageNum} render error:`, error)
          }
          loading={null}
          error={null}
          className="rounded-2xl overflow-hidden"
          data-page-number={pageNum}
        />
        <SearchHighlight
          searchResults={searchResults}
          currentResultIndex={currentResultIndex}
          pageNumber={pageNum}
          scale={scale}
          pageWidth={originalPageSize.width}
          pageHeight={originalPageSize.height}
        />
        <SentenceLayer
          pageNumber={pageNum}
          pageWidth={originalPageSize.width}
          pageHeight={originalPageSize.height}
          scale={scale}
          sentences={sentences}
          isEnabled={isSentenceLayerEnabled}
          selectedSentenceIds={selectedSentenceIds}
          onSentenceClick={onSentenceClick}
        />
        {/* Object selection layer - images, tables, formulas, etc. */}
        <ObjectSelectionLayer
          pageNumber={pageNum}
          pageWidth={originalPageSize.width}
          pageHeight={originalPageSize.height}
          scale={scale}
          detections={pageDetections.find(d => d.page_number === pageNum) || null}
          ocrImageWidth={ocrImageSize?.width}
          ocrImageHeight={ocrImageSize?.height}
          isEnabled={isObjectLayerEnabled}
          onObjectClick={onObjectClick}
          onExplainObject={onExplainObject}
          paperId={paperId}
          allDetections={pageDetections}
        />
        {/* Text translation layer - auto-translate on 1-second hover */}
        <TextBlockLayer
          pageNumber={pageNum}
          pageWidth={originalPageSize.width}
          pageHeight={originalPageSize.height}
          scale={scale}
          detections={pageDetections.find(d => d.page_number === pageNum) || null}
          ocrImageWidth={ocrImageSize?.width}
          ocrImageHeight={ocrImageSize?.height}
          isEnabled={isTranslateLayerEnabled}
          targetLanguage={translateLanguage}
          onLanguageChange={setTranslateLanguage}
        />
        {/* Citation highlight layer - displays AI bidirectional index */}
        <CitationHighlightLayer
          pageNumber={pageNum}
          scale={scale}
          pageDimensions={originalPageSize}
          ocrImageSize={ocrImageSize}
        />
        {/* Custom selection layer - text selection mode */}
        {isCustomSelectionEnabled && pageContentRefs.current[pageNum] && (
          <CustomSelectionLayer
            pageWidth={originalPageSize.width}
            pageHeight={originalPageSize.height}
            scale={scale}
            textLayerRef={{ current: pageContentRefs.current[pageNum]! }}
            onTextSelect={(text, position) => {
              setSelectedText({
                text,
                position: {
                  x: position.boundingRect.left + window.scrollX,
                  y: position.boundingRect.bottom + window.scrollY + 10,
                },
              });
            }}
          />
        )}
      </div>
      {showPageNumber && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          {pageNum}
        </div>
      )}
    </div>
  );

  // Single page mode - simplified version (animations removed for state stability)
  const renderSinglePage = () => (
    <div className="max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden scroll-smooth">
      {renderPage(pageNumber)}
    </div>
  );

  // Continuous scroll mode
  const renderContinuousPages = () => (
    <div
      ref={containerRef}
      className="space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto scroll-smooth"
      onScroll={handleScroll}
    >
      {Array.from({ length: numPages }, (_, i) => {
        const currentPageNumber = i + 1;
        return (
          <div
            key={`page_${currentPageNumber}`}
            ref={(el) => {
              if (el) {
                pageRefs.current[currentPageNumber] = el;
                // When the target page ref is established, trigger scroll if this is the page we want to navigate to
                if (currentPageNumber === pageNumber) {
                  // Delay execution to ensure the DOM is fully rendered
                  setTimeout(() => {
                    const container = containerRef.current;
                    if (container && el) {
                      const containerTop = container.scrollTop;
                      const targetTop = el.offsetTop;
                      const containerHeight = container.clientHeight;
                      const targetHeight = el.offsetHeight;

                      const isInView =
                        targetTop >= containerTop &&
                        targetTop + targetHeight <= containerTop + containerHeight;
                      
                      if (!isInView) {
                        isProgrammaticScroll.current = true;
                        container.scrollTo({
                          top: targetTop,
                          behavior: "instant",
                        });
                        if (scrollTimeoutRef.current) {
                          clearTimeout(scrollTimeoutRef.current);
                        }
                        scrollTimeoutRef.current = setTimeout(() => {
                          isProgrammaticScroll.current = false;
                        }, 1000);
                      }
                    }
                  }, 10);
                }
              }
            }}
          >
            {renderPage(currentPageNumber, true)}
          </div>
        );
      })}
    </div>
  );

  // Double page mode - with page switch animation
  const renderDoublePages = () => {
    const leftPage = pageNumber % 2 === 0 ? pageNumber - 1 : pageNumber;
    const rightPage = leftPage + 1;
    const showLeftPage = leftPage >= 1;
    const showRightPage = rightPage <= numPages;

    return (
      <div className="max-h-[calc(100vh-120px)] overflow-y-auto overflow-x-hidden scroll-smooth">
        <AnimatePresence mode="wait">
          <motion.div
            key={`pages-${leftPage}-${rightPage}`}
            className="flex gap-4 justify-center"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {showLeftPage && renderPage(leftPage, true)}
            {showRightPage && renderPage(rightPage, true)}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  };

  const renderContent = () => {
    const renderFunctions = {
      single: renderSinglePage,
      continuous: renderContinuousPages,
      double: renderDoublePages,
    };
    return (renderFunctions[readingMode] || renderSinglePage)();
  };

  return (
    <div className="flex justify-center">
      <div className="bg-[#faf8f5] shadow-lg rounded-2xl border border-[#e5e2dd] overflow-hidden">
        <PDFStatus
          loading={loading}
          error={error}
          pdfUrl={pdfUrl}
          onRetry={() => window.location.reload()}
        />
        <Document
          file={pdfUrl}
          onLoadSuccess={onLoadSuccess}
          onLoadError={onLoadError}
          onItemClick={onItemClick}
          loading={null}
          error={null}
          options={pdfOptions}
        >
          {numPages > 0 && !error && renderContent()}
        </Document>
      </div>
    </div>
  );
};
