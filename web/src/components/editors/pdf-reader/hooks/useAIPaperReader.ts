/**
 * useAIPaperReader Hook
 * 
 * High-level hook integrating AI features into PDF Reader.
 * Coordinates Paper Context, Agent Service, and AI Store.
 */

import { useEffect, useCallback, useState, useMemo } from 'react';
import { usePaperContext } from './usePaperContext';
import { useAIStore } from '../store/aiStore';
import { useCitationStore } from '../store/citationStore';
import {
  getDefaultPaperAgentService,
  createAgentConfigAsync,
} from '../services/paperAgentService';
import { getDefaultSourceMatchingService } from '../services/sourceMatchingService';
import {
  PaperContext,
  PaperInsight,
  InsightType,
  StreamEvent,
  SourceCitation,
  PDFSource,
} from '@/types/paperContext';

import { createEditorEventEmitter } from "@/lib/events";

const emitEvent = createEditorEventEmitter('pdf-reader');

// ============================================================
// Types
// ============================================================

export interface UseAIPaperReaderReturn {
  // Paper Context (full object for components that need it)
  paperContext: PaperContext;
  hasOCRData: boolean;
  isLoadingContext: boolean;
  contextError: string | null;
  
  // Agent
  isAgentReady: boolean;
  agentError: string | null;
  
  // Chat
  askPaper: (question: string) => Promise<void>;
  isChatLoading: boolean;
  
  // Insights
  generateInsights: (types?: InsightType[]) => Promise<void>;
  isInsightsLoading: boolean;
  
  // Source Matching
  findSourceForText: (text: string) => SourceCitation | null;
  
  // Navigation
  navigateToSource: (citation: SourceCitation) => void;
}

// ============================================================
// Hook
// ============================================================

