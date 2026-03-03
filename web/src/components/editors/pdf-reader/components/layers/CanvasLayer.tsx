'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { Page } from 'react-pdf';

interface CanvasLayerProps {
  pageNumber: number;
  scale: number;
  rotation: number;
  onLoadSuccess?: (info: { width: number; height: number }) => void;
  className?: string;
}

export const CanvasLayer: React.FC<CanvasLayerProps> = ({
  pageNumber,
  scale,
  rotation,
  onLoadSuccess,
  className = '',
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle page load success
  const handleLoadSuccess = useCallback((page: any) => {
    const { width, height } = page;
    onLoadSuccess?.({ width, height });
  }, [onLoadSuccess]);

  // Performance optimization: use offscreen rendering
  useEffect(() => {
    if (canvasRef.current) {
      // Set CSS properties for hardware acceleration
      canvasRef.current.style.setProperty('will-change', 'transform');
      canvasRef.current.style.setProperty('transform-style', 'preserve-3d');
    }
  }, []);

  return (
    <div 
      ref={canvasRef}
      className={`canvas-layer relative ${className}`}
      data-layer="canvas"
    >
      <Page
        pageNumber={pageNumber}
        scale={scale}
        rotate={rotation}
        onLoadSuccess={handleLoadSuccess}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        className="pdf-canvas"
        // Performance optimization config
        loading={
          <div className="flex items-center justify-center w-full h-96 bg-gray-50">
            <div className="w-6 h-6 border-2 border-[var(--main-color)] border-t-transparent rounded-full animate-spin"></div>
          </div>
        }
        error={
          <div className="flex items-center justify-center w-full h-96 bg-red-50">
            <p className="text-red-500 text-sm">Failed to render page</p>
          </div>
        }
      />
    </div>
  );
}; 