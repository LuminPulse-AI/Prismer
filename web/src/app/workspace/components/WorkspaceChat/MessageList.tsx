'use client';

/**
 * MessageList
 *
 * Message list component - Supports multiple message types, Agent action display, and interactive components
 */

import React, { memo, useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Reply, FileText, Code, ImageIcon, AtSign, Hash, Copy, Check, RefreshCw } from 'lucide-react';
import { ActionCard } from '@/components/shared/ActionCard';
import { ArtifactPreviewList } from './ArtifactPreviewCard';
import { SiriOrb } from '@/components/ui/siri-orb';
import { useChatStore } from '../../stores/chatStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { AgentThinkingPanel } from './AgentThinkingPanel';
import type { ExtendedChatMessage, MessageContentType } from '../../types';

// Generate unique gradient colors for an Agent
function generateAgentColors(agentId: string): { c1: string; c2: string; c3: string } {
  // Use the hash value of the ID to generate colors
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash) + agentId.charCodeAt(i);
    hash |= 0;
  }
  
  // Predefined set of aesthetically pleasing color schemes
  const colorSchemes = [
    { c1: '#ec4899', c2: '#8b5cf6', c3: '#06b6d4' }, // pink-violet-cyan (default)
    { c1: '#f97316', c2: '#eab308', c3: '#22c55e' }, // orange-yellow-green
    { c1: '#3b82f6', c2: '#8b5cf6', c3: '#ec4899' }, // blue-violet-pink
    { c1: '#14b8a6', c2: '#06b6d4', c3: '#3b82f6' }, // teal-cyan-blue
    { c1: '#f43f5e', c2: '#f97316', c3: '#facc15' }, // rose-orange-yellow
    { c1: '#a855f7', c2: '#ec4899', c3: '#f43f5e' }, // purple-pink-rose
    { c1: '#22c55e', c2: '#14b8a6', c3: '#06b6d4' }, // green-teal-cyan
    { c1: '#6366f1', c2: '#a855f7', c3: '#ec4899' }, // indigo-purple-pink
  ];
  
  const index = Math.abs(hash) % colorSchemes.length;
  return colorSchemes[index];
}

// Agent avatar component - Uses Siri Orb variant
const AgentAvatar = memo(function AgentAvatar({ 
  agentId, 
  size = 36 
}: { 
  agentId: string; 
  size?: number;
}) {
  const colors = useMemo(() => generateAgentColors(agentId), [agentId]);
  
  return (
    <SiriOrb 
      size={`${size}px`}
      colors={colors}
      animationDuration={8}
      className="shadow-md"
    />
  );
});

// Human user avatar component
const UserAvatar = memo(function UserAvatar({ 
  name, 
  avatar,
  size = 36 
}: { 
  name: string;
  avatar?: string;
  size?: number;
}) {
  // Generate colors based on name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  
  const gradients = [
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-rose-500 to-pink-500',
    'from-indigo-500 to-blue-500',
    'from-violet-500 to-purple-500',
  ];
  
  const gradient = gradients[Math.abs(hash) % gradients.length];
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  if (avatar) {
    return (
      <img 
        src={avatar} 
        alt={name}
        className="rounded-full object-cover shadow-md"
        style={{ width: size, height: size }}
      />
    );
  }
  
  return (
    <div 
      className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}
      style={{ width: size, height: size }}
    >
      <span className="text-white font-semibold text-sm">{initials}</span>
    </div>
  );
});

interface MessageListProps {
  messages: ExtendedChatMessage[];
  className?: string;
  onReplyClick?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
  onSuggestionClick?: (suggestion: string) => void;
  /** Whether waiting for Agent response (shows thinking animation) */
  isAgentThinking?: boolean;
}

const SUGGESTION_CHIPS = [
  'Search for papers on...',
  'Help me write LaTeX',
  'Analyze my data',
  'Summarize this paper',
];

// Content type icon
const ContentTypeIcon = ({ type }: { type: MessageContentType }) => {
  const iconClass = 'w-3 h-3';
  switch (type) {
    case 'markdown':
      return <FileText className={iconClass} />;
    case 'code':
      return <Code className={iconClass} />;
    case 'image':
      return <ImageIcon className={iconClass} />;
    default:
      return null;
  }
};

