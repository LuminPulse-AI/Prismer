/**
 * Sync Actions
 *
 * Cross-store coordination for WebSocket sync, REST API operations,
 * and UI directive execution. These functions access multiple domain
 * stores and should not belong to any single store.
 */

import type {
  ExtendedChatMessage,
  ExtendedTimelineEvent,
  StateSnapshot,
  ComponentStates,
  ComponentType,
  UIDirective,
  Task,
  TaskStatus,
  Participant,
  AgGridState,
} from '../types';
import type { AgentState, StateDelta } from '@/lib/sync/types';
import { useLayoutStore } from './layoutStore';
import { setLayoutStoreWorkspaceId } from './layoutStore';
import { useChatStore } from './chatStore';
import { setChatStoreWorkspaceId } from './chatStore';
import { useTaskStore } from './taskStore';
import { setTaskStoreWorkspaceId } from './taskStore';
import { useComponentStore } from './componentStore';
import { setComponentStoreWorkspaceId } from './componentStore';
import { useTimelineStore } from './timelineStore';
import { useAgentInstanceStore } from './agentInstanceStore';
import { setAgentStoreWorkspaceId } from './agentInstanceStore';

// ============================================================
// API Helper
// ============================================================

async function apiCall<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

// ============================================================
// Compiled PDF Persistence
// ============================================================

/** Fire-and-forget save of compiled PDF data URL to WorkspaceFile */
function persistCompiledPdf(pdfDataUrl: string): void {
  const wsId = useAgentInstanceStore.getState().workspaceId;
  if (!wsId || wsId === 'default') return;
  fetch(`/api/workspace/${wsId}/files/output/compiled.pdf.b64`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: pdfDataUrl }),
  }).catch((err) => console.warn('[Sync] Failed to persist compiled PDF:', err));
}

// ============================================================
// UI Directive Execution
// ============================================================

// ============================================================
// Timeline Auto-Recording
// ============================================================

/** Directive types that should generate timeline events automatically */
const TIMELINE_WORTHY_DIRECTIVES = new Set([
  'switch_component',
  'load_document',
  'update_content',
  'latex_compile_complete',
  'latex_project_compile_complete',
  'jupyter_cell_result',
  'update_latex_project',
  'update_gallery',
  'update_data_grid',
  'update_tasks',
]);

/** Map directive types to human-readable timeline action descriptions */
const DIRECTIVE_ACTION_MAP: Record<string, { action: string; category: string }> = {
  switch_component: { action: 'Switched component', category: 'navigation' },
  load_document: { action: 'Loaded document', category: 'content' },
  update_content: { action: 'Updated content', category: 'content' },
  latex_compile_complete: { action: 'LaTeX compiled', category: 'compile' },
  latex_project_compile_complete: { action: 'LaTeX project compiled', category: 'compile' },
  jupyter_cell_result: { action: 'Jupyter cell executed', category: 'execute' },
  update_latex_project: { action: 'LaTeX project updated', category: 'content' },
  update_gallery: { action: 'Gallery updated', category: 'content' },
  update_data_grid: { action: 'Data grid updated', category: 'content' },
  update_tasks: { action: 'Tasks updated', category: 'task' },
};

/** Map directive types to timeline action types */
const DIRECTIVE_TIMELINE_ACTION: Record<string, ExtendedTimelineEvent['action']> = {
  switch_component: 'navigate',
  load_document: 'navigate',
  update_content: 'edit',
  latex_compile_complete: 'execute',
  latex_project_compile_complete: 'execute',
  jupyter_cell_result: 'execute',
  update_latex_project: 'edit',
  update_gallery: 'create',
  update_data_grid: 'create',
  update_tasks: 'workflow_step',
};

