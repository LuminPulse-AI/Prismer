/**
 * usePaperContext Hook
 * 
 * Manages paper context loading and state
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PDFSource,
  PaperContext,
  PaperLoadingState,
  createPDFSource,
  createEmptyPaperContext,
} from '@/types/paperContext';
import { getDefaultPaperContextProvider } from '../services/paperContextProvider';

export interface UsePaperContextOptions {
  /** Auto-load OCR data */
  autoLoadOCR?: boolean;
  /** OCR data base path */
  ocrBasePath?: string;
}

export interface UsePaperContextReturn {
  /** Paper context */
  context: PaperContext;
  /** Loading state */
  loadingState: PaperLoadingState;
  /** Whether OCR data is available */
  hasOCRData: boolean;
  /** Error message */
  error: string | null;
  /** Load paper */
  loadPaper: (source: PDFSource) => Promise<void>;
  /** Load from file path */
  loadFromFile: (filePath: string, arxivId?: string) => Promise<void>;
  /** Load from URL */
  loadFromUrl: (url: string, arxivId?: string) => Promise<void>;
  /** Load from ArXiv ID */
  loadFromArxiv: (arxivId: string) => Promise<void>;
  /** Reload OCR data */
  reloadOCRData: () => Promise<void>;
  /** Clear context */
  clearContext: () => void;
}

/**
 * Paper context hook
 */
export function usePaperContext(
  initialSource?: PDFSource,
  options: UsePaperContextOptions = {}
): UsePaperContextReturn {
  const { autoLoadOCR = true } = options;
  
  const [context, setContext] = useState<PaperContext>(() => 
    initialSource 
      ? createEmptyPaperContext(initialSource)
      : createEmptyPaperContext(createPDFSource.fromFile(''))
  );
  
  const [error, setError] = useState<string | null>(null);

  const provider = useMemo(() => getDefaultPaperContextProvider(), []);

  /**
   * Load paper
   */
  const loadPaper = useCallback(async (source: PDFSource) => {
    setError(null);
    setContext(prev => ({
      ...prev,
      source,
      loadingState: 'loading_pdf',
    }));

    try {
      const loadedContext = await provider.loadContext(source);
      setContext(loadedContext);
      
      if (loadedContext.error) {
        setError(loadedContext.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load paper';
      setError(errorMessage);
      setContext(prev => ({
        ...prev,
        loadingState: 'error',
        error: errorMessage,
      }));
    }
  }, [provider]);

  /**
   * Load from file path
   */
  const loadFromFile = useCallback(async (filePath: string, arxivId?: string) => {
    const source = createPDFSource.fromFile(filePath, arxivId);
    await loadPaper(source);
  }, [loadPaper]);

  /**
   * Load from URL
   */
  const loadFromUrl = useCallback(async (url: string, arxivId?: string) => {
    const source = createPDFSource.fromUrl(url, arxivId);
    await loadPaper(source);
  }, [loadPaper]);

  /**
   * Load from ArXiv ID
   */
  const loadFromArxiv = useCallback(async (arxivId: string) => {
    const source = createPDFSource.fromArxiv(arxivId);
    await loadPaper(source);
  }, [loadPaper]);

  /**
   * Reload OCR data
   */
  const reloadOCRData = useCallback(async () => {
    if (!context.source.arxivId) {
      setError('No ArXiv ID available for OCR data');
      return;
    }

    setContext(prev => ({ ...prev, loadingState: 'loading_ocr' }));

    try {
      const ocrData = await provider.loadOCRData(context.source.arxivId);
      
      if (ocrData) {
        setContext(prev => ({
          ...prev,
          metadata: ocrData.metadata,
          detections: ocrData.detections,
          markdown: ocrData.ocrResult?.markdown_content || '',
          pages: ocrData.ocrResult?.pages || [],
          hasOCRData: true,
          loadingState: 'ready',
        }));
      } else {
        setContext(prev => ({
          ...prev,
          hasOCRData: false,
          loadingState: 'ready',
        }));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load OCR data';
      setError(errorMessage);
      setContext(prev => ({
        ...prev,
        loadingState: 'error',
        error: errorMessage,
      }));
    }
  }, [context.source.arxivId, provider]);

  /**
   * Clear context
   */
  const clearContext = useCallback(() => {
    setContext(createEmptyPaperContext(createPDFSource.fromFile('')));
    setError(null);
  }, []);

  /**
   * Reload when source changes.
   * Uses arxivId or path as stable dependency values to avoid infinite loops from object reference changes.
   */
  const sourceKey = initialSource?.arxivId || initialSource?.path || '';
  
  useEffect(() => {
    if (initialSource && autoLoadOCR && sourceKey) {
      console.log('[usePaperContext] Source changed, loading paper:', sourceKey);
      loadPaper(initialSource);
    }
  }, [sourceKey, autoLoadOCR, loadPaper, initialSource]);

  return {
    context,
    loadingState: context.loadingState,
    hasOCRData: context.hasOCRData,
    error,
    loadPaper,
    loadFromFile,
    loadFromUrl,
    loadFromArxiv,
    reloadOCRData,
    clearContext,
  };
}

/**
 * Create PDFSource from pdfData prop.
 * Compatible with the existing PDFReader component interface.
 */
export function createSourceFromPdfData(pdfData: {
  source_path?: string;
  pdf_url?: string;
  arxiv_id?: string;
  sents?: unknown;
}): PDFSource {
  const arxivId = pdfData.arxiv_id;
  
  // Prefer source_path
  if (pdfData.source_path) {
    // Determine if it's a URL or file path
    if (pdfData.source_path.startsWith('http')) {
      return createPDFSource.fromUrl(pdfData.source_path, arxivId);
    }
    return createPDFSource.fromFile(pdfData.source_path, arxivId);
  }
  
  // Fallback to pdf_url
  if (pdfData.pdf_url) {
    return createPDFSource.fromUrl(pdfData.pdf_url, arxivId);
  }
  
  // If arxiv_id is available, use ArXiv source
  if (arxivId) {
    return createPDFSource.fromArxiv(arxivId);
  }
  
  // Default to empty file source
  return createPDFSource.fromFile('');
}

