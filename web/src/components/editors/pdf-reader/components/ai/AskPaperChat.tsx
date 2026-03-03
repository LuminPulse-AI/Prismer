/**
 * Ask Paper Chat
 * 
 * Conversational paper Q&A panel (supports Markdown rendering)
 *
 * Updated: integrated ChatSessionStore for session persistence and cross-paper conversations
 */

"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Send,
  Loader2,
  User,
  Bot,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  X,
  FileText,
  FileEdit,
  Plus,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { SourceCitation, StreamEvent } from '@/types/paperContext';
import { useAIStore } from '../../store/aiStore';
import { useCitationStore } from '../../store/citationStore';
import {
  useChatSessionStore,
  useActiveSession,
  useSessionMessages,
  ChatMessage,
} from '../../store/chatSessionStore';
import { SessionSelector } from '../ui/SessionSelector';
import { UnifiedCitationTag, CitationTagFromId } from '../ui/UnifiedCitationTag';
import { ContextIndicator } from '../ui/ContextIndicator';
import { Citation, createCitation } from '../../types/citation';
import {
  getDefaultPaperAgentService,
  createAgentConfigAsync,
} from '../../services/paperAgentService';

import { createEditorEventEmitter } from "@/lib/events";

const emitEvent = createEditorEventEmitter('pdf-reader');

// ============================================================
// Types
// ============================================================

interface AskPaperChatProps {
  onNavigateToPage?: (pageNumber: number) => void;
  className?: string;
}

// ============================================================
// Suggested Questions
// ============================================================

const SUGGESTED_QUESTIONS = [
  "What is the main contribution of this paper?",
  "Explain the methodology used",
  "What are the key results?",
  "What are the limitations?",
  "How does this compare to prior work?",
];

// ============================================================
// Sub-Components
// ============================================================