export function useAIPaperReader(
  pdfSource: PDFSource,
  onNavigateToPage?: (pageNumber: number) => void
): UseAIPaperReaderReturn {
  const [isAgentReady, setIsAgentReady] = useState(false);
  
  // Paper Context - Note: the main PDFReader component also calls usePaperContext.
  // This call is primarily to sync context into the AI Store.
  // usePaperContext internally reloads automatically when the source changes.
  const {
    context: paperContext,
    loadingState,
    hasOCRData,
    error: contextError,
  } = usePaperContext(pdfSource, { autoLoadOCR: true });

  // AI Store
  const {
    switchToPaper,
    addChatMessage,
    setChatLoading,
    appendToStreamingMessage,
    finishStreamingMessage,
    setChatError,
    setInsights,
    setInsightsLoading,
    setInsightsError,
    highlightFromCitation,
    setAgentInitialized,
    setAgentError,
    chatLoading,
    insightsLoading,
  } = useAIStore();

  // Services
  const agentService = useMemo(() => getDefaultPaperAgentService(), []);
  const sourceMatchingService = useMemo(() => getDefaultSourceMatchingService(), []);

  // Initialize Agent
  // Note: API Key is now managed server-side; no client-side check needed.
  useEffect(() => {
    const initAgent = async () => {
      try {
        const config = await createAgentConfigAsync();
        await agentService.initialize(config);
        setIsAgentReady(true);
        setAgentInitialized(true);
        setAgentError(null);
      } catch (error) {
        console.error('Failed to initialize agent:', error);
        setAgentError(error instanceof Error ? error.message : 'Failed to initialize agent');
        setIsAgentReady(false);
      }
    };

    initAgent();
  }, [agentService, setAgentInitialized, setAgentError]);

  // Citation Store
  const {
    loadDetections,
    setMetadata,
    setActivePaper,
  } = useCitationStore();

  // Get paper ID
  const paperId = pdfSource.arxivId || pdfSource.path || 'default';

  // Immediately switch the active paper ID (without waiting for OCR to load).
  // This ensures Chat and Insights components can switch to the corresponding session/cache right away.
  useEffect(() => {
    if (paperId && paperId !== 'default') {
      console.log('[useAIPaperReader] Immediately switching active paper ID:', paperId);
      // Only switch the ID; context will be updated after OCR data loads.
      switchToPaper(paperId);
    }
  }, [paperId, switchToPaper]);

  // When OCR data finishes loading, update the full Paper Context.
  useEffect(() => {
    if (paperContext && paperId && paperContext.hasOCRData && paperContext.detections.length > 0) {
      console.log('[useAIPaperReader] Updating paper context with OCR data:', paperId, {
        hasOCRData: paperContext.hasOCRData,
        detectionsCount: paperContext.detections.length,
        markdownLength: paperContext.markdown?.length || 0,
      });
      // Update the full context (including OCR data).
      switchToPaper(paperId, paperContext);
    }
  }, [paperContext, paperId, paperContext?.hasOCRData, paperContext?.detections?.length, switchToPaper]);

  // Load detection data into Citation Store (for bidirectional indexing).
  useEffect(() => {
    if (paperContext.hasOCRData && paperContext.detections.length > 0) {
      console.log('[useAIPaperReader] Loading detections to CitationStore for paper:', paperId);
      
      // Set the active paper.
      setActivePaper(paperId);
      
      // Load detection data (with paperId).
      loadDetections(paperContext.detections, paperId);
      
      if (paperContext.metadata) {
        setMetadata(paperContext.metadata);
      }
    }
    
    // Do not reset on unmount - preserve cache for switching back.
  }, [paperContext.hasOCRData, paperContext.detections, paperContext.metadata, paperId, loadDetections, setMetadata, setActivePaper]);

  // Note: Paper loading is now handled by the internal effect in usePaperContext.
  // It automatically reloads when pdfSource.arxivId or pdfSource.path changes.

  // Send question
  const askPaper = useCallback(async (question: string) => {
    if (!isAgentReady || !paperContext.hasOCRData) {
      console.warn('Agent not ready or no OCR data');
      return;
    }

    // Add user message
    addChatMessage({
      role: 'user',
      content: question,
    });

    setChatLoading(true);

    // Add AI response placeholder
    addChatMessage({
      role: 'assistant',
      content: '',
      streaming: true,
    });

    try {
      let responseContent = '';
      await agentService.askPaper(
        question,
        paperContext,
        (event: StreamEvent) => {
          switch (event.type) {
            case 'text_delta':
              responseContent += event.data as string;
              appendToStreamingMessage(event.data as string);
              break;
            case 'text_done':
              finishStreamingMessage();
              // Emit event for demo flow (if in workspace context)
              emitEvent({
                type: 'actionComplete',
                payload: {
                  action: 'ai_chat',
                  result: { question, response: responseContent },
                },
              });
              break;
            case 'citation_found':
              highlightFromCitation(event.data as SourceCitation);
              break;
            case 'error':
              setChatError(event.data as string);
              break;
          }
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      setChatError(error instanceof Error ? error.message : 'Chat failed');
      // Emit failure event
      emitEvent({
        type: 'actionFailed',
        payload: {
          action: 'ai_chat',
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });
    } finally {
      setChatLoading(false);
    }
  }, [
    isAgentReady,
    paperContext,
    agentService,
    addChatMessage,
    setChatLoading,
    appendToStreamingMessage,
    finishStreamingMessage,
    highlightFromCitation,
    setChatError,
  ]);

  // Generate insights
  const generateInsights = useCallback(async (types?: InsightType[]) => {
    if (!isAgentReady || !paperContext.hasOCRData) {
      console.warn('Agent not ready or no OCR data');
      return;
    }

    setInsightsLoading(true);
    setInsightsError(null);

    try {
      const insights = await agentService.generateInsights(paperContext, types);
      setInsights(insights);
    } catch (error) {
      console.error('Insights generation error:', error);
      setInsightsError(error instanceof Error ? error.message : 'Failed to generate insights');
    } finally {
      setInsightsLoading(false);
    }
  }, [
    isAgentReady,
    paperContext,
    agentService,
    setInsights,
    setInsightsLoading,
    setInsightsError,
  ]);

  // Find source for text
  const findSourceForText = useCallback((text: string): SourceCitation | null => {
    if (!paperContext.hasOCRData) return null;
    return sourceMatchingService.matchTextToSource(text, paperContext);
  }, [paperContext, sourceMatchingService]);

  // Navigate to source
  const navigateToSource = useCallback((citation: SourceCitation) => {
    onNavigateToPage?.(citation.pageNumber);
    highlightFromCitation(citation);
  }, [onNavigateToPage, highlightFromCitation]);

  return {
    // Paper Context (full object)
    paperContext,
    hasOCRData: paperContext.hasOCRData,
    isLoadingContext: loadingState === 'loading_pdf' || loadingState === 'loading_ocr',
    contextError,
    
    // Agent
    isAgentReady,
    agentError: useAIStore.getState().agentError,
    
    // Chat
    askPaper,
    isChatLoading: chatLoading,
    
    // Insights
    generateInsights,
    isInsightsLoading: insightsLoading,
    
    // Source Matching
    findSourceForText,
    
    // Navigation
    navigateToSource,
  };
}

