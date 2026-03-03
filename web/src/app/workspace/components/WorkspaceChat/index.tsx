'use client';

/**
 * WorkspaceChat - Workspace Chat Panel
 *
 * @description
 * Provides a complete research conversation interface, including:
 * - Header: Agent status indicator, participant info
 * - MessageList: Message display and interaction
 * - TaskPanel: Task panel (collapsible)
 * - ActionBar: Quick action bar
 * - ChatInput: Message input box
 *
 * Agent integration:
 * - Displays current Agent running status via AgentStatusBadge
 * - State changes provide immediate visual feedback
 *
 * @example
 * ```tsx
 * <WorkspaceChat
 *   isExpanded={true}
 *   onClose={handleClose}
 *   width={400}
 *   messages={messages}
 *   participants={participants}
 *   onSendMessage={handleSend}
 * />
 * ```
 */

import React, { memo, useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Package, History, Plus, MessageSquare } from 'lucide-react';
import { TaskPanel } from '../TaskPanel';
import { MessageList } from './MessageList';
import { ActionBar } from './ActionBar';
import { ChatInput } from './ChatInput';
import { SiriOrb } from '@/components/ui/siri-orb';
import { AgentStatusBadge } from '../AgentStatusBadge';
import { SkillManagerDialog } from '../SkillManager';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useChatStore } from '../../stores/chatStore';
import type { ChatSession } from '../../stores/chatStore';
import type { Task, ExtendedChatMessage, Participant, TaskPanelHeight, InteractionEvent } from '../../types';

interface WorkspaceChatProps {
  workspaceId?: string;
  isExpanded: boolean;
  onClose: () => void;
  width: number;

  // TaskPanel
  taskPanelHeight: TaskPanelHeight;
  onTaskPanelHeightChange: (height: TaskPanelHeight) => void;
  tasks: Task[];
  activeTaskId: string | null;
  onTaskClick: (taskId: string) => void;

  // Chat
  messages: ExtendedChatMessage[];
  participants: Participant[];
  onSendMessage: (content: string, mentions?: string[], references?: string[]) => void;
  onInteraction?: (event: InteractionEvent) => void;
  onRetry?: (messageId: string) => void;

  /** Callback to start a new chat session (clears context) */
  onNewSession?: () => void;

  /** When true, chat input is disabled (agent not connected) */
  disabled?: boolean;

  /** When true, show agent "thinking" animation (waiting for response) */
  isAgentThinking?: boolean;

  className?: string;
}

