/**
 * CitationHighlightLayer
 * 
 * Renders citation highlights on PDF pages
 * Displays bidirectional index relationships between AI-generated content and source text
 *
 * Features:
 * - Pulse animation when active
 * - Preview border on hover
 * - Flash effect when auto-scrolling
 */

import React, { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCitationStore, FlatDetection } from '../../store/citationStore';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

interface CitationHighlightLayerProps {
  /** Current page number */
  pageNumber: number;
  /** Zoom scale */
  scale: number;
  /** Original PDF page dimensions */
  pageDimensions: { width: number; height: number };
  /** OCR image dimensions (for coordinate conversion) */
  ocrImageSize?: { width: number; height: number; dpi?: number };
}

// ============================================================
// Animation Variants
// ============================================================

const highlightVariants = {
  initial: { 
    opacity: 0, 
    scale: 0.9,
  },
  active: { 
    opacity: 1, 
    scale: 1,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1] as const // easeOut cubic-bezier
    }
  },
  flash: {
    opacity: [0, 1, 0.7, 1],
    scale: [0.95, 1.02, 0.98, 1],
    transition: {
      duration: 0.6,
      times: [0, 0.3, 0.6, 1],
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.95,
    transition: {
      duration: 0.2
    }
  }
};

const labelVariants = {
  initial: { opacity: 0, y: 8, scale: 0.9 },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: {
      delay: 0.15,
      duration: 0.2,
      ease: [0.25, 0.1, 0.25, 1] as const // easeOut cubic-bezier
    }
  },
  exit: { 
    opacity: 0, 
    y: -4, 
    scale: 0.9,
    transition: { duration: 0.15 }
  }
};

const pulseKeyframes = `
  @keyframes citation-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
  }
`;

// ============================================================
// Component
// ============================================================

export const CitationHighlightLayer: React.FC<CitationHighlightLayerProps> = ({
  pageNumber,
  scale,
  pageDimensions,
  ocrImageSize,
}) => {
  // Citation Store
  const {
    activeCitations,
    hoveredCitation,
    getPageDetections,
  } = useCitationStore();

  // Track recently added citations (for flash effect)
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const [prevActiveCitations, setPrevActiveCitations] = useState<string[]>([]);

  // Detect newly activated citations
  useEffect(() => {
    const newCitations = activeCitations.filter(id => !prevActiveCitations.includes(id));
    if (newCitations.length > 0) {
      setFlashingIds(new Set(newCitations));
      // Clear flash state
      const timer = setTimeout(() => {
        setFlashingIds(new Set());
      }, 600);
      return () => clearTimeout(timer);
    }
    setPrevActiveCitations(activeCitations);
  }, [activeCitations, prevActiveCitations]);

  // Get detection data for the current page
  const pageDetectionsList = useMemo(() => {
    return getPageDetections(pageNumber);
  }, [getPageDetections, pageNumber]);

  // Filter detections that need highlighting
  const highlightedDetections = useMemo(() => {
    const result: Array<{
      detection: FlatDetection;
      isActive: boolean;
      isHovered: boolean;
      isFlashing: boolean;
    }> = [];

    for (const detection of pageDetectionsList) {
      const isActive = activeCitations.includes(detection.id);
      const isHovered = hoveredCitation === detection.id;
      const isFlashing = flashingIds.has(detection.id);

      if (isActive || isHovered) {
        result.push({ detection, isActive, isHovered, isFlashing });
      }
    }

    return result;
  }, [pageDetectionsList, activeCitations, hoveredCitation, flashingIds]);

  // If there are no detections to highlight, don't render
  if (highlightedDetections.length === 0) {
    return null;
  }

  // Coordinate conversion: convert from OCR pixel coordinates to percentages
  const convertCoords = (box: {
    x1_px: number;
    y1_px: number;
    x2_px: number;
    y2_px: number;
  }) => {
    // Use OCR image dimensions for conversion (if available)
    const refWidth = ocrImageSize?.width || pageDimensions.width;
    const refHeight = ocrImageSize?.height || pageDimensions.height;

    return {
      left: (box.x1_px / refWidth) * 100,
      top: (box.y1_px / refHeight) * 100,
      width: ((box.x2_px - box.x1_px) / refWidth) * 100,
      height: ((box.y2_px - box.y1_px) / refHeight) * 100,
    };
  };

  // Get short display label for the detection type
  const getShortLabel = (label: string) => {
    const labelMap: Record<string, string> = {
      'title': 'Title',
      'sub_title': 'Section',
      'text': 'Text',
      'image': 'Fig',
      'figure': 'Fig',
      'table': 'Table',
      'equation': 'Eq',
      'image_caption': 'Caption',
      'table_caption': 'Caption',
    };
    return labelMap[label] || label;
  };

  return (
    <>
      {/* Inject pulse animation styles */}
      <style>{pulseKeyframes}</style>
      
      <div 
        className="citation-highlight-layer absolute inset-0 pointer-events-none z-30"
        data-page={pageNumber}
      >
        <AnimatePresence mode="popLayout">
          {highlightedDetections.map(({ detection, isActive, isHovered, isFlashing }) => (
            <React.Fragment key={detection.id}>
              {detection.boxes.map((box, boxIdx) => {
                const coords = convertCoords(box);
                
                return (
                  <motion.div
                    key={`${detection.id}-box-${boxIdx}`}
                    className={cn(
                      "absolute rounded",
                      // Active state
                      isActive && "border-2 border-indigo-500 bg-indigo-500/10",
                      // Hover state
                      isHovered && !isActive && "border-2 border-amber-400 bg-amber-400/10",
                      // Pulse animation
                      isActive && !isFlashing && "animate-[citation-pulse_2s_ease-in-out_infinite]"
                    )}
                    style={{
                      left: `${coords.left}%`,
                      top: `${coords.top}%`,
                      width: `${coords.width}%`,
                      height: `${coords.height}%`,
                    }}
                    variants={highlightVariants}
                    initial="initial"
                    animate={isFlashing ? "flash" : "active"}
                    exit="exit"
                  >
                    {/* Top highlight bar */}
                    <motion.div
                      className={cn(
                        "absolute -top-0.5 left-0 right-0 h-1 rounded-t",
                        isActive ? "bg-indigo-500" : "bg-amber-400"
                      )}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      exit={{ scaleX: 0 }}
                      transition={{ duration: 0.3 }}
                    />
                    
                    {/* Citation label */}
                    {isActive && boxIdx === 0 && (
                      <motion.div
                        className={cn(
                          "absolute -top-7 left-0",
                          "flex items-center gap-1.5",
                          "px-2 py-1 rounded-md text-xs font-medium",
                          "bg-indigo-500 text-white shadow-lg",
                          "whitespace-nowrap"
                        )}
                        variants={labelVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        <span className="w-4 h-4 flex items-center justify-center bg-white/20 rounded text-[10px]">
                          {getShortLabel(detection.label)[0]}
                        </span>
                        <span className="font-mono text-[10px] opacity-80">
                          {detection.id}
                        </span>
                      </motion.div>
                    )}
                    
                    {/* Simple label on hover */}
                    {isHovered && !isActive && boxIdx === 0 && (
                      <motion.div
                        className={cn(
                          "absolute -top-6 left-0",
                          "px-1.5 py-0.5 rounded text-xs font-medium",
                          "bg-amber-400 text-amber-900 shadow-md",
                          "whitespace-nowrap"
                        )}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        {getShortLabel(detection.label)} · p{detection.pageNumber}
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </React.Fragment>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};

export default CitationHighlightLayer;