function recordTimelineEvent(directive: UIDirective): void {
  if (!TIMELINE_WORTHY_DIRECTIVES.has(directive.type)) return;

  const actionInfo = DIRECTIVE_ACTION_MAP[directive.type] || { action: directive.type, category: 'other' };
  const timelineAction = DIRECTIVE_TIMELINE_ACTION[directive.type] || 'edit';
  const targetLabel = directive.target || '';

  const event: ExtendedTimelineEvent = {
    id: `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    action: timelineAction,
    componentType: (directive.target || 'pdf-reader') as ComponentType,
    description: targetLabel ? `${actionInfo.action}: ${targetLabel}` : actionInfo.action,
  };

  try {
    useTimelineStore.getState().addTimelineEvent(event);
  } catch {
    // Timeline store may not be initialized in test environments
  }
}

export async function executeDirective(directive: UIDirective): Promise<void> {
  const { type, target, delay, data } = directive;

  if (delay && delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  switch (type) {
    case 'switch_component':
      if (target && typeof target === 'string') {
        useComponentStore.getState().setActiveComponent(target as ComponentType);
      }
      break;

    case 'load_document':
      if (target === 'pdf-reader' && data?.documentId) {
        useComponentStore.getState().updateComponentState('pdf-reader', {
          documentId: data.documentId as string,
          currentPage: (data.page as number) || 1,
        });
        // Auto-switch to pdf-reader component
        useComponentStore.getState().setActiveComponent('pdf-reader');
      }
      break;

    case 'update_content':
      if (target && data) {
        // Update componentStore for persistence
        if (data.content) {
          useComponentStore.getState().updateComponentState(target as keyof ComponentStates, data as never);
        }

        // Dispatch editor-specific CustomEvents that components actually listen to.
        // Editors don't reactively render from componentStore after mount — they listen
        // to window CustomEvents for content updates.
        if (typeof window !== 'undefined') {
          if (target === 'latex-editor' && data.file && data.content) {
            window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_LATEX', {
              detail: { file: data.file as string, content: data.content as string },
            }));
          } else if (target === 'ai-editor' && data.content) {
            window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_NOTES', {
              detail: { content: data.content as string },
            }));
          } else if (target === 'jupyter-notebook' && data.cells) {
            window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_NOTEBOOK', {
              detail: { cells: data.cells, execute: data.execute ?? false },
            }));
          } else if (target === 'code-playground' && data.files) {
            window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_CODE', {
              detail: { files: data.files, selectedFile: data.selectedFile },
            }));
          }
        }
      }
      break;

    case 'highlight_diff':
      if (target && data?.changes) {
        useComponentStore.getState().setActiveDiff({
          component: target as ComponentType,
          file: data.file as string | undefined,
          changes: data.changes as NonNullable<ReturnType<typeof useComponentStore.getState>['activeDiff']>['changes'],
        });
      }
      break;

    case 'open_panel':
      if (target === 'chat') {
        useLayoutStore.setState({ chatExpanded: true });
      } else if (target === 'task') {
        useLayoutStore.setState({ taskPanelHeight: '30%' });
      }
      break;

    case 'close_panel':
      if (target === 'chat') {
        useLayoutStore.setState({ chatExpanded: false });
      } else if (target === 'task') {
        useLayoutStore.setState({ taskPanelHeight: 'collapsed' });
      }
      break;

    case 'navigate_to_page':
      if (target === 'pdf-reader' && data?.page) {
        useComponentStore.getState().updateComponentState('pdf-reader', {
          currentPage: data.page as number,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:PDF_NAVIGATE', {
            detail: {
              page: data.page as number,
              detectionId: data.detectionId as string | undefined,
              highlightRegion: data.highlightRegion as Record<string, unknown> | undefined,
            },
          }));
        }
      }
      break;

    case 'scroll_to':
    case 'show_notification':
      if (type === 'show_notification') {
        console.log('[Notification]', data?.message);
      }
      break;

    case 'play_animation':
    case 'focus_element':
      break;

    // Plugin-originated directive types (mapped from UPPERCASE by useDirectiveStream)
    case 'latex_compile_complete': {
      const pdfDataUrl = data?.pdfDataUrl as string | undefined;
      if (pdfDataUrl) {
        // New path: Agent compiled, directly render the PDF (no double-compile)
        useComponentStore.getState().updateComponentState('latex-editor', {
          compiledPdfUrl: pdfDataUrl,
          compileStatus: 'success' as const,
        });
        persistCompiledPdf(pdfDataUrl);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:LATEX_COMPILE_COMPLETE', {
            detail: { pdfDataUrl, filename: data?.filename },
          }));
        }
      } else if (data?.compiledPdfUrl) {
        // Legacy fallback: only container path available, trigger frontend re-compile
        useComponentStore.getState().updateComponentState('latex-editor', {
          compiledPdfUrl: data.compiledPdfUrl as string,
          compileStatus: 'success' as const,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:COMPILE_LATEX'));
        }
      }
      break;
    }

    case 'jupyter_cell_result':
      if (data?.code) {
        // Update componentStore for persistence
        const jupyterStore = useComponentStore.getState();
        const currentState = jupyterStore.componentStates['jupyter-notebook'];
        const cells = currentState?.cells || [];
        const newCell = {
          id: `cell-${Date.now()}`,
          type: 'code' as const,
          source: data.code as string,
          outputs: data.outputs as unknown[] | undefined,
          executionCount: (currentState?.executionCount || 0) + 1,
          status: (data.success ? 'idle' : 'error') as 'idle' | 'error',
        };
        jupyterStore.updateComponentState('jupyter-notebook', {
          cells: [...cells, newCell],
          activeCellIndex: cells.length,
          cellCount: cells.length + 1,
          executionCount: (currentState?.executionCount || 0) + 1,
        });

        // Dispatch CustomEvent so Jupyter component adds cell via notebookStore
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_NOTEBOOK', {
            detail: {
              cells: [{ type: 'code', source: data.code as string, outputs: data.outputs }],
              execute: false,
            },
          }));
        }
      }
      break;

    // LaTeX project directives (multi-file)
    case 'update_latex_project':
      if (data?.file && data?.content) {
        // Persist the file to component store so the LaTeX editor picks it up
        // even if it mounts AFTER the CustomEvent fires (SWITCH_COMPONENT race).
        const fileName = (data.file as string).split('/').pop() || (data.file as string);
        const ext = fileName.split('.').pop()?.toLowerCase() || 'tex';
        const fileType = (['tex', 'bib', 'sty', 'cls'].includes(ext) ? ext : 'tex') as 'tex' | 'bib' | 'sty' | 'cls';

        // Merge with existing files in the store (if any)
        const existingState = useComponentStore.getState().componentStates['latex-editor'];
        let existingFiles: Array<{ name: string; path: string; content: string; type: string }> = [];
        try {
          if (existingState?.content) {
            const parsed = JSON.parse(existingState.content as string);
            if (Array.isArray(parsed)) existingFiles = parsed;
          }
        } catch { /* ignore */ }

        // Upsert the file
        const fileEntry = { name: fileName, path: data.file as string, content: data.content as string, type: fileType };
        const existingIdx = existingFiles.findIndex((f) => f.name === fileName || f.path === data.file);
        if (existingIdx >= 0) {
          existingFiles[existingIdx] = fileEntry;
        } else {
          existingFiles.push(fileEntry);
        }

        useComponentStore.getState().updateComponentState('latex-editor', {
          activeFile: fileName,
          content: JSON.stringify(existingFiles),
          projectMode: true,
        });

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_LATEX_PROJECT', {
            detail: {
              operation: data.operation,
              file: data.file as string,
              content: data.content as string,
              projectFiles: data.projectFiles,
            },
          }));
        }
      }
      break;

    case 'delete_latex_project_file':
      if (data?.file) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:DELETE_LATEX_PROJECT_FILE', {
            detail: { file: data.file as string, projectFiles: data.projectFiles },
          }));
        }
      }
      break;

    case 'latex_project_compile_complete':
      if (data?.success && data?.pdfBase64) {
        const projectPdfDataUrl = `data:application/pdf;base64,${data.pdfBase64 as string}`;
        useComponentStore.getState().updateComponentState('latex-editor', {
          compiledPdfUrl: projectPdfDataUrl,
          compileStatus: 'success' as const,
        });
        persistCompiledPdf(projectPdfDataUrl);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:LATEX_PROJECT_COMPILE_COMPLETE', {
            detail: {
              pdfBase64: data.pdfBase64 as string,
              log: data.log,
              warnings: data.warnings,
            },
          }));
        }
      } else if (data && !data.success) {
        useComponentStore.getState().updateComponentState('latex-editor', {
          compileStatus: 'error' as const,
        });
      }
      break;

    case 'update_gallery':
      if (data?.images) {
        useComponentStore.getState().updateComponentState('bento-gallery', {
          images: data.images as Array<{ title: string; description?: string; url: string }>,
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_GALLERY', {
            detail: { images: data.images },
          }));
        }
      }
      break;

    case 'terminal_output':
      if (typeof window !== 'undefined' && data?.output) {
        // Split multi-line output into individual log lines
        const lines = (data.output as string).split('\n');
        for (const line of lines) {
          if (line) {
            window.dispatchEvent(new CustomEvent('agent:directive:TERMINAL_OUTPUT', {
              detail: { line },
            }));
          }
        }
      }
      break;

    case 'update_data_grid':
      if (data?.data) {
        const meta = data.meta as Record<string, unknown> | undefined;
        useComponentStore.getState().updateComponentState('ag-grid', {
          rowCount: (data.data as unknown[]).length,
          filename: meta?.filename as string | undefined,
          totalRows: meta?.totalRows as number | undefined,
          truncated: meta?.truncated as boolean | undefined,
          columnInfo: meta?.columnInfo as AgGridState['columnInfo'],
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:UPDATE_DATA_GRID', {
            detail: { data: data.data, columns: data.columns, title: data.title, meta: data.meta },
          }));
        }
      }
      break;

    // ========== Phase B: Agent Observability Directives ==========

    case 'update_tasks': {
      const tasks = data?.tasks as Array<{
        id?: string;
        title: string;
        status?: TaskStatus;
        progress?: number;
        subtasks?: Array<{ id?: string; title: string; status?: TaskStatus }>;
      }> | undefined;
      if (tasks && tasks.length > 0) {
        const taskStore = useTaskStore.getState();
        const mapped: Task[] = tasks.map((t, i) => ({
          id: t.id || `task-${Date.now()}-${i}`,
          title: t.title,
          status: (t.status || 'pending') as TaskStatus,
          progress: t.progress ?? 0,
          subtasks: t.subtasks?.map((s, j) => ({
            id: s.id || `subtask-${Date.now()}-${i}-${j}`,
            parentId: t.id || `task-${Date.now()}-${i}`,
            title: s.title,
            status: (s.status || 'pending') as TaskStatus,
          })),
        }));
        taskStore.setTasks(mapped);
      }
      break;
    }

    case 'request_confirmation': {
      if (data?.message) {
        // Add confirmation request as agent message with interactive buttons
        const confirmMsg: ExtendedChatMessage = {
          id: `confirm-${Date.now()}`,
          workspaceId: '',
          senderId: 'container-agent',
          senderType: 'agent',
          senderName: 'Agent',
          content: data.message as string,
          contentType: 'text',
          timestamp: new Date().toISOString(),
          interactiveComponents: [{
            type: 'button-group',
            id: `confirm-buttons-${Date.now()}`,
            buttons: [
              { id: 'confirm-yes', label: data.confirmLabel as string || 'Confirm', variant: 'primary' },
              { id: 'confirm-no', label: data.cancelLabel as string || 'Cancel', variant: 'secondary' },
            ],
          }],
          metadata: {
            isConfirmation: true,
            confirmationId: data.confirmationId || `req-${Date.now()}`,
          },
        };
        useChatStore.getState().addMessage(confirmMsg);
      }
      break;
    }

    case 'operation_status': {
      // Update operation status in component store for OperationStatusBar display
      if (data?.operation) {
        const currentOps = useComponentStore.getState().componentStates;
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent:directive:OPERATION_STATUS', {
            detail: {
              operation: data.operation,
              status: data.status,
              progress: data.progress,
              message: data.message,
              component: data.component,
            },
          }));
        }
        // Also store in component metadata for persistence
        if (data.component && typeof data.component === 'string') {
          const compKey = data.component as keyof typeof currentOps;
          useComponentStore.getState().updateComponentState(compKey, {
            operationStatus: {
              operation: data.operation as string,
              status: data.status as string,
              progress: data.progress as number | undefined,
              message: data.message as string | undefined,
            },
          } as never);
        }
      }
      break;
    }

    case 'agent_thinking': {
      // Update chatStore thinking state for AgentThinkingPanel
      const chat = useChatStore.getState();
      const thinkingContent = data?.content as string | undefined;
      chat.setThinkingStatus(thinkingContent || data?.status as string || 'Thinking...');
      chat.setThinkingContent(thinkingContent || null);
      break;
    }

    case 'agent_tool_start': {
      // Track tool execution start
      const chat = useChatStore.getState();
      const toolName = data?.toolName as string || 'unknown';
      const toolCallId = data?.toolCallId as string || `tc-${Date.now()}`;
      chat.setThinkingStatus(`Using tool: ${toolName}...`);
      chat.startToolCall(toolCallId, toolName);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent:directive:TOOL_START', {
          detail: { toolName, toolCallId, args: data?.args },
        }));
      }
      break;
    }

    case 'agent_tool_result': {
      // Track tool execution result
      const chat = useChatStore.getState();
      const toolCallId = data?.toolCallId as string || '';
      const success = (data?.success as boolean | undefined) ?? true;
      if (toolCallId) {
        chat.endToolCall(toolCallId, success);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent:directive:TOOL_RESULT', {
          detail: {
            toolName: data?.toolName,
            toolCallId,
            success,
            result: data?.result,
          },
        }));
      }
      break;
    }
  }

  // Phase A-5: Auto-record timeline event for significant directives
  recordTimelineEvent(directive);
}

export async function executeDirectives(directives: UIDirective[]): Promise<void> {
  for (const directive of directives) {
    await executeDirective(directive);
    // After component switch, wait for React to mount the new component
    // before dispatching content events (prevents lost CustomEvents)
    if (directive.type === 'switch_component') {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

// ============================================================
// State Delta Application (WebSocket sync)
// ============================================================

export function applyStateDelta(delta: StateDelta): void {
  const chatStore = useChatStore.getState();
  const taskStore = useTaskStore.getState();
  const timelineStore = useTimelineStore.getState();
  const componentStore = useComponentStore.getState();
  const agentStore = useAgentInstanceStore.getState();

  // Messages
  if (delta.messages?.added) {
    delta.messages.added.forEach((msg) => {
      const added = chatStore.addMessageIfNew(msg as ExtendedChatMessage);
      if (added) {
        const extMsg = msg as ExtendedChatMessage;
        if (extMsg.uiDirectives && extMsg.uiDirectives.length > 0) {
          executeDirectives(extMsg.uiDirectives);
        }
      }
    });
  }
  if (delta.messages?.updated) {
    (delta.messages.updated as Record<string, unknown>[]).forEach((msg) => {
      chatStore.updateMessage(msg.id as string, msg as Partial<ExtendedChatMessage>);
    });
  }

  // Tasks
  if (delta.tasks) {
    taskStore.setTasks(delta.tasks as Task[]);
  }

  // Completed Interactions
  if (delta.completedInteractions?.added) {
    delta.completedInteractions.added.forEach((id) => {
      chatStore.addCompletedInteraction(id);
    });
  }

  // Timeline
  if (delta.timeline?.added) {
    delta.timeline.added.forEach((event) => {
      timelineStore.addTimelineEventIfNew(event as ExtendedTimelineEvent);
    });
  }

  // State Snapshots
  if (delta.stateSnapshots?.added) {
    delta.stateSnapshots.added.forEach((snapshot) => {
      timelineStore.addSnapshotIfNew(snapshot as StateSnapshot);
    });
  }

  // Component States (deep merge)
  if (delta.componentStates) {
    const currentStates = componentStore.componentStates;
    const merged: Record<string, unknown> = { ...currentStates };
    for (const [key, value] of Object.entries(delta.componentStates)) {
      merged[key] = {
        ...(currentStates[key as keyof ComponentStates] as Record<string, unknown> | undefined),
        ...(value as Record<string, unknown>),
      };
    }
    componentStore.setComponentStates(merged as ComponentStates);
  }

  // Agent State
  if (delta.agentState) {
    agentStore.setAgentState({ ...agentStore.agentState, ...delta.agentState } as AgentState);
  }
}

// ============================================================
// REST API Operations
// ============================================================

export async function loadWorkspace(id: string): Promise<void> {
  const agentStore = useAgentInstanceStore.getState();

  agentStore.setWorkspaceId(id);
  agentStore.setLoading(true);
  agentStore.setSyncError(null);
  // NOTE: Do NOT reset agentInstanceId/status here — it kills the SSE connection
  // in useDirectiveStream. The API response below will set the correct values.
  agentStore.setAgentInstanceError(null);

  try {
    const [, messages, tasks, participants, timeline, componentStatesData, agentData] = await Promise.all([
      apiCall<Record<string, unknown>>(`/api/workspace/${id}`),
      apiCall<Record<string, unknown>[]>(`/api/workspace/${id}/messages?limit=100`),
      apiCall<Record<string, unknown>[]>(`/api/workspace/${id}/tasks`),
      apiCall<Record<string, unknown>[]>(`/api/workspace/${id}/participants`),
      apiCall<Record<string, unknown>[]>(`/api/workspace/${id}/timeline?limit=200`),
      apiCall<{ states: Record<string, unknown> }>(`/api/workspace/${id}/component-states`),
      apiCall<{ id: string; status: string } | null>(`/api/workspace/${id}/agent`),
    ]);

    if (messages && messages.length > 0) {
      // Merge legacy messages instead of replacing — prevents race condition with
      // useContainerChat.loadMessageHistory() which loads IM messages concurrently.
      // Container-based workspaces store messages in IM, so legacy endpoint is usually
      // empty. When it has data (older workspaces), merge without clobbering IM messages.
      const chatStore = useChatStore.getState();
      if (chatStore.messages.length === 0) {
        // Fast path: store is empty, just set directly
        chatStore.setMessages(messages as unknown as ExtendedChatMessage[]);
      } else {
        // Store already has messages (from IM or persist hydration) — merge
        (messages as unknown as ExtendedChatMessage[]).forEach((msg) => {
          chatStore.addMessageIfNew(msg);
        });
      }
    }
    if (tasks) {
      useTaskStore.getState().setTasks(tasks as unknown as Task[]);
    }
    if (participants) {
      useChatStore.getState().setParticipants(participants as unknown as Participant[]);
    }
    if (timeline) {
      useTimelineStore.getState().setTimeline(
        (timeline as unknown as ExtendedTimelineEvent[]).sort((a, b) => a.timestamp - b.timestamp)
      );
    }
    if (componentStatesData?.states) {
      // Merge server snapshot with current in-memory state to avoid races where
      // an early directive update lands before initial workspace hydration finishes.
      const componentStore = useComponentStore.getState();
      const currentStates = componentStore.componentStates || {};
      const serverStates = componentStatesData.states as unknown as ComponentStates;
      const merged: Record<string, unknown> = {
        ...serverStates,
      };
      for (const [key, value] of Object.entries(currentStates)) {
        merged[key] = {
          ...(serverStates[key as keyof ComponentStates] as Record<string, unknown> | undefined),
          ...(value as Record<string, unknown>),
        };
      }
      componentStore.setComponentStates(merged as ComponentStates);
    }
    if (agentData) {
      agentStore.setAgentInstanceId(agentData.id);
      agentStore.setAgentInstanceStatus((agentData.status as 'idle' | 'starting' | 'running' | 'stopped' | 'error') || 'stopped');
    }

    agentStore.setLoading(false);
    agentStore.setSynced(true);
  } catch (err) {
    agentStore.setLoading(false);
    agentStore.setSyncError(err instanceof Error ? err.message : 'Failed to load workspace');
  }
}

export async function sendMessage(content: string, contentType = 'text'): Promise<void> {
  const workspaceId = useAgentInstanceStore.getState().workspaceId;
  if (!workspaceId) return;

  const tempId = `temp-${Date.now()}`;
  const tempMessage: ExtendedChatMessage = {
    id: tempId,
    workspaceId,
    senderId: 'current-user',
    senderType: 'user',
    senderName: 'You',
    content,
    contentType: contentType as ExtendedChatMessage['contentType'],
    timestamp: new Date().toISOString(),
  };
  useChatStore.getState().addMessage(tempMessage);

  const result = await apiCall<Record<string, unknown>>(`/api/workspace/${workspaceId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, contentType }),
  });

  if (result?.id) {
    useChatStore.getState().updateMessage(tempId, { id: result.id as string });
  }
}

