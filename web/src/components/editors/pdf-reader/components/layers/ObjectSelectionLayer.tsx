/**
 * Object Selection Layer
 * 
 * Displays and interacts with PDF objects (images, tables, equations, etc.)
 * Data sourced from OCR detection results
 */

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  Image as ImageIcon, 
  Table2, 
  FunctionSquare, 
  Sparkles,
  ZoomIn,
  Copy,
  BookmarkPlus,
  X,
} from 'lucide-react';
import { useAIStore } from '../../store/aiStore';
import { PageDetection, Detection } from '@/types/paperContext';

// ============================================================
// Types
// ============================================================

interface ObjectSelectionLayerProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  detections: PageDetection | null;
  /** OCR image width (for coordinate conversion) */
  ocrImageWidth?: number;
  /** OCR image height (for coordinate conversion) */
  ocrImageHeight?: number;
  isEnabled: boolean;
  onObjectClick?: (detection: Detection, position: { x: number; y: number }) => void;
  onExplainObject?: (detection: Detection) => void;
  className?: string;
  /** Paper ID for constructing image paths */
  paperId?: string;
  /** All page detections for calculating image indices */
  allDetections?: PageDetection[];
}

interface ObjectOverlayProps {
  detection: Detection;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  /** OCR image width */
  ocrImageWidth?: number;
  /** OCR image height */
  ocrImageHeight?: number;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (hovered: boolean) => void;
  onClick: (position: { x: number; y: number }) => void;
  onExplain: () => void;
  onExtract: () => void;
  onZoom: () => void;
}

// ============================================================
// Constants
// ============================================================

// Interactive object types (based on DetectionLabel) - includes all possible visual object types
const OBJECT_LABELS = [
  'image', 
  'table', 
  'equation', 
  'figure', 
  'chart', 
  'diagram'
] as const;

const LABEL_CONFIG: Record<string, {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  extractType: 'figure' | 'table' | 'equation' | 'highlight';
}> = {
  image: {
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50/80',
    borderColor: 'border-emerald-400',
    label: 'Image',
    extractType: 'figure',
  },
  figure: {
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50/80',
    borderColor: 'border-emerald-400',
    label: 'Figure',
    extractType: 'figure',
  },
  chart: {
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50/80',
    borderColor: 'border-teal-400',
    label: 'Chart',
    extractType: 'figure',
  },
  diagram: {
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50/80',
    borderColor: 'border-cyan-400',
    label: 'Diagram',
    extractType: 'figure',
  },
  table: {
    icon: <Table2 className="w-4 h-4" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50/80',
    borderColor: 'border-blue-400',
    label: 'Table',
    extractType: 'table',
  },
  equation: {
    icon: <FunctionSquare className="w-4 h-4" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50/80',
    borderColor: 'border-amber-400',
    label: 'Equation',
    extractType: 'equation',
  },
  // Fallback for other types
  default: {
    icon: <ImageIcon className="w-4 h-4" />,
    color: 'text-stone-600',
    bgColor: 'bg-stone-50/80',
    borderColor: 'border-stone-400',
    label: 'Object',
    extractType: 'highlight',
  },
};

// ============================================================
// Object Overlay Component
// ============================================================

