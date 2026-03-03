import React from 'react';

interface SearchResult {
  pageNumber: number;
  textContent: string;
  position: { x: number; y: number; width: number; height: number };
  matchIndex: number;
}

interface SearchHighlightProps {
  searchResults: SearchResult[];
  currentResultIndex: number;
  pageNumber: number;
  scale: number;
  pageWidth: number;
  pageHeight: number;
}

export const SearchHighlight: React.FC<SearchHighlightProps> = ({
  searchResults,
  currentResultIndex,
  pageNumber,
  scale,
  pageWidth,
  pageHeight
}) => {
  // Filter search results for the current page
  const currentPageResults = searchResults.filter(result => result.pageNumber === pageNumber);
  
  if (currentPageResults.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      {currentPageResults.map((result, index) => {
        const isCurrentResult = searchResults.indexOf(result) === currentResultIndex;
        
        // Convert PDF coordinates to page coordinates
        // PDF.js coordinate system origin is at the bottom-left, needs conversion to page coordinates (origin at top-left)
        // result.position coordinates are PDF's original coordinates (based on PDF units)
        // Need to apply scale and convert the coordinate system
        const x = result.position.x * scale;
        const y = (pageHeight - result.position.y - result.position.height) * scale;
        const width = Math.max(result.position.width * scale, 10); // Minimum width to ensure visibility
        const height = Math.max(result.position.height * scale, 15); // Minimum height to ensure visibility

        return (
          <div
            key={`search-${result.matchIndex}-${index}`}
            className={`absolute rounded-sm transition-all duration-200 ${
              isCurrentResult
                ? 'bg-orange-400/60 ring-2 ring-orange-500 ring-offset-1'
                : 'bg-yellow-300/50'
            }`}
            style={{
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
              // Ensure highlight displays above text
              zIndex: 10
            }}
            title={`Search result: ${result.textContent}`}
          />
        );
      })}
    </div>
  );
}; 