interface ChatBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  onNavigateToPage?: (pageNumber: number) => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({
  message,
  isStreaming = false,
  streamingContent,
  onNavigateToPage,
}) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const { scrollToDetection } = useCitationStore();

  // Use streaming content if available, otherwise use message content
  const displayContent = isStreaming ? (streamingContent || '') : message.rawContent;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayContent]);

  // Extract citations - supports various bracket formats: [[id]], [id], [[A:id]], [A:id], etc.
  const citationRefs = useMemo(() => {
    if (isUser) return [];
    const refs: { id: string; alias?: string; index: number }[] = [];
    // Relaxed regex: matches 1-2 opening brackets, optional alias, detection ID, 1-2 closing brackets
    const pattern = /\[{1,2}(?:([A-Z]):)?(p\d+_\w+_\d+)\]{1,2}/g;
    let match: RegExpExecArray | null;
    let index = 1;
    while ((match = pattern.exec(displayContent)) !== null) {
      const detectionId = match[2];
      if (!refs.some(r => r.id === detectionId)) {
        refs.push({ id: detectionId, alias: match[1] || undefined, index: index++ });
      }
    }
    return refs;
  }, [displayContent, isUser]);

  // Processed content - replace citations with renderable placeholders
  const processedContent = useMemo(() => {
    if (isUser) return displayContent;
    let content = displayContent;
    
    // Use a single regex to replace all citation formats in one pass
    // This avoids formatting issues caused by multiple sequential replacements
    const citationPattern = /\[{1,2}(?:([A-Z]):)?(p\d+_\w+_\d+)\]{1,2}/g;
    
    content = content.replace(citationPattern, (match, alias, detectionId) => {
      const ref = citationRefs.find(r => r.id === detectionId);
      if (ref) {
        if (alias) {
          return `\`cite:${alias}:${detectionId}:${ref.index}\``;
        }
        return `\`cite:${detectionId}:${ref.index}\``;
      }
      return match; // If no matching citation found, keep as-is
    });
    
    // Clean up extra commas and empty brackets (leftover from list format)
    content = content.replace(/\[\[\s*,?\s*\]\]/g, ''); // Remove empty [[, ]]
    content = content.replace(/,\s*`cite:/g, ' `cite:'); // Remove commas before citations
    content = content.replace(/`\s*,\s*/g, '` '); // Remove commas after citations
    
    return content;
  }, [displayContent, citationRefs, isUser]);

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
        isUser ? 'bg-indigo-600' : 'bg-stone-200'
      )}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-stone-700" />
        )}
      </div>

      {/* Message Content - Responsive width */}
      <div className={cn(
        'flex-1 min-w-0', // min-w-0 allows flex child to shrink below content size
        isUser ? 'text-right' : 'text-left'
      )}>
        <div className={cn(
          'inline-block px-3 py-2 rounded-lg text-sm max-w-full', // max-w-full constrains to parent
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-none'
            : 'bg-stone-100 text-stone-800 rounded-tl-none border border-stone-200'
        )}>
          {/* Message Text - Markdown for assistant, plain text for user */}
          <div className={cn(
            "overflow-hidden break-words", // Ensure text wraps and content doesn't overflow
            isUser ? "whitespace-pre-wrap" : "prose prose-sm prose-stone max-w-none"
          )}>
            {isUser ? (
              displayContent
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Custom code block rendering - also handle citation placeholders
                  code: ({ className, children, ...props }) => {
                    const text = String(children).trim();
                    // Check if this is a citation placeholder - handle both formats
                    // Format 1: cite:A:p1_text_0:1 (cross-paper)
                    // Format 2: cite:p1_text_0:1 (single paper)
                    const crossPaperMatch = text.match(/^cite:([A-Z]):(p\d+_\w+_\d+):(\d+)$/);
                    const singlePaperMatch = text.match(/^cite:(p\d+_\w+_\d+):(\d+)$/);
                    
                    if (crossPaperMatch) {
                      return (
                        <CitationTagFromId
                          detectionId={crossPaperMatch[2]}
                          paperAlias={crossPaperMatch[1]}
                          displayIndex={parseInt(crossPaperMatch[3])}
                          compact
                        />
                      );
                    }
                    
                    if (singlePaperMatch) {
                      return (
                        <CitationTagFromId 
                          detectionId={singlePaperMatch[1]} 
                          displayIndex={parseInt(singlePaperMatch[2])}
                          compact
                        />
                      );
                    }
                    // Inline code (no className means inline)
                    const isInline = !className?.includes('language-');
                    if (isInline) {
                      return (
                        <code className="px-1 py-0.5 bg-stone-200 rounded text-xs break-all" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <pre className="bg-stone-800 text-stone-100 p-2 rounded text-xs overflow-x-auto max-w-full">
                        <code className="break-all" {...props}>{children}</code>
                      </pre>
                    );
                  },
                  // Custom link rendering
                  a: ({ node, children, href, ...props }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                      {...props}
                    >
                      {children}
                    </a>
                  ),
                  // Custom paragraph to reduce spacing
                  p: ({ node, children, ...props }) => (
                    <p className="mb-2 last:mb-0" {...props}>
                      {children}
                    </p>
                  ),
                  // Custom list styling
                  ul: ({ node, children, ...props }) => (
                    <ul className="list-disc list-inside mb-2 space-y-1 pl-2" {...props}>
                      {children}
                    </ul>
                  ),
                  ol: ({ node, children, ...props }) => (
                    <ol className="list-decimal list-inside mb-2 space-y-1 pl-2" {...props}>
                      {children}
                    </ol>
                  ),
                  li: ({ node, children, ...props }) => (
                    <li className="leading-relaxed" {...props}>
                      {children}
                    </li>
                  ),
                  // Custom headings
                  h1: ({ node, children, ...props }) => (
                    <h1 className="text-lg font-bold text-stone-900 mt-4 mb-2 first:mt-0" {...props}>
                      {children}
                    </h1>
                  ),
                  h2: ({ node, children, ...props }) => (
                    <h2 className="text-base font-bold text-stone-800 mt-3 mb-2 first:mt-0" {...props}>
                      {children}
                    </h2>
                  ),
                  h3: ({ node, children, ...props }) => (
                    <h3 className="text-sm font-semibold text-stone-800 mt-3 mb-1.5 first:mt-0" {...props}>
                      {children}
                    </h3>
                  ),
                  h4: ({ node, children, ...props }) => (
                    <h4 className="text-sm font-medium text-stone-700 mt-2 mb-1 first:mt-0" {...props}>
                      {children}
                    </h4>
                  ),
                  // Horizontal rule
                  hr: ({ node, ...props }) => (
                    <hr className="my-3 border-stone-300" {...props} />
                  ),
                  // Strong/Bold
                  strong: ({ node, children, ...props }) => (
                    <strong className="font-semibold text-stone-900" {...props}>
                      {children}
                    </strong>
                  ),
                  // Emphasis/Italic
                  em: ({ node, children, ...props }) => (
                    <em className="italic" {...props}>
                      {children}
                    </em>
                  ),
                  // Blockquote
                  blockquote: ({ node, children, ...props }) => (
                    <blockquote className="border-l-3 border-indigo-400 pl-3 my-2 text-stone-600 italic" {...props}>
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {processedContent}
              </ReactMarkdown>
            )}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse" />
            )}
          </div>

          {/* Inline citations are rendered within the markdown content above */}
          {/* Bottom citation list removed - inline tags are clickable and provide navigation */}
        </div>

        {/* Actions - Icon buttons with tooltips */}
        {!isUser && !isStreaming && (
          <div className="mt-1.5 flex items-center gap-1">
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className={cn(
                "relative group p-1.5 rounded-md transition-colors",
                copied 
                  ? "bg-emerald-100 text-emerald-600"
                  : "text-stone-400 hover:text-indigo-600 hover:bg-indigo-50"
              )}
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-stone-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {copied ? 'Copied!' : 'Copy'}
              </span>
            </button>
            
            {/* Add to Notes Button - Disabled for now */}
            <button
              disabled
              className={cn(
                "relative group p-1.5 rounded-md transition-colors",
                "text-stone-300 cursor-not-allowed"
              )}
              title="Add to Notes (Coming Soon)"
            >
              <FileEdit className="w-3.5 h-3.5" />
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-stone-800 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                Add to Notes (Coming Soon)
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Main Component
// ============================================================

export const AskPaperChat: React.FC<AskPaperChatProps> = ({
  onNavigateToPage,
  className,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // AI Store - for paper context and references (per-document state)
  const {
    paperContext,
    chatReference,
    clearChatReference,
    pendingQuestion,
    clearPendingQuestion,
  } = useAIStore();

  // Chat Session Store - for persistent chat sessions
  const {
    streamingMessage,
    isLoading,
    addMessage,
    appendToStreamingMessage,
    finishStreamingMessage,
    clearStreamingMessage,
    setLoading,
    setError,
    createOrGetSessionForPaper,
    addPaperToSession,
  } = useChatSessionStore();
  
  const activeSession = useActiveSession();
  const messages = useSessionMessages();

  // Get current paper info
  const currentPaperId = paperContext?.source?.arxivId || null;
  const currentPaperTitle = paperContext?.metadata?.title;

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage, scrollToBottom]);

  // Track the current paper ID to detect paper switches
  const prevPaperIdRef = useRef<string | null>(null);
  
  // Auto-switch session when paper changes
  // When switching papers, switch to the session for that paper (create one if it doesn't exist)
  useEffect(() => {
    if (!currentPaperId) return;
    
    // Detect whether this is a paper switch (not the initial load)
    const isPaperSwitch = prevPaperIdRef.current !== null && prevPaperIdRef.current !== currentPaperId;
    prevPaperIdRef.current = currentPaperId;
    
    // If this is a paper switch or there's no active session, switch to the session for this paper
    if (isPaperSwitch || !activeSession) {
      console.log('[AskPaperChat] Switching to session for paper:', currentPaperId);
      createOrGetSessionForPaper(currentPaperId, currentPaperTitle);
    }
  }, [currentPaperId, currentPaperTitle, activeSession, createOrGetSessionForPaper]);

  // Initialize Agent
  const [agentReady, setAgentReady] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const agentRef = useRef(getDefaultPaperAgentService());

  // Initialize Agent - API key managed by the server
  useEffect(() => {
    const initAgent = async () => {
      try {
        const config = await createAgentConfigAsync();
        await agentRef.current.initialize(config);
        setAgentReady(true);
        setAgentError(null);
      } catch (error) {
        console.error('Failed to initialize agent:', error);
        setAgentError(error instanceof Error ? error.message : 'Failed to initialize agent');
      }
    };
    initAgent();
  }, []);

  // Listen for agent directives (demo mode)
  useEffect(() => {
    // Handle SEND_PDF_CHAT directive - simulate a user asking a question
    const handleSendPdfChat = (e: CustomEvent<{ query: string }>) => {
      const { query } = e.detail;
      console.log('[AskPaperChat] Agent SEND_PDF_CHAT:', query);
      
      // Ensure we have a session
      if (!activeSession && currentPaperId) {
        createOrGetSessionForPaper(currentPaperId, currentPaperTitle);
      }
      
      // Add user message
      addMessage({
        role: 'user',
        rawContent: query,
        messageContext: { mode: 'single', defaultPaperId: currentPaperId || undefined },
      });
    };

    // Handle PDF_CHAT_RESPONSE directive - simulate AI streaming response
    const handlePdfChatResponse = (e: CustomEvent<{ content: string; isStreaming: boolean; isComplete: boolean }>) => {
      const { content, isStreaming, isComplete } = e.detail;
      console.log('[AskPaperChat] Agent PDF_CHAT_RESPONSE:', { isStreaming, isComplete, length: content.length });
      
      if (isStreaming) {
        // Streaming: append to streaming message
        appendToStreamingMessage(content);
      }
      
      if (isComplete) {
        // Complete: finalize the streaming message
        finishStreamingMessage();
        
        // Emit component event for demo flow
        emitEvent({
          type: 'actionComplete',
          payload: {
            action: 'ai_chat',
            result: { success: true },
          },
        });
      }
    };

    window.addEventListener('agent:directive:SEND_PDF_CHAT', handleSendPdfChat as EventListener);
    window.addEventListener('agent:directive:PDF_CHAT_RESPONSE', handlePdfChatResponse as EventListener);

    return () => {
      window.removeEventListener('agent:directive:SEND_PDF_CHAT', handleSendPdfChat as EventListener);
      window.removeEventListener('agent:directive:PDF_CHAT_RESPONSE', handlePdfChatResponse as EventListener);
    };
  }, [activeSession, currentPaperId, currentPaperTitle, createOrGetSessionForPaper, addMessage, appendToStreamingMessage, finishStreamingMessage]);

  // Send message (supports optional preset question text)
  const handleSend = useCallback(async (questionText?: string) => {
    const trimmedInput = questionText?.trim() || input.trim();
    if (!trimmedInput || isLoading) return;

    // Check Agent and Paper Context
    if (!agentReady) {
      console.error('Agent not ready');
      return;
    }
    if (!paperContext?.hasOCRData && !paperContext?.markdown) {
      console.error('No paper context available');
      return;
    }

    // Ensure we have a session
    if (!activeSession && currentPaperId) {
      createOrGetSessionForPaper(currentPaperId, currentPaperTitle);
    }

    // Clear the input field (only if user typed it directly)
    if (!questionText) {
      setInput('');
    }

    // Build message content - include reference if available
    let messageContent = trimmedInput;
    let contextualQuestion = trimmedInput;
    
    if (chatReference) {
      const refText = chatReference.text.slice(0, 300);
      const pageInfo = chatReference.pageNumber ? ` (Page ${chatReference.pageNumber})` : '';
      messageContent = `[Regarding: "${refText}${chatReference.text.length > 300 ? '...' : ''}"${pageInfo}]\n\n${trimmedInput}`;
      contextualQuestion = `Regarding this text from the paper${pageInfo}:\n\n"${chatReference.text.slice(0, 500)}${chatReference.text.length > 500 ? '...' : ''}"\n\n${trimmedInput}`;
      // Clear the reference
      clearChatReference();
    }

    // Determine message context
    const messageContext = activeSession && activeSession.paperIds.length > 1
      ? {
          mode: 'multi' as const,
          paperAliasMap: activeSession.paperAliasMap,
        }
      : {
          mode: 'single' as const,
          defaultPaperId: currentPaperId || undefined,
        };

    // Add user message
    addMessage({
      role: 'user',
      rawContent: messageContent,
      messageContext,
    });

    setInput('');
    setLoading(true);
    clearStreamingMessage();

    try {
      // Build conversation history (excluding the just-added user message)
      const conversationHistory = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.rawContent,
      }));
      
      // Call the actual Agent Service, passing conversation history
      await agentRef.current.askPaper(
        contextualQuestion,
        paperContext,
        (event: StreamEvent) => {
          switch (event.type) {
            case 'text_delta':
              appendToStreamingMessage(event.data as string);
              break;
            case 'text_done':
              finishStreamingMessage();
              // Emit event for demo flow (if in workspace context)
              console.log('[AskPaperChat] AI response complete, emitting actionComplete event');
              emitEvent({
                type: 'actionComplete',
                payload: {
                  action: 'ai_chat',
                  status: 'success',
                },
              });
              break;
            case 'citation_found':
              // Citations are now handled in finishStreamingMessage by parsing the content
              break;
            case 'error':
              console.error('Agent error:', event.data);
              finishStreamingMessage();
              // Emit failure event
              emitEvent({
                type: 'actionFailed',
                payload: {
                  action: 'ai_chat',
                  error: event.data instanceof Error ? event.data : new Error(String(event.data)),
                },
              });
              break;
          }
        },
        conversationHistory
      );
    } catch (error) {
      console.error('Chat error:', error);
      // If an error occurs, show the error message
      appendToStreamingMessage('\n\n⚠️ Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      finishStreamingMessage();
      // Emit failure event for demo flow
      emitEvent({
        type: 'actionFailed',
        payload: {
          action: 'ai_chat',
          error: error instanceof Error ? error : new Error(String(error)),
        },
      });
    } finally {
      setLoading(false);
    }
  }, [
    input, isLoading, agentReady, paperContext, chatReference, activeSession, currentPaperId, currentPaperTitle,
    messages, addMessage, setLoading, appendToStreamingMessage, finishStreamingMessage, clearStreamingMessage,
    clearChatReference, createOrGetSessionForPaper
  ]);

  // Listen for pending questions (triggered from other components, e.g., Explain button or demo:sendChat)
  // This effect must be after handleSend is defined
  useEffect(() => {
    if (!pendingQuestion) return;
    
    console.log('[AskPaperChat] Pending question detected:', pendingQuestion);
    console.log('[AskPaperChat] State - agentReady:', agentReady, 'isLoading:', isLoading, 'paperContext:', !!paperContext);
    
    if (agentReady && !isLoading && (paperContext?.hasOCRData || paperContext?.markdown)) {
      console.log('[AskPaperChat] Conditions met, sending question...');
      // Automatically send the question
      handleSend(pendingQuestion);
      // Clear the pending question
      clearPendingQuestion();
    }
  }, [pendingQuestion, agentReady, isLoading, paperContext, handleSend, clearPendingQuestion]);

  // Handle key press
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Use a suggested question
  const handleSuggestedQuestion = useCallback((question: string) => {
    setInput(question);
    inputRef.current?.focus();
  }, []);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Session Selector Header */}
      <div className="px-4 py-2 border-b border-stone-200 bg-stone-50">
        <SessionSelector
          currentPaperId={currentPaperId || undefined}
          currentPaperTitle={currentPaperTitle}
          compact
        />
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const isLastMessage = index === messages.length - 1;
              const isAssistantStreaming = isLastMessage && message.role === 'assistant' && isLoading;
              
              return (
                <ChatBubble
                  key={message.id}
                  message={message}
                  isStreaming={isAssistantStreaming}
                  streamingContent={isAssistantStreaming ? streamingMessage : undefined}
                  onNavigateToPage={onNavigateToPage}
                />
              );
            })}
            {/* Show streaming bubble if we're loading and last message is user */}
            {isLoading && streamingMessage && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
              <ChatBubble
                message={{
                  id: 'streaming',
                  role: 'assistant',
                  rawContent: '',
                  citations: [],
                  messageContext: { mode: 'single', defaultPaperId: currentPaperId || undefined },
                  timestamp: Date.now(),
                }}
                isStreaming={true}
                streamingContent={streamingMessage}
                onNavigateToPage={onNavigateToPage}
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            {agentError ? (
              <>
                <AlertCircle className="w-12 h-12 text-amber-500 opacity-60 mb-4" />
                <h3 className="text-sm font-medium text-stone-800 mb-1">
                  AI Agent Configuration Required
                </h3>
                <p className="text-xs text-amber-600 max-w-[250px] mb-4">
                  {agentError}
                </p>
                <p className="text-xs text-stone-500 max-w-[200px]">
                  Please configure your API key in the .env file to enable AI chat.
                </p>
              </>
            ) : !agentReady ? (
              <>
                <Loader2 className="w-12 h-12 text-indigo-500 opacity-60 mb-4 animate-spin" />
                <h3 className="text-sm font-medium text-stone-800 mb-1">
                  Initializing AI Agent...
                </h3>
              </>
            ) : (
              <>
                <Sparkles className="w-12 h-12 text-indigo-500 opacity-60 mb-4" />
                <h3 className="text-sm font-medium text-stone-800 mb-1">
                  Ask anything about this paper
                </h3>
                <p className="text-xs text-stone-500 max-w-[200px] mb-4">
                  I can help you understand the paper, explain concepts, or find specific information.
                </p>

                {/* Suggested questions */}
                <div className="w-full space-y-2">
                  <p className="text-xs text-stone-500">Try asking:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {SUGGESTED_QUESTIONS.slice(0, 3).map((question) => (
                      <button
                        key={question}
                        onClick={() => handleSuggestedQuestion(question)}
                        disabled={!paperContext?.hasOCRData && !paperContext?.markdown}
                        className={cn(
                          'px-3 py-1.5 text-xs rounded-full',
                          'bg-stone-100 text-stone-700 border border-stone-200',
                          'hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200',
                          'transition-colors',
                          'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Suggested questions (shown above input when there are messages) */}
      {messages.length > 0 && !isLoading && (
        <div className="px-4 py-2 border-t border-stone-200 bg-stone-50/50">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {SUGGESTED_QUESTIONS.slice(0, 3).map((question) => (
              <button
                key={question}
                onClick={() => handleSuggestedQuestion(question)}
                className={cn(
                  'flex-shrink-0 px-2.5 py-1 text-xs rounded-full',
                  'bg-white text-stone-600 border border-stone-200',
                  'hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200',
                  'transition-colors whitespace-nowrap'
                )}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t border-stone-200 bg-stone-50">
        {/* Reference tag - shows the selected text reference */}
        {chatReference && (
          <div className="mb-2 flex items-start gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
            <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-indigo-600 font-medium">
                Asking about selection{chatReference.pageNumber ? ` (Page ${chatReference.pageNumber})` : ''}:
              </p>
              <p className="text-xs text-indigo-700 line-clamp-2 mt-0.5">
                &quot;{chatReference.text.slice(0, 120)}{chatReference.text.length > 120 ? '...' : ''}&quot;
              </p>
            </div>
            <button
              onClick={clearChatReference}
              className="p-0.5 hover:bg-indigo-100 rounded transition-colors flex-shrink-0"
              title="Remove reference"
            >
              <X className="w-3.5 h-3.5 text-indigo-500" />
            </button>
          </div>
        )}
        
        {agentError && (
          <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-700">
              ⚠️ AI Chat unavailable: {agentError}
            </p>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Context Indicator - circular progress indicator, same height as send button */}
          <ContextIndicator size={40} />
          
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !agentReady
                ? "Initializing AI Agent..."
                : agentError
                ? "AI Chat unavailable - check API configuration"
                : paperContext?.hasOCRData || paperContext?.markdown
                ? "Ask a question about this paper..."
                : "Loading paper content..."
            }
            disabled={!agentReady || !!agentError || (!paperContext?.hasOCRData && !paperContext?.markdown) || isLoading}
            rows={1}
            className={cn(
              'flex-1 resize-none px-3 py-2 text-sm',
              'rounded-lg border border-stone-300',
              'bg-white text-stone-800',
              'placeholder:text-stone-400',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-stone-100'
            )}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || !agentReady || !!agentError || (!paperContext?.hasOCRData && !paperContext?.markdown) || isLoading}
            className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-white" style={{ width: '20px', height: '20px' }} />
            ) : (
              <Send className="w-5 h-5 text-white" style={{ width: '16px', height: '16px' }} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AskPaperChat;
