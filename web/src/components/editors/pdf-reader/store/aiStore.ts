/**
 * AI Store
 * 
 * Manages AI-related state: insights, conversations, extractions, etc.
 * Supports multi-document: each document has an independent cache
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  PaperContext,
  PaperInsight,
  ChatMessage,
  Extract,
  SourceCitation,
  InsightType,
  BoundingBox,
} from '@/types/paperContext';

// ============================================================
// Types
// ============================================================

/**
 * Active highlight - used to display citation locations in the PDF
 */
export interface ActiveHighlight {
  id: string;
  pageNumber: number;
  bbox: BoundingBox;
  color?: string;
  source: 'citation' | 'insight' | 'chat' | 'user';
}

/**
 * AI data cache for a single paper
 */
interface PaperAIData {
  insights: PaperInsight[];
  chatMessages: ChatMessage[];
  extracts: Extract[];
}

/**
 * AI Store state
 */
interface AIState {
  // Current active paper ID
  activePaperId: string | null;

  // Multi-document cache: paperId -> PaperAIData
  paperDataCache: Map<string, PaperAIData>;

  // Paper Context (current document)
  paperContext: PaperContext | null;

  // Insights (current document)
  insights: PaperInsight[];
  insightsLoading: boolean;
  insightsError: string | null;

  // Conversation (current document)
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  streamingMessage: string;

  // Extractions/annotations (current document)
  extracts: Extract[];

  // Active highlights
  activeHighlights: ActiveHighlight[];

  // Chat reference context - passed from selected text to Chat
  chatReference: {
    text: string;
    pageNumber?: number;
  } | null;
  
  // Pending question - triggered from other components for auto-send
  pendingQuestion: string | null;

  // Right panel state
  rightPanelActiveTab: 'insights' | 'chat' | 'notes';
  rightPanelExpanded: boolean;

  // Agent state
  agentInitialized: boolean;
  agentError: string | null;
}

/**
 * AI Store actions
 */
interface AIActions {
  // Multi-document management
  setActivePaper: (paperId: string) => void;
  switchToPaper: (paperId: string, context?: PaperContext) => void;
  savePaperDataToCache: (paperId: string) => void;
  loadPaperDataFromCache: (paperId: string) => void;
  
  // Paper Context
  setPaperContext: (context: PaperContext | null, paperId?: string) => void;
  
  // Insight actions
  setInsights: (insights: PaperInsight[]) => void;
  addInsight: (insight: PaperInsight) => void;
  updateInsight: (id: string, updates: Partial<PaperInsight>) => void;
  removeInsight: (id: string) => void;
  setInsightsLoading: (loading: boolean) => void;
  setInsightsError: (error: string | null) => void;
  toggleInsightExpanded: (id: string) => void;
  
  // Conversation actions
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastMessage: (updates: Partial<ChatMessage>) => void;
  appendToStreamingMessage: (text: string) => void;
  finishStreamingMessage: () => void;
  addCitationToLastMessage: (citation: SourceCitation) => void;
  clearChat: () => void;
  setChatLoading: (loading: boolean) => void;
  setChatError: (error: string | null) => void;
  
  // Extraction actions
  addExtract: (extract: Omit<Extract, 'id' | 'createdAt'>) => void;
  updateExtract: (id: string, updates: Partial<Extract>) => void;
  removeExtract: (id: string) => void;
  addTagToExtract: (id: string, tag: string) => void;
  removeTagFromExtract: (id: string, tag: string) => void;
  
  // Highlight actions
  addHighlight: (highlight: Omit<ActiveHighlight, 'id'>) => void;
  removeHighlight: (id: string) => void;
  clearHighlights: () => void;
  highlightFromCitation: (citation: SourceCitation) => void;
  
  // Chat reference actions
  setChatReference: (reference: AIState['chatReference']) => void;
  clearChatReference: () => void;

  // Pending question actions
  setPendingQuestion: (question: string | null) => void;
  clearPendingQuestion: () => void;

  // Panel actions
  setRightPanelTab: (tab: AIState['rightPanelActiveTab']) => void;
  toggleRightPanelExpanded: () => void;

  // Agent actions
  setAgentInitialized: (initialized: boolean) => void;
  setAgentError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

// ============================================================
// Initial State
// ============================================================

const initialState: AIState = {
  activePaperId: null,
  paperDataCache: new Map(),
  paperContext: null,
  insights: [],
  insightsLoading: false,
  insightsError: null,
  chatMessages: [],
  chatLoading: false,
  chatError: null,
  streamingMessage: '',
  extracts: [],
  activeHighlights: [],
  chatReference: null,
  pendingQuestion: null,
  rightPanelActiveTab: 'insights',
  rightPanelExpanded: true,
  agentInitialized: false,
  agentError: null,
};

// ============================================================
// Store
// ============================================================

export const useAIStore = create<AIState & AIActions>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // ============================================================
        // Multi-document management
        // ============================================================