export async function createTask(title: string, subtasks?: { title: string }[]): Promise<void> {
  const workspaceId = useAgentInstanceStore.getState().workspaceId;
  if (!workspaceId) return;

  const tempId = `temp-task-${Date.now()}`;
  const tempTask: Task = {
    id: tempId,
    title,
    status: 'pending',
    progress: 0,
    subtasks: subtasks?.map((s, i) => ({
      id: `temp-subtask-${i}`,
      parentId: tempId,
      title: s.title,
      status: 'pending' as const,
    })),
  };
  useTaskStore.setState((prev) => ({ tasks: [...prev.tasks, tempTask] }));

  const result = await apiCall<Record<string, unknown>>(`/api/workspace/${workspaceId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title, subtasks }),
  });

  if (result?.id) {
    useTaskStore.getState().updateTask(tempId, { id: result.id as string });
  }
}

export function syncComponentState<K extends keyof ComponentStates>(
  component: K,
  state: Partial<ComponentStates[K]>
): void {
  const workspaceId = useAgentInstanceStore.getState().workspaceId;
  if (!workspaceId) return;

  useComponentStore.getState().updateComponentState(component, state);

  const currentState = useComponentStore.getState().componentStates[component];
  apiCall(`/api/workspace/${workspaceId}/component-states`, {
    method: 'PATCH',
    body: JSON.stringify({ componentType: component, state: currentState }),
  });
}

// ============================================================
// Workspace Initialization (store isolation)
// ============================================================

/**
 * Initialize workspace with proper per-workspace store isolation.
 *
 * Sequence:
 * 1. Reset all stores to clean initial state
 * 2. Point workspace-scoped storage adapters to the new workspaceId
 * 3. Rehydrate from localStorage (workspace-specific cached data)
 * 4. Load fresh data from API (overwrites stale localStorage cache)
 *
 * This eliminates the race condition where persist middleware auto-hydrates
 * old workspace data after reset, and ensures each workspace has isolated storage.
 */
export async function initializeWorkspace(workspaceId: string): Promise<void> {
  const currentWsId = useAgentInstanceStore.getState().workspaceId;
  const isSameWorkspace = currentWsId === workspaceId;

  // Step 1: Reset stores — preserve agent state when reloading same workspace
  // to prevent killing the SSE directive stream connection
  if (isSameWorkspace) {
    // Only reset non-agent stores (preserves SSE connection)
    useLayoutStore.getState().resetLayout();
    useChatStore.getState().resetChat();
    useTaskStore.getState().resetTasks();
    useComponentStore.getState().resetComponents();
    useTimelineStore.getState().resetTimeline();
    useDemoStore.getState().resetDemo();
  } else {
    resetAllStores();
  }

  // Step 2: Point storage adapters to the new workspace
  setComponentStoreWorkspaceId(workspaceId);
  setChatStoreWorkspaceId(workspaceId);
  setTaskStoreWorkspaceId(workspaceId);
  setLayoutStoreWorkspaceId(workspaceId);
  if (!isSameWorkspace) {
    setAgentStoreWorkspaceId(workspaceId);
  }

  // Step 3: Rehydrate from workspace-scoped localStorage
  // This restores cached state for THIS workspace (layout prefs, messages, etc.)
  const rehydrations = [
    useComponentStore.persist.rehydrate(),
    useChatStore.persist.rehydrate(),
    useTaskStore.persist.rehydrate(),
    useLayoutStore.persist.rehydrate(),
  ];
  if (!isSameWorkspace) {
    rehydrations.push(useAgentInstanceStore.persist.rehydrate());
  }
  await Promise.all(rehydrations);

  // Step 4: Load fresh data from API (skip for demo/default workspace)
  if (workspaceId !== 'default') {
    await loadWorkspace(workspaceId);
  }
}

// ============================================================
// Reset All Stores
// ============================================================

export function resetAllStores(): void {
  useLayoutStore.getState().resetLayout();
  useChatStore.getState().resetChat();
  useTaskStore.getState().resetTasks();
  useComponentStore.getState().resetComponents();
  useTimelineStore.getState().resetTimeline();
  useDemoStore.getState().resetDemo();
  useAgentInstanceStore.getState().resetAgentInstance();
}

// Lazy import to avoid circular dependency
import { useDemoStore } from './demoStore';