const ObjectOverlay: React.FC<ObjectOverlayProps> = ({
  detection,
  pageNumber,
  pageWidth,
  pageHeight,
  scale,
  ocrImageWidth,
  ocrImageHeight,
  isHovered,
  isSelected,
  onHover,
  onClick,
  onExplain,
  onExtract,
  onZoom,
}) => {
  const box = detection.boxes[0];
  if (!box) return null;

  const config = LABEL_CONFIG[detection.label] || LABEL_CONFIG.image;
  
  // OCR pixel coordinates -> PDF page coordinates -> screen coordinates
  // OCR image dimensions (e.g., 1224x1584 at 144 DPI) -> PDF page dimensions (e.g., 612x792 at 72 DPI)
  const ocrWidth = ocrImageWidth || 1224; // Default value
  const ocrHeight = ocrImageHeight || 1584;
  
  // Conversion ratio: convert OCR pixel coordinates to PDF page coordinates
  const scaleX = pageWidth / ocrWidth;
  const scaleY = pageHeight / ocrHeight;
  
  // Use OCR pixel coordinates, convert to PDF page coordinates, then multiply by render scale
  const ocrX1 = box.x1_px ?? box.x1;
  const ocrY1 = box.y1_px ?? box.y1;
  const ocrX2 = box.x2_px ?? box.x2;
  const ocrY2 = box.y2_px ?? box.y2;
  
  const left = ocrX1 * scaleX * scale;
  const top = ocrY1 * scaleY * scale;
  const width = (ocrX2 - ocrX1) * scaleX * scale;
  const height = (ocrY2 - ocrY1) * scaleY * scale;
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClick({ x: e.clientX, y: e.clientY });
  }, [onClick]);

  const handleExplain = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onExplain();
  }, [onExplain]);

  // Get a very light fill color (only for isSelected state)
  const getLightBgColor = () => {
    switch (detection.label) {
      case 'image': return 'rgba(16, 185, 129, 0.08)'; // emerald
      case 'table': return 'rgba(59, 130, 246, 0.08)'; // blue
      case 'equation': return 'rgba(245, 158, 11, 0.08)'; // amber
      default: return 'rgba(120, 113, 108, 0.08)'; // stone
    }
  };

  return (
    <div
      className={cn(
        'absolute transition-all duration-200 cursor-pointer pointer-events-auto',
        'border-2 rounded-sm',
        // hover: dashed border, no fill
        // selected: solid border + very light fill
        isSelected
          ? config.borderColor
          : isHovered
            ? `border-dashed ${config.borderColor}`
            : 'border-dashed border-indigo-400/60 hover:border-indigo-500/80',
      )}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        // Only apply fill when selected
        backgroundColor: isSelected ? getLightBgColor() : 'transparent',
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => {
        // If selected, don't clear hover state on mouse leave (keep action panel visible)
        if (!isSelected) {
          onHover(false);
        }
      }}
      onClick={handleClick}
      data-object-id={`${detection.label}-${detection.boxes[0]?.x1}-${detection.boxes[0]?.y1}`}
      data-object-overlay="true"
    >
      {/* Label Badge - shown on hover or selected */}
      {(isHovered || isSelected) && (
        <div
          className={cn(
            'absolute -top-7 left-0',
            'flex items-center gap-1.5 px-2 py-1 rounded-t-md',
            'text-xs font-medium whitespace-nowrap',
            'bg-white/95 backdrop-blur-sm',
            config.color, 'border', config.borderColor,
            'shadow-sm'
          )}
        >
          {config.icon}
          <span>{config.label}</span>
        </div>
      )}

      {/* Action Buttons - only shown when selected, disappear when clicking elsewhere */}
      {isSelected && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-stone-200 z-[100]">
          <button
            onClick={handleExplain}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md',
              'text-xs font-medium',
              'bg-indigo-600 text-white',
              'hover:bg-indigo-700 transition-colors'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Explain
          </button>
          {/* Zoom button - only for image types, not shown for equations/tables */}
          {['image', 'figure', 'chart', 'diagram'].includes(detection.label) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onZoom();
              }}
              className={cn(
                'p-1.5 rounded-md',
                'bg-stone-100 border border-stone-200',
                'hover:bg-stone-200 transition-colors'
              )}
              title="Zoom"
            >
              <ZoomIn className="w-4 h-4 text-stone-600" />
            </button>
          )}
          {/* Add to Notes button - currently disabled, shown as grayed out */}
          <button
            disabled
            className={cn(
              'p-1.5 rounded-md',
              'bg-stone-50 border border-stone-100',
              'cursor-not-allowed opacity-50'
            )}
            title="Add to notes (coming soon)"
          >
            <BookmarkPlus className="w-4 h-4 text-stone-400" />
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export const ObjectSelectionLayer: React.FC<ObjectSelectionLayerProps> = ({
  pageNumber,
  pageWidth,
  pageHeight,
  scale,
  detections,
  ocrImageWidth,
  ocrImageHeight,
  isEnabled,
  onObjectClick,
  onExplainObject,
  className,
  paperId,
  allDetections = [],
}) => {
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  
  const { setRightPanelTab, setPendingQuestion, addExtract } = useAIStore();

  // Global click listener - clear selection when clicking elsewhere
  useEffect(() => {
    if (!selectedObjectId) return;
    
    const handleGlobalClick = (e: MouseEvent) => {
      // Check if click target is within the current layer
      const target = e.target as HTMLElement;
      const isInObjectLayer = target.closest('[data-object-selection-layer]');
      const isInObjectOverlay = target.closest('[data-object-overlay]');
      
      // If click is not within an object overlay, clear selection
      if (!isInObjectOverlay) {
        setSelectedObjectId(null);
      }
    };
    
    // Use capture phase to ensure we catch the event
    document.addEventListener('mousedown', handleGlobalClick, true);
    
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick, true);
    };
  }, [selectedObjectId]);

  // Filter objects for the current page (images, tables, etc.)
  const objectDetections = useMemo(() => {
    if (!detections || detections.page_number !== pageNumber) {
      return [];
    }
    
    // Filter for interactive object types
    return detections.detections.filter(d => 
      OBJECT_LABELS.some(label => d.label === label)
    );
  }, [detections, pageNumber]);

  const getObjectId = useCallback((detection: Detection) => {
    const box = detection.boxes[0];
    return `${detection.label}-${box?.x1}-${box?.y1}`;
  }, []);

  const handleObjectHover = useCallback((detection: Detection, hovered: boolean) => {
    setHoveredObjectId(hovered ? getObjectId(detection) : null);
  }, [getObjectId]);

  const handleObjectClick = useCallback((detection: Detection, position: { x: number; y: number }) => {
    const objectId = getObjectId(detection);
    // If clicking an already-selected object, deselect it; otherwise select the new object
    if (selectedObjectId === objectId) {
      setSelectedObjectId(null);
    } else {
      setSelectedObjectId(objectId);
    }
    onObjectClick?.(detection, position);
  }, [getObjectId, selectedObjectId, onObjectClick]);

  // Deselect when clicking on empty area of the container
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only deselect when clicking on the container itself
    if (e.target === e.currentTarget) {
      setSelectedObjectId(null);
    }
  }, []);

  // Build image URL - directly using detection.id
  const buildImageUrl = useCallback((detection: Detection): string => {
    if (!paperId) return '';
    
    // Use API route to fetch images, format: /api/ocr/{arxivId}/images/{detection.id}.jpg
    // detection.id format example: "p1_image_0"
    if (detection.id) {
      return `/api/ocr/${paperId}/images/${detection.id}.jpg`;
    }
    
    // Fallback: try to get from metadata
    if (detection.metadata?.image_path) {
      return `/api/ocr/${paperId}/${detection.metadata.image_path}`;
    }
    
    return '';
  }, [paperId]);

  const handleExplainObject = useCallback((detection: Detection) => {
    // Generate explanation request
    const labelName = LABEL_CONFIG[detection.label]?.label || detection.label;
    const question = `Please explain this ${labelName.toLowerCase()} on page ${pageNumber}. What does it show and why is it important to the paper?`;
    
    // Set the pending question and switch to the chat panel
    // AskPaperChat listens for pendingQuestion and sends it automatically
    setPendingQuestion(question);
    setRightPanelTab('chat');
    
    onExplainObject?.(detection);
  }, [pageNumber, setPendingQuestion, setRightPanelTab, onExplainObject]);

  // Zoom in on an object (image/table)
  const handleZoomObject = useCallback((detection: Detection) => {
    // For image types, display the zoomed view
    if (['image', 'figure', 'chart', 'diagram'].includes(detection.label)) {
      const imageUrl = buildImageUrl(detection);
      if (imageUrl) {
        setZoomedImageUrl(imageUrl);
      }
    }
    // TODO: For tables/equations, consider showing a more detailed preview
  }, [buildImageUrl]);

  // Extract object to Notes
  const handleExtractObject = useCallback((detection: Detection) => {
    const config = LABEL_CONFIG[detection.label] || LABEL_CONFIG.default;
    const labelName = config.label;
    const extractType = config.extractType;
    const box = detection.boxes[0];
    
    // Use raw_text or metadata information
    const rawText = detection.raw_text || '';
    
    // Create content in different formats based on type
    let content = '';
    
    switch (extractType) {
      case 'table':
        // Table: use raw text or markdown format
        content = rawText || `[Table from Page ${pageNumber}]`;
        break;
      case 'equation':
        // Equation: use LaTeX format
        content = rawText || `[Equation from Page ${pageNumber}]`;
        break;
      case 'figure':
        // Figure: build the actual image path
        const imagePath = buildImageUrl(detection);
        // Use markdown image format
        content = imagePath 
          ? `![${labelName} from Page ${pageNumber}](${imagePath})`
          : `[${labelName} from Page ${pageNumber}]`;
        break;
      default:
        content = rawText || `[${labelName} from Page ${pageNumber}]`;
    }
    
    // Add to extracts
    addExtract({
      type: extractType,
      content: content,
      source: {
        id: `object-${Date.now()}`,
        text: `${labelName} on page ${pageNumber}`,
        pageNumber: pageNumber,
        confidence: 1.0,
      },
      tags: [detection.label],
    });
    
    // Switch to the Notes panel
    setRightPanelTab('notes');
    
    // Clear selection state
    setSelectedObjectId(null);
  }, [pageNumber, addExtract, setRightPanelTab, buildImageUrl]);

  if (!isEnabled || objectDetections.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          'absolute inset-0 pointer-events-none',
          className
        )}
        style={{
          width: pageWidth * scale,
          height: pageHeight * scale,
          zIndex: 40, // Ensure above PDF content, higher than textLayer (z-index: 2)
        }}
        onClick={handleContainerClick}
      >
        {objectDetections.map((detection, index) => {
          const objectId = getObjectId(detection);
          return (
            <ObjectOverlay
              key={`${objectId}-${index}`}
              detection={detection}
              pageNumber={pageNumber}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              scale={scale}
              ocrImageWidth={ocrImageWidth}
              ocrImageHeight={ocrImageHeight}
              isHovered={hoveredObjectId === objectId}
              isSelected={selectedObjectId === objectId}
              onHover={(hovered) => handleObjectHover(detection, hovered)}
              onClick={(pos) => handleObjectClick(detection, pos)}
              onExplain={() => handleExplainObject(detection)}
              onExtract={() => handleExtractObject(detection)}
              onZoom={() => handleZoomObject(detection)}
            />
          );
        })}
      </div>

      {/* Image zoom preview modal */}
      {zoomedImageUrl && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] pointer-events-auto"
          onClick={() => setZoomedImageUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={() => setZoomedImageUrl(null)}
              className="absolute -top-10 right-0 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
            <img
              src={zoomedImageUrl}
              alt="Zoomed view"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default ObjectSelectionLayer;

