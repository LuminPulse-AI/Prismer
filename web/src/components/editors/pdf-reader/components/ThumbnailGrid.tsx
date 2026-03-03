"use client";

import React, { useState, useEffect } from "react";
import { pdfjs } from "react-pdf";
import { cn } from "@/lib/utils";

interface ThumbnailGridProps {
  file: string;
  numPages: number;
  currentPage: number;
  onPageChange: (pageNumber: number) => void;
}

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
  file,
  numPages,
  currentPage,
  onPageChange,
}) => {
  const [thumbnails, setThumbnails] = useState<{ [key: number]: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const generateThumbnails = async () => {
      try {
        setLoading(true);
        const pdf = await pdfjs.getDocument(file).promise;
        const thumbnailPromises: Promise<string | null>[] = [];

        for (let i = 1; i <= numPages; i++) {
          thumbnailPromises.push(generateThumbnail(pdf, i));
        }

        const results = await Promise.all(thumbnailPromises);
        const thumbnailMap: { [key: number]: string } = {};
        results.forEach((result, index) => {
          if (result) {
            thumbnailMap[index + 1] = result;
          }
        });

        setThumbnails(thumbnailMap);
      } catch (error) {
        console.error("Failed to generate thumbnails:", error);
      } finally {
        setLoading(false);
      }
    };

    const generateThumbnail = async (pdf: any, pageNumber: number) => {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 0.5 }); // Smaller scale for thumbnails
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        return canvas.toDataURL();
      } catch (error) {
        console.error(`Failed to generate thumbnail for page ${pageNumber}:`, error);
        return null;
      }
    };

    if (file && numPages > 0) {
      generateThumbnails();
    }
  }, [file, numPages]);

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(new Array(numPages), (_, index) => {
        const pageNum = index + 1;
        const thumbnailUrl = thumbnails[pageNum];
        
        return (
          <div
            key={`thumbnail-${pageNum}`}
            className={cn(
              "cursor-pointer hover:bg-[var(--bg-box-nor)] rounded-lg p-2 transition-colors",
              currentPage === pageNum && "bg-[var(--main-color)]/10"
            )}
            onClick={() => onPageChange(pageNum)}
          >
            <div className="flex justify-center overflow-hidden">
              <div className="max-w-full">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={`Page ${pageNum}`}
                    className="border rounded-lg shadow-sm w-full h-auto object-contain max-w-[240px]"
                    style={{ maxHeight: '320px' }}
                  />
                ) : (
                  <div className="border rounded-lg shadow-sm w-[240px] h-[320px] bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400">Loading...</span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-center text-sm mt-2 text-[var(--text-2)]">
              Page {pageNum}
            </p>
          </div>
        );
      })}
    </div>
  );
};
