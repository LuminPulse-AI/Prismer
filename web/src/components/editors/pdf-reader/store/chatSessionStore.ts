/**
 * Chat Session Store
 * 
 * Document-independent chat session management
 * - Supports multi-paper conversations
 * - Session persistence
 * - Switching papers does not lose conversations
 */

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { v4 as uuidv4 } from 'uuid';
import {
  Citation,
  MessageContext,
  PaperAliasMap,
} from '../types/citation';
import { citationMapper, paperAliasAssigner, citationTagParser } from '../services/citationSystem';
import { createUserIsolatedStorage } from '@/lib/storage/userStorageManager';

// Stable empty arrays to avoid infinite loop in selectors
const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_SESSIONS: ChatSession[] = [];

// ============================================================
// Type Definitions
// ============================================================

/**
 * Chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  
  /** Raw content (preserves AI-generated tags) */
  rawContent: string;
  
  /** Parsed citation list */
  citations: Citation[];

  /** Message context */
  messageContext: MessageContext;

  /** Papers associated with the message */
  targetPaperIds?: string[];
  
  timestamp: number;
}

/**
 * Context configuration
 */
export interface ChatContextConfig {
  mode: 'single' | 'multi' | 'selective';
  selectedDetections?: string[];
  maxContextLength: number;
  includeFigures: boolean;
}

/**
 * Chat session
 */
export interface ChatSession {
  id: string;
  title: string;
  
  /** Associated paper ID list */
  paperIds: string[];

  /** Paper alias map (session-level, stable and immutable) */
  paperAliasMap: PaperAliasMap;

  /** Message history */
  messages: ChatMessage[];

  /** Context configuration */
  contextConfig: ChatContextConfig;
  
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

// ============================================================
// Store State
// ============================================================

interface ChatSessionState {
  /** Session list */
  sessions: ChatSession[];

  /** Current active session ID */
  activeSessionId: string | null;

  /** Streaming response content */
  streamingMessage: string;

  /** Loading state */
  isLoading: boolean;

  /** Error message */
  error: string | null;
}

interface ChatSessionActions {
  // Session management
  createSession: (title: string, paperIds?: string[]) => ChatSession;
  deleteSession: (id: string) => void;
  archiveSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<ChatSession>) => void;

  // Switch session
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => ChatSession | null;

  // Paper association
  addPaperToSession: (sessionId: string, paperId: string) => void;
  removePaperFromSession: (sessionId: string, paperId: string) => void;

  // Message management
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp' | 'citations'>) => void;
  updateLastMessage: (content: string) => void;
  appendToStreamingMessage: (chunk: string) => void;
  finishStreamingMessage: () => void;
  clearStreamingMessage: () => void;

  // State management
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Utility methods
  getSessionForPaper: (paperId: string) => ChatSession | null;
  createOrGetSessionForPaper: (paperId: string, paperTitle?: string) => ChatSession;
}

// ============================================================
// Default Values
// ============================================================

const DEFAULT_CONTEXT_CONFIG: ChatContextConfig = {
  mode: 'single',
  maxContextLength: 50000,
  includeFigures: true,
};

// ============================================================
// Store Implementation
// ============================================================