export const WorkspaceChat = memo(function WorkspaceChat({
  workspaceId,
  isExpanded,
  onClose,
  width,
  taskPanelHeight,
  onTaskPanelHeightChange,
  tasks,
  activeTaskId,
  onTaskClick,
  messages,
  participants,
  onSendMessage,
  onInteraction,
  onRetry,
  onNewSession,
  disabled = false,
  isAgentThinking = false,
  className = '',
}: WorkspaceChatProps) {
  const [skillManagerOpen, setSkillManagerOpen] = useState(false);
  const [sessionPopoverOpen, setSessionPopoverOpen] = useState(false);
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const startNewSession = useChatStore((s) => s.startNewSession);
  const switchToSession = useChatStore((s) => s.switchToSession);
  const computeSessions = useChatStore((s) => s.computeSessions);

  // Compute sessions from messages on mount and when messages change
  useEffect(() => {
    computeSessions();
  }, [messages.length, computeSessions]);

  const handleNewSession = useCallback(() => {
    startNewSession();
    onNewSession?.();
    setSessionPopoverOpen(false);
  }, [startNewSession, onNewSession]);

  const handleSwitchSession = useCallback((sessionId: string) => {
    switchToSession(sessionId);
    setSessionPopoverOpen(false);
  }, [switchToSession]);

  // Scroll to the replied message
  const handleReplyClick = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-violet-50');
      setTimeout(() => element.classList.remove('bg-violet-50'), 2000);
    }
  }, []);

  // Handle interaction events
  const handleInteraction = useCallback((event: InteractionEvent) => {
    onInteraction?.(event);
  }, [onInteraction]);

  if (!isExpanded) return null;

  return (
    <motion.div
      initial={{ x: -width, opacity: 0, scale: 0.98 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: -width, opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{ width }}
      className={`
        flex flex-col h-full
        bg-white rounded-2xl shadow-md
        border-r border-slate-200
        overflow-hidden
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-3">
          <SiriOrb
            size="36px"
            animationDuration={12}
            className="shadow-lg"
          />
          <div>
            <h2 className="font-semibold text-slate-900">Research Chat</h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <AgentStatusBadge size="sm" />
              {sessions.length > 0 && (
                <>
                  <span className="text-slate-300">&middot;</span>
                  <span className="truncate max-w-[120px]">
                    {sessions.find((s: ChatSession) => s.id === activeSessionId)?.title || 'Session'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Popover open={sessionPopoverOpen} onOpenChange={setSessionPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                aria-label="Session history"
                title="Session History"
              >
                <History className="w-4 h-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <div className="p-2 border-b border-slate-100">
                <button
                  type="button"
                  onClick={handleNewSession}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-violet-50 text-sm text-violet-600 font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Session
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto py-1" style={{ scrollbarWidth: 'thin' }}>
                {sessions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">No sessions yet</div>
                ) : (
                  [...sessions].reverse().map((session: ChatSession) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => handleSwitchSession(session.id)}
                      className={`
                        flex items-start gap-2 w-full px-3 py-2.5 text-left transition-colors
                        ${session.id === activeSessionId ? 'bg-violet-50' : 'hover:bg-slate-50'}
                      `}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${session.id === activeSessionId ? 'text-violet-500' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm truncate ${session.id === activeSessionId ? 'font-medium text-violet-700' : 'text-slate-700'}`}>
                          {session.title}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-slate-400">
                            {new Date(session.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-xs text-slate-300">&middot;</span>
                          <span className="text-xs text-slate-400">
                            {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {session.preview && (
                          <div className="text-xs text-slate-400 truncate mt-0.5">{session.preview}</div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={() => setSkillManagerOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="Manage skills"
            title="Manage Skills"
          >
            <Package className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="Collapse chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Skill Manager Dialog */}
      <SkillManagerDialog
        open={skillManagerOpen}
        onOpenChange={setSkillManagerOpen}
        workspaceId={workspaceId}
      />

      {/* MessageList */}
      <MessageList
        messages={messages}
        className="flex-1 min-h-0"
        onReplyClick={handleReplyClick}
        onRetry={onRetry}
        onSuggestionClick={onSendMessage ? (s) => onSendMessage(s) : undefined}
        isAgentThinking={isAgentThinking}
      />

      {/* Bottom area: TaskPanel + ActionBar + Input - all as rounded cards */}
      <div className="flex flex-col gap-2 p-4 bg-slate-50/50">
        {/* TaskPanel - rounded card */}
        <TaskPanel
          height={taskPanelHeight}
          onHeightChange={onTaskPanelHeightChange}
          tasks={tasks}
          activeTaskId={activeTaskId}
          onTaskClick={onTaskClick}
          isCard={true}
        />

        {/* ActionBar */}
        <ActionBar
          messages={messages}
          onInteraction={handleInteraction}
        />

        {/* Not connected banner */}
        {disabled && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700">
            <AgentStatusBadge size="sm" />
            <span className="flex-1">Agent is not connected</span>
          </div>
        )}

        {/* ChatInput */}
        <ChatInput
          onSend={onSendMessage}
          participants={participants}
          disabled={disabled}
          placeholder={disabled ? 'Start the agent to chat...' : undefined}
        />
      </div>
    </motion.div>
  );
});

export default WorkspaceChat;