// Process inline markdown (bold, code, links)
function processInline(line: string, lineIndex: number, blockIndex: number, codeColor: string): React.ReactNode[] {
  // Regex pipeline: bold → inline code → links
  let processed: React.ReactNode[] = [];

  // Process bold **text**
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = boldRegex.exec(line)) !== null) {
    if (match.index > lastIndex) processed.push(line.slice(lastIndex, match.index));
    processed.push(<strong key={`b-${lineIndex}-${match.index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < line.length) processed.push(line.slice(lastIndex));
  if (processed.length === 0) processed.push(line);

  // Process inline code `code`
  processed = processed.flatMap((p, pIndex) => {
    if (typeof p !== 'string') return p;
    const codeRegex = /`([^`]+)`/g;
    const result: React.ReactNode[] = [];
    let idx = 0;
    let m;
    while ((m = codeRegex.exec(p)) !== null) {
      if (m.index > idx) result.push(p.slice(idx, m.index));
      result.push(
        <code key={`c-${lineIndex}-${pIndex}-${m.index}`} className={`px-1 py-0.5 rounded text-xs font-mono ${codeColor}`}>
          {m[1]}
        </code>
      );
      idx = m.index + m[0].length;
    }
    if (idx < p.length) result.push(p.slice(idx));
    return result.length > 0 ? result : [p];
  });

  // Process links [text](url)
  processed = processed.flatMap((p, pIndex) => {
    if (typeof p !== 'string') return p;
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const result: React.ReactNode[] = [];
    let idx = 0;
    let m;
    while ((m = linkRegex.exec(p)) !== null) {
      if (m.index > idx) result.push(p.slice(idx, m.index));
      result.push(
        <a key={`l-${lineIndex}-${pIndex}-${m.index}`} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
          {m[1]}
        </a>
      );
      idx = m.index + m[0].length;
    }
    if (idx < p.length) result.push(p.slice(idx));
    return result.length > 0 ? result : [p];
  });

  return processed;
}

// Markdown renderer with headers, lists, links, code blocks
function renderMarkdown(text: string, isUser: boolean): React.ReactNode {
  const codeColor = isUser ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-800';

  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    // Code block
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\w+\n/, '');
      return (
        <pre key={index} className="my-2 p-2 rounded bg-slate-800 text-slate-200 text-xs font-mono overflow-x-auto max-w-full whitespace-pre-wrap break-words break-all">
          {code}
        </pre>
      );
    }

    // Process block-level elements line by line
    const lines = part.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushList = () => {
      if (listItems.length > 0 && listType) {
        const Tag = listType;
        elements.push(
          <Tag key={`list-${index}-${elements.length}`} className={`my-1 pl-4 ${listType === 'ul' ? 'list-disc' : 'list-decimal'} text-sm`}>
            {listItems}
          </Tag>
        );
        listItems = [];
        listType = null;
      }
    };

    lines.forEach((line, lineIndex) => {
      // Headers
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch) {
        flushList();
        const level = headerMatch[1].length;
        const cls = level === 1 ? 'text-base font-bold mt-2 mb-1' : level === 2 ? 'text-sm font-semibold mt-1.5 mb-0.5' : 'text-sm font-medium mt-1 mb-0.5';
        elements.push(
          <div key={`h-${index}-${lineIndex}`} className={cls}>
            {processInline(headerMatch[2], lineIndex, index, codeColor)}
          </div>
        );
        return;
      }

      // Unordered list items
      const ulMatch = line.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== 'ul') flushList();
        listType = 'ul';
        listItems.push(<li key={`li-${index}-${lineIndex}`}>{processInline(ulMatch[1], lineIndex, index, codeColor)}</li>);
        return;
      }

      // Ordered list items
      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== 'ol') flushList();
        listType = 'ol';
        listItems.push(<li key={`li-${index}-${lineIndex}`}>{processInline(olMatch[1], lineIndex, index, codeColor)}</li>);
        return;
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        flushList();
        elements.push(<hr key={`hr-${index}-${lineIndex}`} className="my-2 border-current/20" />);
        return;
      }

      // Regular text
      flushList();
      const inline = processInline(line, lineIndex, index, codeColor);
      elements.push(
        <span key={`line-${index}-${lineIndex}`}>
          {inline}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      );
    });

    flushList();
    return <React.Fragment key={index}>{elements}</React.Fragment>;
  });
}

