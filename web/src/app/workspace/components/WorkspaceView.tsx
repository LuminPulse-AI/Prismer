'use client';

/**
 * WorkspaceView
 *
 * Main workspace view.
 * Layout: Chat Panel (left) + Window Viewer (right).
 * When chat is collapsed, SiriOrb + task bubble appear in bottom-left of the window.
 * Supports drag-to-resize for Chat Panel width.
 *
 * Communication architecture:
 * useContainerChat → Bridge API → Container Gateway → OpenClaw Agent
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCurrentTask, useActiveDiff } from '../stores';
import { useTaskStore } from '../stores/taskStore';
import { useChatStore } from '../stores/chatStore';
import { useTimelineStore } from '../stores/timelineStore';
import { useComponentStore } from '../stores/componentStore';
import { useLayoutStore } from '../stores/layoutStore';
import { WorkspaceChat } from './WorkspaceChat';
import { WindowViewer } from './WindowViewer';
import { useContainerChat } from '../hooks/useContainerChat';
import { useHealthMonitor } from '../hooks/useHealthMonitor';
import { useAgentInstanceStore, useWorkspaceReadiness } from '../stores/agentInstanceStore';
import { WorkspaceReadinessGate } from './WorkspaceReadinessGate';
import { setComponentEventForwarder } from '@/lib/sync/componentEventForwarder';
import { initComponentDbPersistence } from '@/lib/sync/componentStateBridge';
import { executeDirectives, initializeWorkspace } from '../stores/syncActions';
import { useDirectiveStream } from '../hooks/useDirectiveStream';
import { useNotesAutoSave } from '../hooks/useNotesAutoSave';
import { WorkspaceContext } from './WorkspaceContext';
import { createLogger, generateCorrelationId } from '@/lib/logger';
import type { InteractionEvent, ExtendedTimelineEvent, UIDirective } from '../types';
import type { ConnectionStatus } from './ConnectionIndicator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { SkillManagerDialog } from './SkillManager';
import { AgentControlPanel } from './AgentControlPanel';

const log = createLogger('WorkspaceView');

interface WorkspaceViewProps {
  workspaceId: string;
  workspaceName?: string;
}

interface WorkspaceSummary {
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  status: 'active' | 'archived';
}

export default function WorkspaceView({ workspaceId, workspaceName }: WorkspaceViewProps) {
  const router = useRouter();
  // Read query parameters
  const searchParams = useSearchParams();
  const documentIdFromUrl = searchParams.get('documentId');

  // Layout store
  const chatExpanded = useLayoutStore((s) => s.chatExpanded);
  const chatPanelWidth = useLayoutStore((s) => s.chatPanelWidth);
  const taskPanelHeight = useLayoutStore((s) => s.taskPanelHeight);
  const toggleChat = useLayoutStore((s) => s.toggleChat);
  const setTaskPanelHeight = useLayoutStore((s) => s.setTaskPanelHeight);
  const setChatPanelWidth = useLayoutStore((s) => s.setChatPanelWidth);

  // Chat store
  const messages = useChatStore((s) => s.messages);
  const participants = useChatStore((s) => s.participants);
  const addMessage = useChatStore((s) => s.addMessage);

  // Task store
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const setActiveTaskId = useTaskStore((s) => s.setActiveTaskId);

  // Component store
  const activeComponent = useComponentStore((s) => s.activeComponent);
  const setActiveComponent = useComponentStore((s) => s.setActiveComponent);
  const clearDiff = useComponentStore((s) => s.clearDiff);
  const activeDiff = useActiveDiff();

  // Timeline store
  const timeline = useTimelineStore((s) => s.timeline);
  const currentTimelinePosition = useTimelineStore((s) => s.currentTimelinePosition);
  const isTimelinePlaying = useTimelineStore((s) => s.isTimelinePlaying);
  const seekTimeline = useTimelineStore((s) => s.seekTimeline);
  const playTimeline = useTimelineStore((s) => s.playTimeline);
  const pauseTimeline = useTimelineStore((s) => s.pauseTimeline);
  const restoreSnapshot = useTimelineStore((s) => s.restoreSnapshot);

  // ==================== Initialization: workspace-level store isolation ====================
  const hasInitRef = useRef(false);
  const prevWorkspaceIdRef = useRef(workspaceId);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'skills' | 'config' | 'logs' | 'workspaces'>('skills');
  const [agentLogs, setAgentLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceSummary[]>([]);
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [workspacesError, setWorkspacesError] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('');
  const [createWorkspaceLoading, setCreateWorkspaceLoading] = useState(false);
  const [deletingWorkspaceId, setDeletingWorkspaceId] = useState<string | null>(null);
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState(workspaceName || workspaceId);

  useEffect(() => {
    setCurrentWorkspaceName(workspaceName || workspaceId);
  }, [workspaceId, workspaceName]);

  useEffect(() => {
    if (!hasInitRef.current && workspaceId) {
      hasInitRef.current = true;
      log.info('Initializing workspace', { workspaceId, documentIdFromUrl });
      setIsInitializing(true);
      initializeWorkspace(workspaceId).then(() => {
        setIsInitializing(false);
        log.info('Workspace initialized', { workspaceId });
      });
    }
  }, [workspaceId, documentIdFromUrl]);

  // Handle workspace switch (soft navigation between workspaces)
  useEffect(() => {
    if (prevWorkspaceIdRef.current !== workspaceId && hasInitRef.current) {
      const previousWorkspaceId = prevWorkspaceIdRef.current;
      prevWorkspaceIdRef.current = workspaceId;
      log.info('Workspace switched', { from: previousWorkspaceId, to: workspaceId });
      setIsInitializing(true);
      initializeWorkspace(workspaceId).then(() => {
        setIsInitializing(false);
      });
    }
  }, [workspaceId]);

  // ==================== Component Event Forwarder ====================
  useEffect(() => {
    // Wire component events to be forwarded to agent server via Bridge API
    setComponentEventForwarder((component, eventType, data) => {
      if (workspaceId) {
        log.debug('Forwarding component event', { component, eventType });
        fetch(`/api/v2/im/bridge/${workspaceId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `[component_event] ${component}:${eventType}`,
            metadata: { component, eventType, data, isSystemEvent: true },
          }),
        }).catch((err) => {
          log.warn('Failed to forward component event', { component, eventType, error: err.message });
        });
      }
    });
    return () => setComponentEventForwarder(null);
  }, [workspaceId]);

  // ==================== Component DB Persistence ====================
  useEffect(() => {
    if (workspaceId) {
      const cleanup = initComponentDbPersistence(workspaceId);
      return cleanup;
    }
  }, [workspaceId]);

  // ==================== Agent Lifecycle ====================
  const fetchAgentBinding = useAgentInstanceStore((s) => s.fetchAgentBinding);
  const ensureAgentForWorkspace = useAgentInstanceStore((s) => s.ensureAgentForWorkspace);
  const startAgentInstance = useAgentInstanceStore((s) => s.startAgentInstance);
  const agentInstanceId = useAgentInstanceStore((s) => s.agentInstanceId);
  const agentInstanceStatus = useAgentInstanceStore((s) => s.agentInstanceStatus);
  const agentInstanceError = useAgentInstanceStore((s) => s.agentInstanceError);
  const agentLoading = useAgentInstanceStore((s) => s._loading);

  // Fetch agent binding on mount
  useEffect(() => {
    if (workspaceId) {
      fetchAgentBinding(workspaceId);
    }
  }, [workspaceId, fetchAgentBinding]);

  // If no agent found after fetch, try to ensure one exists
  useEffect(() => {
    if (
      workspaceId &&
      !agentLoading &&
      !agentInstanceId &&
      agentInstanceStatus === 'idle'
    ) {
      ensureAgentForWorkspace(workspaceId);
    }
  }, [workspaceId, agentLoading, agentInstanceId, agentInstanceStatus, ensureAgentForWorkspace]);

  // ==================== Auto-start + Readiness Gate ====================
  const autostartCalled = useRef(false);
  const [gateDismissed, setGateDismissed] = useState(false);
  const { isReady } = useWorkspaceReadiness();

  // Single-workspace mode: auto-start the bound agent whenever it is not running.
  useEffect(() => {
    if (
      !autostartCalled.current &&
      agentInstanceId &&
      (agentInstanceStatus === 'idle' || agentInstanceStatus === 'stopped' || agentInstanceStatus === 'error')
    ) {
      autostartCalled.current = true;
      log.info('Auto-starting agent', { workspaceId, agentInstanceId });
      startAgentInstance();
    }
  }, [agentInstanceId, agentInstanceStatus, startAgentInstance, workspaceId]);

  useEffect(() => {
    if (agentInstanceStatus === 'starting' || agentInstanceStatus === 'running') {
      autostartCalled.current = false;
    }
  }, [agentInstanceStatus]);

  // Universal readiness gate: show whenever workspace isn't ready unless dismissed
  const showReadinessGate = !isReady && !gateDismissed;

  // Whether editors/chat should be disabled while agent is not ready
  const workspaceDisabled = !isReady && !gateDismissed;

  const handleDismissGate = useCallback(() => {
    setGateDismissed(true);
  }, []);

  const loadWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true);
    setWorkspacesError(null);
    try {
      const response = await fetch('/api/workspace?limit=100');
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load workspaces');
      }

      const items = Array.isArray(result.data) ? result.data as WorkspaceSummary[] : [];
      setWorkspaceItems(items);
    } catch (error) {
      setWorkspacesError(error instanceof Error ? error.message : 'Failed to load workspaces');
    } finally {
      setWorkspacesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSettingsOpen && activeSettingsTab === 'workspaces') {
      loadWorkspaces();
    }
  }, [activeSettingsTab, isSettingsOpen, loadWorkspaces]);

  const handleCreateWorkspace = useCallback(async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;

    setCreateWorkspaceLoading(true);
    setWorkspacesError(null);
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newWorkspaceDescription.trim() || undefined,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success || !result.data?.id) {
        throw new Error(result.error || 'Failed to create workspace');
      }

      setNewWorkspaceName('');
      setNewWorkspaceDescription('');
      setIsSettingsOpen(false);
      router.push(`/workspace/${result.data.id}`);
      router.refresh();
    } catch (error) {
      setWorkspacesError(error instanceof Error ? error.message : 'Failed to create workspace');
    } finally {
      setCreateWorkspaceLoading(false);
    }
  }, [newWorkspaceDescription, newWorkspaceName, router]);

  const handleOpenWorkspace = useCallback((id: string) => {
    if (!id || id === workspaceId) return;
    setIsSettingsOpen(false);
    router.push(`/workspace/${id}`);
    router.refresh();
  }, [router, workspaceId]);

  const handleDeleteWorkspace = useCallback(async (id: string) => {
    if (!id) return;
    const target = workspaceItems.find((item) => item.id === id);
    const confirmed = window.confirm(`Delete workspace "${target?.name || id}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingWorkspaceId(id);
    setWorkspacesError(null);
    try {
      const response = await fetch(`/api/workspace/${id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete workspace');
      }

      if (id === workspaceId) {
        const nextWorkspaceId = result.data?.nextWorkspaceId as string | null | undefined;
        setIsSettingsOpen(false);
        router.push(nextWorkspaceId ? `/workspace/${nextWorkspaceId}` : '/workspace');
        router.refresh();
        return;
      }

      await loadWorkspaces();
    } catch (error) {
      setWorkspacesError(error instanceof Error ? error.message : 'Failed to delete workspace');
    } finally {
      setDeletingWorkspaceId(null);
    }
  }, [loadWorkspaces, router, workspaceId, workspaceItems]);

  // ==================== Container Chat (sole communication path) ====================
  const {
    connectionStatus: containerConnectionStatus,
    isConnected: isContainerConnected,
    isAgentAvailable: isContainerAgentAvailable,
    sendMessage: sendContainerMessage,
    checkStatus: checkContainerStatus,
    error: containerError,
    isWaitingForResponse: isAgentThinking,
  } = useContainerChat({
    workspaceId,
    enabled:
      agentInstanceStatus === 'running' ||
      agentInstanceStatus === 'idle' ||
      agentInstanceStatus === 'stopped' ||
      agentInstanceStatus === 'error',
    onAgentResponse: (msg) => {
      log.info('Agent response received', {
        contentLength: msg.content?.length || 0,
        preview: msg.content?.substring(0, 80),
        directiveCount: msg.uiDirectives?.length || 0,
        hasTasks: !!msg.metadata?.tasks,
      });
      // Process any UIDirectives embedded in the response.
      // Skip if directives were already executed in the SSE stream handler
      // (useContainerChat now executes them immediately on message_complete).
      // Only execute here as fallback when using non-SSE (JSON) responses.
      if (msg.uiDirectives && msg.uiDirectives.length > 0) {
        const alreadyExecutedInStream = msg.metadata?.executedInStream as boolean | undefined;
        if (!alreadyExecutedInStream) {
          log.info('Executing UI directives from onAgentResponse', {
            count: msg.uiDirectives.length,
            types: msg.uiDirectives.map((d) => d.type),
          });
          executeDirectives(msg.uiDirectives as UIDirective[]);
        } else {
          log.info('Skipping directive execution (already handled in SSE stream)', {
            count: msg.uiDirectives.length,
          });
        }
      }
      // Process tasks extracted from agent response
      if (msg.metadata?.tasks && Array.isArray(msg.metadata.tasks)) {
        const taskStoreState = useTaskStore.getState();
        for (const taskData of msg.metadata.tasks as Array<{ title: string; subtasks?: Array<{ title: string }> }>) {
          const taskId = `agent-task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          taskStoreState.addTask({
            id: taskId,
            title: taskData.title,
            status: 'pending',
            progress: 0,
            subtasks: taskData.subtasks?.map((st, i) => ({
              id: `${taskId}-sub-${i}`,
              parentId: taskId,
              title: st.title,
              status: 'pending' as const,
            })),
          });
          log.info('Task created from agent response', { taskId, title: taskData.title });
        }
      }
    },
  });

  // Track connection time for duration display
  const [connectedAt, setConnectedAt] = useState<Date | undefined>();
  useEffect(() => {
    if (isContainerConnected) {
      setConnectedAt(new Date());
      log.info('Container connected', { workspaceId, gatewayUrl: undefined });
    } else {
      setConnectedAt(undefined);
      if (containerConnectionStatus === 'error') {
        log.warn('Container connection lost', { workspaceId, error: containerError });
      }
    }
  }, [isContainerConnected, containerConnectionStatus, containerError, workspaceId]);

  // Map container + agent status to connection status indicator
  // Bridge status is the primary source of truth — it checks actual gateway reachability
  const connectionStatus: ConnectionStatus = useMemo(() => {
    if (agentInstanceStatus === 'starting') return 'connecting';
    // Bridge status takes priority over store status
    if (isContainerConnected) return 'connected';
    if (containerConnectionStatus === 'error') return 'error';
    if (containerConnectionStatus === 'connecting') return 'connecting';
    if (agentInstanceStatus === 'error') return 'error';
    return 'disconnected';
  }, [agentInstanceStatus, isContainerConnected, containerConnectionStatus]);

  // ==================== Health Monitoring (periodic, 60s) ====================
  useHealthMonitor();

  // ==================== Directive SSE Stream (real-time plugin → frontend) ====================
  useDirectiveStream();

  // ==================== Notes Auto-Save (5s periodic to collection) ====================
  useNotesAutoSave();

  // ==================== Bridge Retry on Agent Start ====================
  // Gateway proxy may need time to initialize after container start
  const bridgeRetryDoneRef = useRef(false);
  useEffect(() => {
    if (agentInstanceStatus === 'running' && agentInstanceId && !bridgeRetryDoneRef.current) {
      bridgeRetryDoneRef.current = true;
      const timers: ReturnType<typeof setTimeout>[] = [];

      for (const delay of [2000, 5000, 10000]) {
        timers.push(setTimeout(() => {
          if (!isContainerConnected) {
            log.info('Bridge retry check', { delay, agentInstanceId });
            checkContainerStatus();
          }
        }, delay));
      }

      return () => timers.forEach(clearTimeout);
    }
    if (agentInstanceStatus !== 'running') {
      bridgeRetryDoneRef.current = false;
    }
  }, [agentInstanceStatus, agentInstanceId, isContainerConnected, checkContainerStatus]);

  // Handle initial document loading from URL parameters (for Assets → Workspace flow)
  useEffect(() => {
    if (documentIdFromUrl) {
      log.info('Loading document from URL', { documentId: documentIdFromUrl });
      setActiveComponent('pdf-reader');
      useComponentStore.getState().updateComponentState('pdf-reader', {
        documentId: documentIdFromUrl,
        currentPage: 1,
      });
    }
  }, [documentIdFromUrl, setActiveComponent]);

  // Resize state
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth = e.clientX - containerRect.left;
        setChatPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setChatPanelWidth]);

  // Current task for the bubble
  const currentTask = useCurrentTask();

  // ==================== Handlers ====================

  const handleSendMessage = useCallback(
    (content: string, mentions?: string[], references?: string[]) => {
      if (agentInstanceStatus !== 'running') {
        addMessage({
          id: `system-msg-${Date.now()}`,
          workspaceId,
          senderId: 'system',
          senderType: 'agent',
          senderName: 'System',
          content: 'Agent is not running. Please start the agent first.',
          contentType: 'text',
          timestamp: new Date().toISOString(),
          metadata: { isError: true },
        });
        return;
      }

      const cid = generateCorrelationId();
      log.info('Sending message to container', { workspaceId, contentLength: content.length, correlationId: cid });
      sendContainerMessage(content, { mentions, references }).then((response) => {
        if (response) {
          log.info('Message exchange complete', { correlationId: cid, responseLength: response.content?.length || 0 });
        } else {
          log.error('Container agent did not respond', { correlationId: cid, workspaceId });
        }
      });
    },
    [addMessage, workspaceId, agentInstanceStatus, isContainerAgentAvailable, sendContainerMessage]
  );

  // Retry: find the user message before the agent message and re-send
  const handleRetry = useCallback(
    (agentMessageId: string) => {
      const idx = messages.findIndex((m: { id: string }) => m.id === agentMessageId);
      if (idx <= 0) return;
      // Walk backwards to find the previous user message
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].senderType === 'user') {
          handleSendMessage(messages[i].content);
          return;
        }
      }
    },
    [messages, handleSendMessage]
  );

  const handleTaskClick = useCallback(
    (taskId: string) => {
      setActiveTaskId(taskId);
    },
    [setActiveTaskId]
  );

  const handleChatInteraction = useCallback(
    (event: InteractionEvent) => {
      // 1. Mark interaction as completed (hides buttons)
      useChatStore.getState().markInteractionComplete(event.componentId);

      // 2. Capture timeline snapshot at this interaction point
      useTimelineStore.getState().captureSnapshot();

      // 3. If this was a confirmation interaction, relay the choice back to the agent
      const chatMessages = useChatStore.getState().messages;
      const sourceMsg = chatMessages.find(
        (m) => m.interactiveComponents?.some((c) => c.id === event.componentId)
      );
      if (sourceMsg?.metadata?.isConfirmation) {
        // Find the matching button by actionId in the button-group component
        const btnGroup = sourceMsg.interactiveComponents?.find((c) => c.type === 'button-group');
        const buttons = btnGroup && 'buttons' in btnGroup
          ? (btnGroup.buttons as Array<{ id: string; label: string }>)
          : [];
        const matched = buttons.find((b) => b.id === event.actionId);
        if (matched) {
          handleSendMessage(matched.label);
          log.info('Confirmation response sent', { actionId: event.actionId, label: matched.label });
        } else {
          log.warn('Unknown confirmation action', { actionId: event.actionId });
        }
      }
    },
    [handleSendMessage]
  );

  const handleTimelineEventClick = useCallback(
    (event: ExtendedTimelineEvent) => {
      if (event.stateSnapshot) {
        restoreSnapshot(event.stateSnapshot.id);
      } else {
        setActiveComponent(event.componentType);
      }
    },
    [restoreSnapshot, setActiveComponent]
  );

  // Timeline playback (advance 2% per 500ms)
  useEffect(() => {
    if (!isTimelinePlaying) return;

    const interval = setInterval(() => {
      const newPosition = useTimelineStore.getState().currentTimelinePosition + 2;

      if (newPosition >= 100) {
        pauseTimeline();
        seekTimeline(100);
      } else {
        seekTimeline(newPosition);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isTimelinePlaying, pauseTimeline, seekTimeline]);

  const handleSeekToEvent = useCallback(
    (position: number) => {
      seekTimeline(position);

      if (timeline.length === 0) return;

      const firstTime = timeline[0].timestamp;
      const lastTime = timeline[timeline.length - 1].timestamp;
      const timeRange = lastTime - firstTime || 1;
      const targetTime = firstTime + (position / 100) * timeRange;

      let closestEvent = timeline[0];
      let closestDistance = Math.abs(timeline[0].timestamp - targetTime);

      for (const event of timeline) {
        const distance = Math.abs(event.timestamp - targetTime);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestEvent = event;
        }
      }

      setActiveComponent(closestEvent.componentType);
      if (closestEvent.stateSnapshot) {
        restoreSnapshot(closestEvent.stateSnapshot.id);
      }
    },
    [seekTimeline, timeline, setActiveComponent, restoreSnapshot]
  );

  const handleDiffClose = useCallback(() => {
    clearDiff();
  }, [clearDiff]);

  const fetchAgentLogs = useCallback(async () => {
    if (!agentInstanceId) {
      setAgentLogs('No agent instance bound to this workspace yet.');
      return;
    }
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentInstanceId}/logs?tail=200`);
      const data = await res.json();
      setAgentLogs(data.data?.logs || data.error || 'No logs available');
    } catch (err) {
      setAgentLogs(`Error: ${err instanceof Error ? err.message : 'Failed to fetch logs'}`);
    } finally {
      setLogsLoading(false);
    }
  }, [agentInstanceId]);

  return (
    <WorkspaceContext.Provider value={{ workspaceId }}>
    <div
      ref={containerRef}
      className={`h-full flex relative ${isResizing ? 'select-none' : ''}`}
    >
      {/* Chat Panel (shown when expanded) */}
      <AnimatePresence mode="wait">
        {chatExpanded && (
          <>
            <WorkspaceChat
              workspaceId={workspaceId}
              isExpanded={chatExpanded}
              onClose={toggleChat}
              width={chatPanelWidth}
              taskPanelHeight={taskPanelHeight}
              onTaskPanelHeightChange={setTaskPanelHeight}
              tasks={tasks}
              activeTaskId={activeTaskId}
              onTaskClick={handleTaskClick}
              messages={messages}
              participants={participants}
              onSendMessage={handleSendMessage}
              onInteraction={handleChatInteraction}
              onRetry={handleRetry}
              disabled={workspaceDisabled}
              isAgentThinking={isAgentThinking}
            />

            {/* Resize handle for dragging panel width */}
            <div
              onMouseDown={handleResizeStart}
              className={`
                w-1 hover:w-1.5 bg-transparent hover:bg-violet-500/50
                cursor-col-resize transition-all duration-150
                ${isResizing ? 'w-1.5 bg-violet-500' : ''}
              `}
              style={{ flexShrink: 0 }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Window Viewer (always visible, width adjusts with Chat state) */}
      <motion.div
        className="flex-1 min-w-0 relative"
        layout
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <WindowViewer
          activeComponent={activeComponent}
          onComponentChange={setActiveComponent}
          timeline={timeline}
          currentPosition={currentTimelinePosition}
          isPlaying={isTimelinePlaying}
          onSeek={handleSeekToEvent}
          onPlay={playTimeline}
          onPause={pauseTimeline}
          onTimelineEventClick={handleTimelineEventClick}
          activeDiff={activeDiff}
          onDiffClose={handleDiffClose}
          chatExpanded={chatExpanded}
          onChatToggle={toggleChat}
          connectionStatus={connectionStatus}
          workspaceName={currentWorkspaceName}
          connectedAt={connectedAt}
          onReconnect={checkContainerStatus}
          onDisconnect={undefined}
          onOpenSettings={() => setIsSettingsOpen(true)}
          disabled={workspaceDisabled}
        />
      </motion.div>

      {/* Universal readiness gate — shown when workspace is not ready */}
      {showReadinessGate && (
        <WorkspaceReadinessGate onDismiss={handleDismissGate} />
      )}

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-4xl w-[92vw] h-[82vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 py-4 border-b border-slate-100">
            <DialogTitle>Workspace Settings</DialogTitle>
            <DialogDescription>
              Manage current workspace skills, config and logs.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2">
            <Button
              type="button"
              variant={activeSettingsTab === 'skills' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSettingsTab('skills')}
            >
              Skills
            </Button>
            <Button
              type="button"
              variant={activeSettingsTab === 'config' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSettingsTab('config')}
            >
              Config
            </Button>
            <Button
              type="button"
              variant={activeSettingsTab === 'logs' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setActiveSettingsTab('logs');
                fetchAgentLogs();
              }}
            >
              Logs
            </Button>
            <Button
              type="button"
              variant={activeSettingsTab === 'workspaces' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveSettingsTab('workspaces')}
            >
              Workspaces
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-6">
            {activeSettingsTab === 'skills' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">
                  Install or uninstall skills for the current workspace agent.
                </p>
                <SkillManagerDialog
                  open={true}
                  onOpenChange={() => {}}
                  workspaceId={workspaceId}
                  embedded
                />
              </div>
            )}

            {activeSettingsTab === 'config' && (
              <AgentControlPanel />
            )}

            {activeSettingsTab === 'logs' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={fetchAgentLogs} disabled={logsLoading}>
                    {logsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh Logs'}
                  </Button>
                </div>
                <pre className="bg-slate-950 text-slate-200 text-xs rounded-lg p-4 overflow-auto min-h-[360px] whitespace-pre-wrap">
                  {logsLoading ? 'Loading logs...' : (agentLogs || 'No logs loaded yet.')}
                </pre>
              </div>
            )}

            {activeSettingsTab === 'workspaces' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900">Create Workspace</h3>
                    <p className="text-sm text-slate-600">
                      Each workspace keeps its own agent state, files, notes, and assets.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
                    <Input
                      value={newWorkspaceName}
                      onChange={(event) => setNewWorkspaceName(event.target.value)}
                      placeholder="Workspace name"
                      maxLength={80}
                    />
                    <Input
                      value={newWorkspaceDescription}
                      onChange={(event) => setNewWorkspaceDescription(event.target.value)}
                      placeholder="Description (optional)"
                      maxLength={160}
                    />
                    <Button
                      type="button"
                      onClick={handleCreateWorkspace}
                      disabled={createWorkspaceLoading || !newWorkspaceName.trim()}
                    >
                      {createWorkspaceLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Create
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium text-slate-900">Your Workspaces</h3>
                      <p className="text-sm text-slate-600">
                        Open another workspace or delete one you no longer need.
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={loadWorkspaces} disabled={workspacesLoading}>
                      {workspacesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                    </Button>
                  </div>

                  {workspacesError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {workspacesError}
                    </div>
                  )}

                  <div className="space-y-2">
                    {workspaceItems.map((item) => {
                      const isCurrent = item.id === workspaceId;
                      const isDeleting = deletingWorkspaceId === item.id;

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${
                            isCurrent ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium text-slate-900">
                                {item.name}
                              </div>
                              {isCurrent && (
                                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
                                  Current
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <div className="truncate text-sm text-slate-600">{item.description}</div>
                            )}
                            {item.updatedAt && (
                              <div className="text-xs text-slate-500">
                                Updated {new Date(item.updatedAt).toLocaleString()}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isCurrent}
                              onClick={() => handleOpenWorkspace(item.id)}
                            >
                              Open
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isDeleting}
                              onClick={() => handleDeleteWorkspace(item.id)}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-600" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {!workspacesLoading && workspaceItems.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-600">
                        No workspaces found.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </WorkspaceContext.Provider>
  );
}
