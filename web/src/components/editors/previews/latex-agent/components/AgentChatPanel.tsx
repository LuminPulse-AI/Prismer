'use client';

/**
 * AgentChatPanel - LaTeX writing assistant floating chat panel
 *
 * Features:
 * - Displays SiriOrb animation when collapsed
 * - Floating rounded rectangle when expanded
 * - Scroll-up behavior display
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  MessageSquare,
  Zap,
  Minimize2,
} from 'lucide-react';
import { SiriOrb } from '@/components/ui/siri-orb';
import { ActionCard } from './ActionCard';
import type { ChatMessage, AgentAction } from '../types';
import { streamMockResponse } from '../mockData';

interface AgentChatPanelProps {
  onContentWrite?: (content: string, section?: string) => void;
  className?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

// Quick action buttons
const quickActions = [
  { id: 'intro', label: 'Introduction', icon: Sparkles },
  { id: 'method', label: 'Methodology', icon: Zap },
  { id: 'result', label: 'Results', icon: MessageSquare },
  { id: 'conclusion', label: 'Conclusion', icon: Bot },
];

// Message bubble component
const MessageBubble = memo(function MessageBubble({
  message,
  onCopy,
}: {
  message: ChatMessage;
  onCopy?: (content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = () => {
    onCopy?.(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${
          isUser
            ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
            : 'bg-gradient-to-br from-violet-500 to-purple-600'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-white" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block px-3 py-2 rounded-2xl text-sm shadow-md ${
            isUser
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-sm'
              : 'bg-slate-700/90 text-slate-200 rounded-tl-sm backdrop-blur-sm'
          }`}
        >
          <p className="whitespace-pre-wrap break-words leading-relaxed text-[13px]">
            {message.content}
          </p>
        </div>

        {/* Actions */}
        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.actions.map((action) => (
              <ActionCard key={action.id} action={action} expandedHeight="half" />
            ))}
          </div>
        )}

        {/* Meta */}
        <div
          className={`flex items-center gap-2 mt-1 text-[10px] text-slate-500 ${
            isUser ? 'justify-end' : ''
          }`}
        >
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          {!isUser && (
            <button
              onClick={handleCopy}
              className="p-0.5 hover:bg-slate-600 rounded transition-colors"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              ) : (
                <Copy className="h-2.5 w-2.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

// Current action indicator
const CurrentActionIndicator = memo(function CurrentActionIndicator({
  action,
}: {
  action: AgentAction;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/20 border border-violet-500/40 rounded-xl backdrop-blur-sm">
      <RefreshCw className="h-3.5 w-3.5 text-violet-400 animate-spin" />
      <span className="text-xs text-violet-300">{action.description}</span>
    </div>
  );
});

export const AgentChatPanel = memo(function AgentChatPanel({
  onContentWrite,
  className = '',
  isExpanded = true,
  onToggleExpand,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAction, setCurrentAction] = useState<AgentAction | null>(null);
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);
  const [isOpen, setIsOpen] = useState(true); // Open by default
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentAction, pendingActions]);

  // Handle submit
  const handleSubmit = useCallback(async (customMessage?: string) => {
    const messageText = customMessage || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setPendingActions([]);

    const collectedActions: AgentAction[] = [];
    let assistantContent = '';

    try {
      for await (const event of streamMockResponse(messageText)) {
        switch (event.type) {
          case 'action_start':
            if (event.data.action) {
              setCurrentAction(event.data.action);
              collectedActions.push(event.data.action);
              setPendingActions([...collectedActions]);
            }
            break;

          case 'action_complete':
            if (event.data.action) {
              const idx = collectedActions.findIndex(
                (a) => a.id === event.data.actionId || a.type === event.data.action!.type
              );
              if (idx !== -1) {
                collectedActions[idx] = event.data.action;
              } else {
                collectedActions.push(event.data.action);
              }
              setPendingActions([...collectedActions]);
              setCurrentAction(null);
            }
            break;

          case 'content_write':
            if (event.data.content) {
              onContentWrite?.(event.data.content);
            }
            break;

          case 'message':
            if (event.data.message) {
              assistantContent = event.data.message;
            }
            break;
        }
      }

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: assistantContent || 'Task completed.',
        timestamp: new Date().toISOString(),
        actions: collectedActions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error processing stream:', error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'Sorry, an error occurred while processing your request.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setCurrentAction(null);
      setPendingActions([]);
    }
  }, [input, isLoading, onContentWrite]);

  // Handle quick action
  const handleQuickAction = useCallback((actionId: string) => {
    const prompts: Record<string, string> = {
      intro: 'Help me write an introduction section for my paper about transformer architectures.',
      method: 'Write a methodology section describing experimental setup and evaluation metrics.',
      result: 'Generate a results section with comparison tables and analysis.',
      conclusion: 'Write a conclusion summarizing the main contributions and future work.',
    };
    handleSubmit(prompts[actionId] || '');
  }, [handleSubmit]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Copy to clipboard
  const handleCopy = useCallback(async (content: string) => {
    await navigator.clipboard.writeText(content);
  }, []);

  // Clear chat
  const handleClear = useCallback(() => {
    setMessages([]);
    setPendingActions([]);
    setCurrentAction(null);
  }, []);

  // Collapsed state - Show SiriOrb animation (at bottom-left of editor)
  if (!isOpen) {
    return (
      <div className={`absolute bottom-3 left-3 z-50 ${className}`}>
        <button
          onClick={() => setIsOpen(true)}
          className="relative group cursor-pointer flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 transition-all duration-300 shadow-lg shadow-violet-500/40 hover:shadow-xl hover:shadow-violet-500/50"
          title="AI Writing Assistant"
        >
          {/* SiriOrb animation - 3x faster */}
          <SiriOrb 
            size="40px" 
            animationDuration={4}
            colors={{
              c1: '#a855f7',  // purple-500
              c2: '#ec4899',  // pink-500
              c3: '#6366f1',  // indigo-500
            }}
            className="drop-shadow-xl transition-transform duration-300 group-hover:scale-110"
          />
          
          {/* Hover tooltip */}
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 
            px-3 py-1.5 bg-slate-800/95 backdrop-blur-sm rounded-xl 
            text-xs text-slate-200 whitespace-nowrap
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
            shadow-xl border border-slate-700/50
            pointer-events-none">
            <span className="font-medium">AI Writing Assistant</span>
            {messages.length > 0 && (
              <span className="ml-2 text-violet-400">({messages.length})</span>
            )}
          </div>
          
          {/* Message count badge */}
          {messages.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-violet-500 text-white text-[10px] 
              rounded-full flex items-center justify-center font-medium shadow-lg
              animate-in zoom-in duration-200">
              {messages.length > 9 ? '9+' : messages.length}
            </span>
          )}
          
          {/* Loading state indicator */}
          {isLoading && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full 
              flex items-center justify-center animate-pulse">
              <RefreshCw className="h-2.5 w-2.5 text-white animate-spin" />
            </span>
          )}
        </button>
      </div>
    );
  }

  // Check if there are completed actions (which need more space)
  const hasCompletedActions = messages.some(m => m.actions?.some(a => a.status === 'completed')) ||
    pendingActions.some(a => a.status === 'completed');

  // Expanded state - Bottom panel, matching the editor width
  return (
    <div 
      className={`absolute bottom-0 left-0 right-0 z-50 flex flex-col 
        ${hasCompletedActions ? 'h-[60vh]' : 'h-[320px]'}
        bg-slate-900/98 backdrop-blur-xl 
        rounded-t-2xl shadow-2xl shadow-black/50 
        border-t border-x border-violet-500/30 
        overflow-hidden
        animate-in slide-in-from-bottom-4 duration-700 ease-out
        transition-[height] duration-500 ease-out
        ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 
        bg-gradient-to-r from-violet-600/20 to-purple-600/20 
        border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          {/* Small SiriOrb as icon - 3x faster */}
          <SiriOrb 
            size="28px" 
            animationDuration={3}
            colors={{
              c1: '#a855f7',  // purple-500
              c2: '#ec4899',  // pink-500
              c3: '#6366f1',  // indigo-500
            }}
            className="drop-shadow-md"
          />
          <span className="text-sm font-semibold text-slate-200">AI Writing Assistant</span>
          {isLoading && (
            <span className="flex items-center gap-1 text-[10px] text-violet-400">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              Processing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClear();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Action Display Area - Scroll-up region */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div 
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: '#4B5563 transparent'
          }}
        >
          {messages.length === 0 && !isLoading ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 mx-auto mb-3">
                <SiriOrb 
                  size="64px" 
                  animationDuration={5}
                  colors={{
                    c1: '#a855f7',  // purple-500
                    c2: '#ec4899',  // pink-500
                    c3: '#6366f1',  // indigo-500
                  }}
                  className="drop-shadow-lg opacity-80"
                />
              </div>
              <p className="text-slate-300 text-sm font-medium mb-1">
                Ready to Help
              </p>
              <p className="text-slate-500 text-xs max-w-[260px] mx-auto">
                Search papers, analyze content, and write LaTeX sections.
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                />
              ))}

              {/* Pending actions during loading */}
              {isLoading && pendingActions.length > 0 && (
                <div className="space-y-3 animate-in slide-in-from-bottom-3 duration-700 ease-out">
                  {pendingActions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      isExpanded={action.status === 'completed'}
                      expandedHeight="half"
                    />
                  ))}
                </div>
              )}

              {/* Current action indicator */}
              {currentAction && (
                <div className="animate-in slide-in-from-bottom-3 duration-600 ease-out">
                  <CurrentActionIndicator action={currentAction} />
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input and Quick Actions */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-700/50 bg-slate-800/50">
        {/* Quick Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleQuickAction(action.id);
              }}
              disabled={isLoading}
              className="flex items-center gap-1 px-2 py-1.5 text-[11px] 
                bg-slate-700/50 text-slate-400 rounded-lg 
                hover:bg-violet-500/20 hover:text-violet-300 
                transition-all duration-200 whitespace-nowrap 
                disabled:opacity-40 disabled:cursor-not-allowed"
              title={action.label}
            >
              <action.icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        
        {/* Input */}
        <div className="flex-1 flex items-center gap-2 bg-slate-700/50 rounded-xl px-3 py-1.5 
          border border-slate-600/30 focus-within:border-violet-500/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask me to write or analyze..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 
              resize-none outline-none min-h-[32px] max-h-[60px]"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSubmit();
            }}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 p-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg 
              hover:from-violet-600 hover:to-purple-700 hover:shadow-lg hover:shadow-violet-500/30
              transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export default AgentChatPanel;