// Render message content
const MessageContent = memo(function MessageContent({ 
  content, 
  contentType,
  isUser,
}: { 
  content: string; 
  contentType: MessageContentType;
  isUser: boolean;
}) {
  if (contentType === 'code') {
    return (
      <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto max-w-full">
        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
          {content}
        </pre>
      </div>
    );
  }

  if (contentType === 'image') {
    return (
      <div className="rounded-lg overflow-hidden max-w-[280px]">
        <img 
          src={content} 
          alt="Shared image" 
          className="w-full h-auto"
          loading="lazy"
        />
      </div>
    );
  }

  // text / markdown — break-words prevents long lines (e.g. LaTeX) from overflowing the bubble
  return (
    <div className={`text-sm leading-relaxed break-words break-all ${isUser ? 'text-white' : 'text-slate-900'}`}>
      {renderMarkdown(content, isUser)}
    </div>
  );
});

// Reference tag
const ReferenceTag = memo(function ReferenceTag({ 
  reference 
}: { 
  reference: string 
}) {
  const isAt = reference.startsWith('@');
  const isHash = reference.startsWith('#');
  const label = reference.replace(/^[@#]/, '');

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-xs font-medium">
      {isAt && <AtSign className="w-3 h-3" />}
      {isHash && <Hash className="w-3 h-3" />}
      {label}
    </span>
  );
});

// Message action toolbar (copy, retry) — appears on hover
const MessageToolbar = memo(function MessageToolbar({
  message,
  onRetry,
}: {
  message: ExtendedChatMessage;
  onRetry?: (messageId: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const isUser = message.senderType === 'user';

  return (
    <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 ${isUser ? 'justify-end' : ''}`}>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
        title={copied ? 'Copied!' : 'Copy'}
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      {message.senderType === 'agent' && onRetry && (
        <button
          type="button"
          onClick={() => onRetry(message.id)}
          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
          title="Retry"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

// Single message bubble
const MessageBubble = memo(function MessageBubble({
  message,
  onReplyClick,
  onRetry,
}: {
  message: ExtendedChatMessage;
  onReplyClick?: (messageId: string) => void;
  onRetry?: (messageId: string) => void;
}) {
  const isUser = message.senderType === 'user';
  const isAgent = message.senderType === 'agent';
  const isError = message.metadata?.isError === true;

  return (
    <div
      data-testid="chat-message"
      data-sender-type={message.senderType}
      className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${isAgent ? 'agent-message' : 'user-message'}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isAgent ? (
          <AgentAvatar agentId={message.senderId} size={36} />
        ) : (
          <UserAvatar
            name={message.senderName}
            avatar={message.senderAvatar}
            size={36}
          />
        )}
      </div>

      {/* Content — min-w-0 prevents bubble from overflowing parent width */}
      <div className={`flex-1 min-w-0 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {/* Sender info */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
          <span data-testid="sender-name" className="text-xs font-medium text-slate-600">
            {message.senderName}
          </span>
          {message.contentType !== 'text' && (
            <span className="text-slate-400">
              <ContentTypeIcon type={message.contentType} />
            </span>
          )}
        </div>

        {/* Reply indicator */}
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onReplyClick?.(message.replyTo!)}
            className={`
              flex items-center gap-1 text-xs text-slate-500 mb-1
              hover:text-violet-600 transition-colors
              ${isUser ? 'justify-end' : ''}
            `}
          >
            <Reply className="w-3 h-3" />
            <span>Reply to message</span>
          </button>
        )}

        {/* References */}
        {message.references && message.references.length > 0 && (
          <div className={`flex flex-wrap gap-1 mb-2 ${isUser ? 'justify-end' : ''}`}>
            {message.references.map((ref, idx) => (
              <ReferenceTag key={idx} reference={ref} />
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div
          data-testid="message-content"
          className={`
            inline-block max-w-full px-4 py-2.5 rounded-2xl
            break-words break-all
            ${isError
              ? 'bg-red-50 text-red-800 border border-red-200 rounded-tl-md'
              : isUser
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-tr-md'
                : 'bg-slate-100 text-slate-900 rounded-tl-md'
            }
          `}
        >
          <MessageContent
            content={message.content}
            contentType={message.contentType}
            isUser={isUser}
          />
        </div>

        {/* Timestamp + Toolbar */}
        <div className={`flex items-center gap-2 mt-1 ${isUser ? 'justify-end flex-row-reverse' : ''}`}>
          <span className="text-xs text-slate-400">
            {new Date(message.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <MessageToolbar message={message} onRetry={onRetry} />
        </div>

        {/* Agent Actions */}
        {message.actions && message.actions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                variant="light"
              />
            ))}
          </div>
        )}

        {/* Artifact Preview Cards */}
        {message.artifacts && message.artifacts.length > 0 && (
          <ArtifactPreviewList artifacts={message.artifacts} />
        )}

        {/* Interactive Components are now rendered in ActionBar above input */}
      </div>
    </div>
  );
});

// Session boundary divider
const SessionBoundary = memo(function SessionBoundary({
  sessionId,
  title,
  timestamp,
}: {
  sessionId: string;
  title: string;
  timestamp: string;
}) {
  const dateStr = new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div id={`session-boundary-${sessionId}`} className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-slate-200" />
      <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
        {title} &middot; {dateStr}
      </span>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
});

export const MessageList = memo(function MessageList({
  messages,
  className = '',
  onReplyClick,
  onRetry,
  onSuggestionClick,
  isAgentThinking = false,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(messages.length);
  const thinkingStatus = useChatStore((s) => s.thinkingStatus);
  const thinkingContent = useChatStore((s) => s.thinkingContent);
  const currentToolCall = useChatStore((s) => s.currentToolCall);
  const toolCallHistory = useChatStore((s) => s.toolCallHistory);
  const visibleMessageBound = useChatStore((s) => s.visibleMessageBound);
  const isViewingHistory = visibleMessageBound !== null;

  // Auto-scroll to bottom (only on new messages or when thinking starts)
  useEffect(() => {
    if ((messages.length > prevLengthRef.current || isAgentThinking) && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length, isAgentThinking]);

  if (messages.length === 0 && !isAgentThinking) {
    return (
      <div className={`flex flex-col items-center justify-center text-slate-400 gap-4 ${className}`}>
        <SiriOrb size="56px" animationDuration={12} className="opacity-50" />
        <span className="text-sm font-medium text-slate-500">How can I help with your research?</span>
        {onSuggestionClick && (
          <div className="flex flex-wrap gap-2 max-w-[280px] justify-center">
            {SUGGESTION_CHIPS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-violet-50 text-xs text-slate-600 hover:text-violet-700 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const handleExitHistory = useCallback(() => {
    useTimelineStore.getState().exitHistoryView();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto px-4 py-4 space-y-5 ${className}`}
      style={{ scrollbarWidth: 'thin' }}
    >
      {/* History view banner */}
      {isViewingHistory && (
        <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-700">
          <span>Viewing historical state</span>
          <button
            type="button"
            onClick={handleExitHistory}
            className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-800 font-medium transition-colors"
          >
            Return to latest
          </button>
        </div>
      )}

      {messages.map((message, index) => {
        const isFutureMessage = visibleMessageBound !== null && index >= visibleMessageBound;

        // Session boundary divider
        if (message.metadata?.isSessionBoundary) {
          return (
            <div key={message.id} className={isFutureMessage ? 'opacity-30 select-none [&_button]:pointer-events-none [&_a]:pointer-events-none' : ''}>
              <SessionBoundary
                sessionId={message.metadata.sessionId as string}
                title={message.metadata.sessionTitle as string}
                timestamp={message.timestamp}
              />
            </div>
          );
        }

        return (
          <div key={message.id} className={isFutureMessage ? 'opacity-30 select-none [&_button]:pointer-events-none [&_a]:pointer-events-none' : ''}>
            <MessageBubble
              message={message}
              onReplyClick={onReplyClick}
              onRetry={onRetry}
            />
          </div>
        );
      })}
      {isAgentThinking && (
        <AgentThinkingPanel
          statusText={thinkingStatus}
          thinkingContent={thinkingContent}
          currentToolCall={currentToolCall}
          toolCallHistory={toolCallHistory}
        />
      )}
    </div>
  );
});

export default MessageList;