        // Set active paper (does not switch data)
        setActivePaper: (paperId: string) => {
          set({ activePaperId: paperId });
        },
        
        // Switch to specified paper (auto-save current + load target)
        switchToPaper: (paperId: string, context?: PaperContext) => {
          const state = get();
          
          // If already the current paper, only update context
          if (state.activePaperId === paperId) {
            if (context) {
              set({ paperContext: context });
            }
            return;
          }
          
          // Save current paper data to cache
          if (state.activePaperId) {
            get().savePaperDataToCache(state.activePaperId);
          }
          
          // Set new active paper
          set({ activePaperId: paperId });
          
          // Try to load from cache
          const cached = state.paperDataCache.get(paperId);
          if (cached) {
            console.log(`[AIStore] Loading cached data for paper: ${paperId}`);
            set({
              insights: cached.insights,
              chatMessages: cached.chatMessages,
              extracts: cached.extracts,
              paperContext: context || null,
              insightsError: null,
            });
          } else {
            // Clear current data, waiting for new data
            console.log(`[AIStore] No cache for paper: ${paperId}, clearing state`);
            set({
              insights: [],
              chatMessages: [],
              extracts: [],
              paperContext: context || null,
              insightsError: null,
              insightsLoading: false,
            });
          }
        },
        
        // Save current paper data to cache
        savePaperDataToCache: (paperId: string) => {
          const state = get();
          const newCache = new Map(state.paperDataCache);
          newCache.set(paperId, {
            insights: state.insights,
            chatMessages: state.chatMessages,
            extracts: state.extracts,
          });
          set({ paperDataCache: newCache });
          console.log(`[AIStore] Saved data to cache for paper: ${paperId}`);
        },
        
        // Load paper data from cache
        loadPaperDataFromCache: (paperId: string) => {
          const cached = get().paperDataCache.get(paperId);
          if (cached) {
            set({
              insights: cached.insights,
              chatMessages: cached.chatMessages,
              extracts: cached.extracts,
            });
            console.log(`[AIStore] Loaded data from cache for paper: ${paperId}`);
          }
        },

        // ============================================================
        // Paper Context
        // ============================================================
        
        setPaperContext: (context, paperId?: string) => {
          const state = get();
          const effectivePaperId = paperId || context?.source?.arxivId || state.activePaperId;
          
          // If this is a new paper, trigger a switch
          if (effectivePaperId && effectivePaperId !== state.activePaperId) {
            get().switchToPaper(effectivePaperId, context || undefined);
          } else {
            set({ paperContext: context });
          }
        },

        // Insight actions
        setInsights: (insights) => set({ insights }),
        
        addInsight: (insight) => set((state) => ({
          insights: [...state.insights, insight],
        })),
        
        updateInsight: (id, updates) => set((state) => ({
          insights: state.insights.map((i) =>
            i.id === id ? { ...i, ...updates } : i
          ),
        })),
        
        removeInsight: (id) => set((state) => ({
          insights: state.insights.filter((i) => i.id !== id),
        })),
        
        setInsightsLoading: (loading) => set({ insightsLoading: loading }),
        
        setInsightsError: (error) => set({ insightsError: error }),
        
        toggleInsightExpanded: (id) => set((state) => ({
          insights: state.insights.map((i) =>
            i.id === id ? { ...i, expanded: !i.expanded } : i
          ),
        })),

        // Conversation actions
        addChatMessage: (message) => set((state) => ({
          chatMessages: [
            ...state.chatMessages,
            {
              ...message,
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: Date.now(),
            },
          ],
        })),
        
        updateLastMessage: (updates) => set((state) => {
          const messages = [...state.chatMessages];
          if (messages.length > 0) {
            messages[messages.length - 1] = {
              ...messages[messages.length - 1],
              ...updates,
            };
          }
          return { chatMessages: messages };
        }),
        
        appendToStreamingMessage: (text) => set((state) => ({
          streamingMessage: state.streamingMessage + text,
        })),
        
