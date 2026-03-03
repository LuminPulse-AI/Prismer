/**
 * Citation Navigator
 *
 * Handles cross-paper citation navigation logic
 */

import { Citation, CitationValidationResult } from '../types/citation';
import { PDFSource } from '@/types/paperContext';

// ============================================================
// Type Definitions
// ============================================================

/**
 * Navigation target
 */
export interface NavigationTarget {
  paperId: string;
  detectionId: string;
  pageNumber: number;
}

/**
 * Navigation result
 */
export interface NavigationResult {
  success: boolean;
  action: 'switched' | 'scrolled' | 'opened' | 'failed';
  message?: string;
}

/**
 * Document state checker interface
 * Implemented by external stores
 */
export interface DocumentStateChecker {
  /** Check if a paper is open */
  isDocumentOpen(paperId: string): boolean;

  /** Get the current active document ID */
  getActiveDocumentId(): string | null;

  /** Switch to a specific document */
  switchToDocument(paperId: string): void;

  /** Open a new document */
  openDocument(source: PDFSource): string;

  /** Get paper title */
  getPaperTitle(paperId: string): string | undefined;
}

/**
 * PDF scroll controller interface
 * Implemented by external citation store
 */
export interface PDFScrollController {
  /** Scroll to a specific detection */
  scrollToDetection(detectionId: string, paperId?: string): void;

  /** Highlight a specific detection */
  highlightDetection(detectionId: string, paperId?: string): void;

  /** Check if a detection exists */
  hasDetection(detectionId: string, paperId?: string): boolean;
}

// ============================================================
// CitationNavigator Class
// ============================================================

export class CitationNavigator {
  private documentChecker: DocumentStateChecker | null = null;
  private scrollController: PDFScrollController | null = null;
  
  /**
   * Register document state checker
   */
  registerDocumentChecker(checker: DocumentStateChecker): void {
    this.documentChecker = checker;
  }
  
  /**
   * Register scroll controller
   */
  registerScrollController(controller: PDFScrollController): void {
    this.scrollController = controller;
  }
  
  /**
   * Navigate to citation location
   *
   * @param citation - Target citation
   * @returns Navigation result
   */
  async navigate(citation: Citation): Promise<NavigationResult> {
    if (!this.documentChecker || !this.scrollController) {
      return {
        success: false,
        action: 'failed',
        message: 'Navigator not properly initialized',
      };
    }
    
    const { paperId, detectionId, pageNumber } = citation;
    const currentActiveId = this.documentChecker.getActiveDocumentId();
    
    // Case 1: Target paper is the current active document
    if (currentActiveId === paperId) {
      return this.scrollToTarget(detectionId, paperId);
    }
    
    // Case 2: Target paper is open but not currently active
    if (this.documentChecker.isDocumentOpen(paperId)) {
      this.documentChecker.switchToDocument(paperId);
      
      // Wait for document switch to complete, then scroll
      await this.waitForDocumentSwitch(paperId);
      return this.scrollToTarget(detectionId, paperId);
    }
    
    // Case 3: Target paper is not open, needs to be loaded
    return this.openAndNavigate(paperId, detectionId, pageNumber);
  }
  
  /**
   * Check if navigation to target is possible
   */
  canNavigate(citation: Citation): boolean {
    if (!this.documentChecker) return false;
    
    // Open documents can be navigated to
    if (this.documentChecker.isDocumentOpen(citation.paperId)) {
      return true;
    }
    
    // Unopened documents can also be attempted
    return true;
  }
  
  /**
   * Validate citation
   */
  validateCitation(
    citation: Citation,
    availableDetections?: Map<string, Set<string>>
  ): CitationValidationResult {
    // If no detection data provided, assume valid
    if (!availableDetections) {
      return { valid: true };
    }
    
    const paperDetections = availableDetections.get(citation.paperId);
    
    if (!paperDetections) {
      return {
        valid: false,
        error: 'unknown_paper',
        suggestion: `Paper ${citation.paperId} is not loaded`,
      };
    }
    
    if (!paperDetections.has(citation.detectionId)) {
      return {
        valid: false,
        error: 'unknown_detection',
        suggestion: `Detection ${citation.detectionId} does not exist`,
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Preload paper (for optimizing navigation experience)
   */
  async preloadPaper(paperId: string): Promise<void> {
    if (!this.documentChecker) return;
    
    if (this.documentChecker.isDocumentOpen(paperId)) {
      return; // Already loaded
    }
    
    // Preloading logic can be implemented here
    // e.g., prefetch PDF metadata, preload detection data, etc.
    console.log(`[CitationNavigator] Preloading paper: ${paperId}`);
  }
  
  // ============================================================
  // Private Methods
  // ============================================================
  
  private scrollToTarget(detectionId: string, paperId: string): NavigationResult {
    if (!this.scrollController) {
      return {
        success: false,
        action: 'failed',
        message: 'Scroll controller not available',
      };
    }
    
    try {
      this.scrollController.scrollToDetection(detectionId, paperId);
      this.scrollController.highlightDetection(detectionId, paperId);
      
      return {
        success: true,
        action: 'scrolled',
      };
    } catch (error) {
      return {
        success: false,
        action: 'failed',
        message: error instanceof Error ? error.message : 'Scroll failed',
      };
    }
  }
  
  private async openAndNavigate(
    paperId: string,
    detectionId: string,
    pageNumber: number
  ): Promise<NavigationResult> {
    if (!this.documentChecker) {
      return {
        success: false,
        action: 'failed',
        message: 'Document checker not available',
      };
    }
    
    try {
      // Build PDF source
      const source: PDFSource = {
        type: 'arxiv',
        arxivId: paperId,
        path: `/api/ocr/${paperId}/pdf`,
      };
      
      // Open document
      const newDocId = this.documentChecker.openDocument(source);
      
      // Wait for document to load
      await this.waitForDocumentLoad(paperId);
      
      // Scroll to target
      return this.scrollToTarget(detectionId, paperId);
      
    } catch (error) {
      return {
        success: false,
        action: 'failed',
        message: error instanceof Error ? error.message : 'Failed to open document',
      };
    }
  }
  
  private waitForDocumentSwitch(paperId: string): Promise<void> {
    return new Promise(resolve => {
      // Simple delay to wait for React state update
      setTimeout(resolve, 100);
    });
  }
  
  private waitForDocumentLoad(paperId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Poll to check if document has finished loading
      let attempts = 0;
      const maxAttempts = 50; // Wait up to 5 seconds
      
      const checkInterval = setInterval(() => {
        attempts++;
        
        if (this.scrollController?.hasDetection('p1_text_0', paperId)) {
          clearInterval(checkInterval);
          resolve();
          return;
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          // Continue even if timed out
          resolve();
        }
      }, 100);
    });
  }
}

// ============================================================
// Convenience Navigation Functions
// ============================================================

/**
 * Emit navigation to a specific detection
 * Triggers a CustomEvent listened to by PDFRenderer
 */
export function emitScrollToDetection(detectionId: string, paperId?: string): void {
  const event = new CustomEvent('pdf-scroll-to-detection', {
    detail: { detectionId, paperId },
  });
  window.dispatchEvent(event);
}

/**
 * Emit navigation to a specific page
 */
export function emitScrollToPage(pageNumber: number, paperId?: string): void {
  const event = new CustomEvent('pdf-scroll-to-page', {
    detail: { pageNumber, paperId },
  });
  window.dispatchEvent(event);
}

// ============================================================
// Singleton Export
// ============================================================

export const citationNavigator = new CitationNavigator();
