import { useState, useCallback, useEffect, useRef } from "react";
import { pdfjs } from "react-pdf";

interface SearchResult {
  pageNumber: number;
  textContent: string;
  position: { x: number; y: number; width: number; height: number };
  matchIndex: number;
}

interface PDFSearchParams {
  pdfUrl: string;
  currentPageNumber: number;
  onPageChange: (page: number) => void;
}

export const usePDFSearch = ({
  pdfUrl,
  onPageChange,
}: PDFSearchParams) => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const pdfDocumentRef = useRef<any>(null);
  const pageTextCacheRef = useRef<Map<number, any>>(new Map());

  // Load PDF document
  useEffect(() => {
    const loadPDFDocument = async () => {
      try {
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        pdfDocumentRef.current = pdf;
      } catch (error) {
        console.error("Error loading PDF for search:", error);
      }
    };

    if (pdfUrl) {
      loadPDFDocument();
    }
  }, [pdfUrl]);

  // Get page text content
  const getPageTextContent = useCallback(async (pageNumber: number) => {
    if (!pdfDocumentRef.current) return null;

    // Check cache
    if (pageTextCacheRef.current.has(pageNumber)) {
      return pageTextCacheRef.current.get(pageNumber);
    }

    try {
      const page = await pdfDocumentRef.current.getPage(pageNumber);
      const textContent = await page.getTextContent({
        disableCombineTextItems: true,
        includeMarkup: false,
      });

      // Cache text content
      pageTextCacheRef.current.set(pageNumber, textContent);
      return textContent;
    } catch (error) {
      console.error(
        `Error getting text content for page ${pageNumber}:`,
        error
      );
      return null;
    }
  }, []);

  // Search for text within a page
  const searchInPage = useCallback(
    async (pageNumber: number, query: string): Promise<SearchResult[]> => {
      const textContent = await getPageTextContent(pageNumber);
      if (!textContent || !query.trim()) return [];

      const results: SearchResult[] = [];
      const queryLower = query.toLowerCase();

      // Combine all text items into a full string while recording position info
      let fullText = "";
      const textItems: Array<{
        str: string;
        transform: number[];
        width: number;
        height: number;
      }> = [];

      textContent.items.forEach((item: any) => {
        if (item.str) {
          textItems.push({
            str: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height,
          });
          fullText += item.str + " ";
        }
      });

      const fullTextLower = fullText.toLowerCase();
      let searchIndex = 0;
      let matchIndex = 0;

      while (true) {
        const foundIndex = fullTextLower.indexOf(queryLower, searchIndex);
        if (foundIndex === -1) break;

        // Calculate the position of the matched text in the original text
        let charCount = 0;
        let matchStartItem = -1;
        let matchEndItem = -1;

        // Find the text item where the match starts
        for (let i = 0; i < textItems.length; i++) {
          const nextCharCount = charCount + textItems[i].str.length + 1; // +1 for space
          if (charCount <= foundIndex && foundIndex < nextCharCount) {
            matchStartItem = i;
            break;
          }
          charCount = nextCharCount;
        }

        // Find the text item where the match ends
        charCount = 0;
        for (let i = 0; i < textItems.length; i++) {
          const nextCharCount = charCount + textItems[i].str.length + 1;
          if (
            charCount <= foundIndex + query.length &&
            foundIndex + query.length <= nextCharCount
          ) {
            matchEndItem = i;
            break;
          }
          charCount = nextCharCount;
        }

        if (matchStartItem !== -1) {
          const startItem = textItems[matchStartItem];
          const endItem = textItems[matchEndItem] || startItem;

          // Calculate position (based on PDF coordinate system)
          const x = startItem.transform[4];
          const y = startItem.transform[5];
          const width = endItem.transform[4] + endItem.width - x;
          const height = Math.max(startItem.height, endItem.height);

          results.push({
            pageNumber,
            textContent: query,
            position: { x, y, width, height },
            matchIndex,
          });

          matchIndex++;
        }

        searchIndex = foundIndex + 1;
      }

      return results;
    },
    [getPageTextContent]
  );

  // Search the entire PDF
  const searchPDF = useCallback(
    async (query: string) => {
      if (!pdfDocumentRef.current || !query.trim()) {
        setSearchResults([]);
        setCurrentResultIndex(0);
        return;
      }

      setIsSearching(true);
      const allResults: SearchResult[] = [];

      try {
        const numPages = pdfDocumentRef.current.numPages;

        // Search all pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageResults = await searchInPage(pageNum, query);
          allResults.push(...pageResults);
        }

        setSearchResults(allResults);
        setCurrentResultIndex(0);

        // If there are results, navigate to the first one
        if (allResults.length > 0) {
          onPageChange(allResults[0].pageNumber);
        }
      } catch (error) {
        console.error("Error searching PDF:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [searchInPage, onPageChange]
  );

  // Navigate to search result
  const navigateResult = useCallback(
    (direction: "prev" | "next") => {
      if (searchResults.length === 0) return;

      let newIndex = currentResultIndex;
      if (direction === "next") {
        newIndex = (currentResultIndex + 1) % searchResults.length;
      } else {
        newIndex =
          currentResultIndex === 0
            ? searchResults.length - 1
            : currentResultIndex - 1;
      }

      setCurrentResultIndex(newIndex);
      const result = searchResults[newIndex];
      if (result) {
        onPageChange(result.pageNumber);
      }
    },
    [searchResults, currentResultIndex, onPageChange]
  );

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setCurrentResultIndex(0);
  }, []);

  // Toggle search bar visibility
  const toggleSearchVisibility = useCallback(() => {
    setIsSearchVisible((prev) => !prev);
    if (isSearchVisible) {
      clearSearch();
    }
  }, [isSearchVisible, clearSearch]);

  // Handle search shortcuts
  const handleSearchShortcut = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+F opens search
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setIsSearchVisible(true);
        return;
      }

      // Only process navigation shortcuts when the search bar is visible and has results
      if (!isSearchVisible || searchResults.length === 0) return;

      // [ or < previous result
      if (e.key === "[" || e.key === "<") {
        e.preventDefault();
        navigateResult("prev");
      }
      // ] or > next result
      else if (e.key === "]" || e.key === ">") {
        e.preventDefault();
        navigateResult("next");
      }
      // Escape closes search
      else if (e.key === "Escape") {
        e.preventDefault();
        setIsSearchVisible(false);
        clearSearch();
      }
    },
    [isSearchVisible, searchResults.length, navigateResult, clearSearch]
  );

  // Add keyboard event listener
  useEffect(() => {
    window.addEventListener("keydown", handleSearchShortcut);
    return () => {
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, [handleSearchShortcut]);

  return {
    searchResults,
    currentResultIndex,
    isSearchVisible,
    isSearching,
    searchPDF,
    navigateResult,
    clearSearch,
    toggleSearchVisibility,
    getCurrentSearchResult: () => searchResults[currentResultIndex] || null,
  };
};