        finishStreamingMessage: () => {
          const { streamingMessage, chatMessages } = get();
          if (streamingMessage) {
            // Update the content of the last message
            const messages = [...chatMessages];
            if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
              messages[messages.length - 1] = {
                ...messages[messages.length - 1],
                content: streamingMessage,
                streaming: false,
              };
            }
            set({ chatMessages: messages, streamingMessage: '' });
          }
        },
        
        addCitationToLastMessage: (citation) => set((state) => {
          const messages = [...state.chatMessages];
          if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            const lastMessage = messages[messages.length - 1];
            const citations = lastMessage.citations || [];
            // Avoid adding duplicate citations with the same page number
            if (!citations.some(c => c.pageNumber === citation.pageNumber)) {
              messages[messages.length - 1] = {
                ...lastMessage,
                citations: [...citations, citation],
              };
            }
          }
          return { chatMessages: messages };
        }),
        
        clearChat: () => set({ chatMessages: [], streamingMessage: '' }),
        
        setChatLoading: (loading) => set({ chatLoading: loading }),
        
        setChatError: (error) => set({ chatError: error }),

        // Extraction actions
        addExtract: (extract) => set((state) => ({
          extracts: [
            ...state.extracts,
            {
              ...extract,
              id: `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              createdAt: Date.now(),
            },
          ],
        })),
        
        updateExtract: (id, updates) => set((state) => ({
          extracts: state.extracts.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),
        
        removeExtract: (id) => set((state) => ({
          extracts: state.extracts.filter((e) => e.id !== id),
        })),
        
        addTagToExtract: (id, tag) => set((state) => ({
          extracts: state.extracts.map((e) =>
            e.id === id && !e.tags.includes(tag)
              ? { ...e, tags: [...e.tags, tag] }
              : e
          ),
        })),
        
        removeTagFromExtract: (id, tag) => set((state) => ({
          extracts: state.extracts.map((e) =>
            e.id === id ? { ...e, tags: e.tags.filter((t) => t !== tag) } : e
          ),
        })),

        // Highlight actions
        addHighlight: (highlight) => set((state) => ({
          activeHighlights: [
            ...state.activeHighlights,
            {
              ...highlight,
              id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            },
          ],
        })),
        
        removeHighlight: (id) => set((state) => ({
          activeHighlights: state.activeHighlights.filter((h) => h.id !== id),
        })),
        
        clearHighlights: () => set({ activeHighlights: [] }),
        
        highlightFromCitation: (citation) => {
          if (citation.bbox) {
            get().addHighlight({
              pageNumber: citation.pageNumber,
              bbox: citation.bbox,
              color: '#FFD700', // Gold
              source: 'citation',
            });
          }
        },

        // Chat reference actions
        setChatReference: (reference) => set({ chatReference: reference }),
        clearChatReference: () => set({ chatReference: null }),

        // Pending question actions
        setPendingQuestion: (question) => set({ pendingQuestion: question }),
        clearPendingQuestion: () => set({ pendingQuestion: null }),

        // Panel actions
        setRightPanelTab: (tab) => set({ rightPanelActiveTab: tab }),
        
        toggleRightPanelExpanded: () => set((state) => ({
          rightPanelExpanded: !state.rightPanelExpanded,
        })),

        // Agent actions
        setAgentInitialized: (initialized) => set({ agentInitialized: initialized }),
        
        setAgentError: (error) => set({ agentError: error }),

        // Reset
        reset: () => set(initialState),
      }),
      {
        name: 'ai-store',
        partialize: (state) => ({
          // Persist important state
          extracts: state.extracts,
          chatMessages: state.chatMessages,  // Persist chat history
          insights: state.insights,           // Persist insight results
          rightPanelActiveTab: state.rightPanelActiveTab,
          rightPanelExpanded: state.rightPanelExpanded,
        }),
      }
    ),
    { name: 'ai-store' }
  )
);

// ============================================================
// Selectors
// ============================================================

/**
 * Get insights by specific type
 */
export const selectInsightsByType = (type: InsightType) => (state: AIState) =>
  state.insights.filter((i) => i.type === type);

/**
 * Get highlights for a specific page
 */
export const selectHighlightsByPage = (pageNumber: number) => (state: AIState) =>
  state.activeHighlights.filter((h) => h.pageNumber === pageNumber);

/**
 * Get extractions by specific type
 */
export const selectExtractsByType = (type: Extract['type']) => (state: AIState) =>
  state.extracts.filter((e) => e.type === type);

/**
 * Get extractions with a specific tag
 */
export const selectExtractsByTag = (tag: string) => (state: AIState) =>
  state.extracts.filter((e) => e.tags.includes(tag));

