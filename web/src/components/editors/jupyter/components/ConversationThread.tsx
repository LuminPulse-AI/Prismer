'use client';

/**
 * ConversationThread - AI Conversation Thread Component
 *
 * Features:
 * - Displays alternating User Queries and Agent Responses
 * - Supports context-aware conversation for specific cells
 * - Markdown rendering
 */

import React, { memo, useRef, useEffect } from 'react';
import { User, Bot, Code2, ExternalLink } from 'lucide-react';
import { AgentCell } from './AgentCell';
import type { AgentCell as AgentCellType } from '../types';

// ============================================================
// Type Definitions
// ============================================================

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  contextCellId?: string;
}

interface ConversationThreadProps {
  messages: ConversationMessage[];
  agentResponses: AgentCellType[];
  onExecuteCode?: (code: string) => void;
  onInsertCode?: (code: string) => void;
  onGoToCell?: (cellId: string) => void;
  className?: string;
}

// ============================================================
// ConversationThread Component
// ============================================================

export const ConversationThread = memo(function ConversationThread({
  messages,
  agentResponses,
  onExecuteCode,
  onInsertCode,
  onGoToCell,
  className = '',
}: ConversationThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, agentResponses]);

  // Merge messages and Agent responses (sorted by time)
  const mergedItems = React.useMemo(() => {
    const items: Array<{
      type: 'message' | 'agent';
      data: ConversationMessage | AgentCellType;
      timestamp: string;
    }> = [];

    messages.forEach(msg => {
      items.push({
        type: 'message',
        data: msg,
        timestamp: msg.timestamp,
      });
    });

    agentResponses.forEach(response => {
      items.push({
        type: 'agent',
        data: response,
        timestamp: response.createdAt,
      });
    });

    // Sort by time
    items.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return items;
  }, [messages, agentResponses]);

  if (mergedItems.length === 0) {
    return (
      <div className={`p-4 text-center text-stone-500 text-sm ${className}`}>
        Start a conversation with AI assistant
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`space-y-3 overflow-auto ${className}`}
    >
      {mergedItems.map((item, index) => {
        if (item.type === 'message') {
          const msg = item.data as ConversationMessage;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              onGoToCell={onGoToCell}
            />
          );
        } else {
          const response = item.data as AgentCellType;
          return (
            <AgentCell
              key={response.id}
              cell={response}
              onExecuteCode={onExecuteCode}
              onInsertCode={onInsertCode}
            />
          );
        }
      })}
    </div>
  );
});

// ============================================================
// MessageBubble Component
// ============================================================

interface MessageBubbleProps {
  message: ConversationMessage;
  onGoToCell?: (cellId: string) => void;
}

const MessageBubble = memo(function MessageBubble({
  message,
  onGoToCell,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Bot size={16} className="text-white" />
        </div>
      )}

      {/* Content */}
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-stone-50 text-stone-700'
        }`}
      >
        {/* Context Cell Indicator */}
        {message.contextCellId && (
          <button
            onClick={() => onGoToCell?.(message.contextCellId!)}
            className={`flex items-center gap-1 text-xs mb-1 ${
              isUser ? 'text-blue-200' : 'text-stone-500'
            } hover:underline`}
          >
            <Code2 size={10} />
            <span>Cell {message.contextCellId.slice(0, 6)}...</span>
            <ExternalLink size={10} />
          </button>
        )}

        {/* Message Content */}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>

        {/* Timestamp */}
        <div
          className={`text-xs mt-1 ${
            isUser ? 'text-blue-200' : 'text-stone-500'
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* User Avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-stone-600" />
        </div>
      )}
    </div>
  );
});

export default ConversationThread;