export const useChatSessionStore = create<ChatSessionState & ChatSessionActions>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        sessions: [],
        activeSessionId: null,
        streamingMessage: '',
        isLoading: false,
        error: null,
        
        // ============================================================
        // Session management
        // ============================================================

        createSession: (title, paperIds = []) => {
          const id = uuidv4();
          const now = Date.now();

          // Assign paper aliases
          const paperAliasMap = paperAliasAssigner.assignAliases(paperIds);
          
          const newSession: ChatSession = {
            id,
            title,
            paperIds,
            paperAliasMap,
            messages: [],
            contextConfig: { ...DEFAULT_CONTEXT_CONFIG },
            createdAt: now,
            updatedAt: now,
            archived: false,
          };
          
          set(state => ({
            sessions: [...state.sessions, newSession],
            activeSessionId: id,
          }));
          
          return newSession;
        },
        
        deleteSession: (id) => {
          set(state => ({
            sessions: state.sessions.filter(s => s.id !== id),
            activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
          }));
        },
        
        archiveSession: (id) => {
          set(state => ({
            sessions: state.sessions.map(s =>
              s.id === id ? { ...s, archived: true, updatedAt: Date.now() } : s
            ),
          }));
        },
        
        updateSession: (id, updates) => {
          set(state => ({
            sessions: state.sessions.map(s =>
              s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
            ),
          }));
        },
        
        // ============================================================
        // Switch session
        // ============================================================
        
        setActiveSession: (id) => {
          set({ activeSessionId: id, streamingMessage: '' });
        },
        
        getActiveSession: () => {
          const { sessions, activeSessionId } = get();
          if (!activeSessionId) return null;
          return sessions.find(s => s.id === activeSessionId) || null;
        },
        
        // ============================================================
        // Paper association
        // ============================================================
        
        addPaperToSession: (sessionId, paperId) => {
          set(state => ({
            sessions: state.sessions.map(s => {
              if (s.id !== sessionId) return s;
              if (s.paperIds.includes(paperId)) return s;
              
              // Update paper list and alias map
              const newPaperIds = [...s.paperIds, paperId];
              const newAliasMap = paperAliasAssigner.assignAliases(
                newPaperIds,
                s.paperAliasMap
              );
              
              return {
                ...s,
                paperIds: newPaperIds,
                paperAliasMap: newAliasMap,
                updatedAt: Date.now(),
              };
            }),
          }));
        },
        
        removePaperFromSession: (sessionId, paperId) => {
          // Note: removing papers is generally not recommended as it affects tag parsing in historical messages
          set(state => ({
            sessions: state.sessions.map(s => {
              if (s.id !== sessionId) return s;
              return {
                ...s,
                paperIds: s.paperIds.filter(id => id !== paperId),
                // Keep alias map, do not delete
                updatedAt: Date.now(),
              };
            }),
          }));
        },
        
        // ============================================================
        // Message management
        // ============================================================
        
        addMessage: (messageData) => {
          const session = get().getActiveSession();
          if (!session) {
            console.warn('[ChatSessionStore] No active session');
            return;
          }
          
          // Parse tags and map to Citations
          const tags = citationTagParser.parse(messageData.rawContent);
          const citations = citationMapper.mapToCitations(tags, messageData.messageContext);
          
          const message: ChatMessage = {
            ...messageData,
            id: uuidv4(),
            citations,
            timestamp: Date.now(),
          };
          
          set(state => ({
            sessions: state.sessions.map(s => {
              if (s.id !== session.id) return s;
              return {
                ...s,
                messages: [...s.messages, message],
                updatedAt: Date.now(),
              };
            }),
          }));
        },
        
        updateLastMessage: (content) => {
          const session = get().getActiveSession();
          if (!session || session.messages.length === 0) return;
          
          const lastMessage = session.messages[session.messages.length - 1];
          
          // Re-parse citations
          const tags = citationTagParser.parse(content);
          const citations = citationMapper.mapToCitations(tags, lastMessage.messageContext);
          
          set(state => ({
            sessions: state.sessions.map(s => {
              if (s.id !== session.id) return s;
              const messages = [...s.messages];
              messages[messages.length - 1] = {
                ...lastMessage,
                rawContent: content,
                citations,
              };
              return { ...s, messages, updatedAt: Date.now() };
            }),
          }));
        },
        
        appendToStreamingMessage: (chunk) => {
          set(state => ({
            streamingMessage: state.streamingMessage + chunk,
          }));
        },
        
        finishStreamingMessage: () => {
          const { streamingMessage, getActiveSession } = get();
          const session = getActiveSession();
          
          if (!session || !streamingMessage) return;
          
          // Determine message context
          const messageContext: MessageContext = session.paperIds.length > 1
            ? {
                mode: 'multi',
                paperAliasMap: session.paperAliasMap,
              }
            : {
                mode: 'single',
                defaultPaperId: session.paperIds[0],
              };
          
          // Add assistant message
          get().addMessage({
            role: 'assistant',
            rawContent: streamingMessage,
            messageContext,
          });
          
          set({ streamingMessage: '' });
        },
        
        clearStreamingMessage: () => {
          set({ streamingMessage: '' });
        },
        
        // ============================================================
        // State management
        // ============================================================
        
        setLoading: (loading) => set({ isLoading: loading }),
        setError: (error) => set({ error }),
        
        // ============================================================
        // Utility methods
        // ============================================================
        
        getSessionForPaper: (paperId) => {
          const { sessions } = get();
          // Find the most recently updated session containing this paper
          const matchingSessions = sessions
            .filter(s => s.paperIds.includes(paperId) && !s.archived)
            .sort((a, b) => b.updatedAt - a.updatedAt);
          return matchingSessions[0] || null;
        },
        
        createOrGetSessionForPaper: (paperId, paperTitle) => {
          let session = get().getSessionForPaper(paperId);
          
          if (!session) {
            const title = paperTitle
              ? `Chat: ${paperTitle.slice(0, 30)}${paperTitle.length > 30 ? '...' : ''}`
              : `Chat: ${paperId}`;
            session = get().createSession(title, [paperId]);
          } else {
            // Ensure the session is active
            get().setActiveSession(session.id);
          }
          
          return session;
        },
      }),
      {
        name: 'chat-session-storage',
        version: 1,
        // Use user-isolated storage; unauthenticated users do not persist chat history
        storage: createUserIsolatedStorage('chat-session-storage', true),
        partialize: (state) => ({
          sessions: state.sessions,
          activeSessionId: state.activeSessionId,
        }),
        migrate: (persistedState: any, version: number) => {
          // Handle migration from older versions
          if (version === 0) {
            // Clear old data if structure is incompatible
            return { sessions: [], activeSessionId: null };
          }
          return persistedState as ChatSessionState;
        },
      }
    ),
    { name: 'ChatSessionStore' }
  )
);

// ============================================================
// Hooks
// ============================================================

/**
 * Get active session
 */
export function useActiveSession(): ChatSession | null {
  return useChatSessionStore(state => {
    if (!state.activeSessionId) return null;
    return state.sessions.find(s => s.id === state.activeSessionId) || null;
  });
}

/**
 * Get messages for the active session
 */
export function useSessionMessages(): ChatMessage[] {
  return useChatSessionStore(
    useShallow(state => {
      if (!state.activeSessionId) return EMPTY_MESSAGES;
      const session = state.sessions.find(s => s.id === state.activeSessionId);
      return session?.messages ?? EMPTY_MESSAGES;
    })
  );
}

/**
 * Get non-archived session list
 */
export function useActiveSessions(): ChatSession[] {
  return useChatSessionStore(
    useShallow(state => {
      const filtered = state.sessions.filter(s => !s.archived);
      if (filtered.length === 0) return EMPTY_SESSIONS;
      return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
    })
  );
}

/**
 * Clear all chat sessions (used on logout)
 */
export function clearAllChatSessions(): void {
  useChatSessionStore.setState({
    sessions: [],
    activeSessionId: null,
    streamingMessage: '',
    isLoading: false,
    error: null,
  });
}
