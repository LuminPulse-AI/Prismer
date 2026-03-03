/**
 * Agent Event to Sync Protocol Mapper
 *
 * @description
 * Phase 3A: Maps AgentEvent to Sync protocol messages
 * Handles conversion from Agent events to client sync messages
 */

import type {
  AgentEvent,
  AgentEventType,
  MessageDelta,
  ToolCall,
  InteractionRequest,
} from './types';
import type {
  ServerToClientMessage,
  StateDelta,
  UIDirective,
  AgentState,
} from '@/lib/sync/types';

// ============================================================
// Event to Sync Message Converter
// ============================================================

/**
 * Convert AgentEvent to ServerToClientMessage
 */
export function agentEventToSyncMessage(event: AgentEvent): ServerToClientMessage | null {
  switch (event.type) {
    // Agent state change → AGENT_STATUS
    case 'agent_thinking':
      return {
        type: 'AGENT_STATUS',
        payload: {
          status: 'running',
          waitingFor: undefined,
          error: undefined,
        },
      };

    case 'agent_responding':
      return {
        type: 'AGENT_STATUS',
        payload: {
          status: 'running',
          waitingFor: undefined,
        },
      };

    case 'agent_waiting':
      return {
        type: 'AGENT_STATUS',
        payload: {
          status: 'waiting_interaction',
          waitingFor: {
            componentId: event.payload.componentId,
            possibleActions: event.payload.possibleActions,
          },
        },
      };

    case 'agent_idle':
      return {
        type: 'AGENT_STATUS',
        payload: {
          status: 'idle',
          waitingFor: undefined,
        },
      };

    case 'agent_error':
      return {
        type: 'AGENT_STATUS',
        payload: {
          status: 'error',
          error: event.payload.message,
        },
      };

    // Message event → STATE_DELTA
    case 'message_end':
      return {
        type: 'STATE_DELTA',
        payload: {
          messages: {
            added: [{
              id: event.payload.messageId,
              content: event.payload.content,
              senderId: 'agent',
              senderType: 'agent',
              senderName: 'Research Assistant',
              actions: event.payload.actions,
              createdAt: event.timestamp,
            }],
          },
        },
      };

    // Task event → STATE_DELTA
    case 'task_created':
      return {
        type: 'STATE_DELTA',
        payload: {
          tasks: [{
            id: event.payload.taskId,
            title: event.payload.title,
            description: event.payload.description,
            status: 'pending',
            progress: 0,
          }],
        },
      };

    case 'task_updated':
      return {
        type: 'STATE_DELTA',
        payload: {
          tasks: [{
            id: event.payload.taskId,
            status: event.payload.status,
            progress: event.payload.progress,
          }],
        },
      };

    case 'task_completed':
      return {
        type: 'STATE_DELTA',
        payload: {
          tasks: [{
            id: event.payload.taskId,
            status: 'completed',
            progress: 100,
            outputs: event.payload.outputs,
          }],
        },
      };

    case 'task_failed':
      return {
        type: 'STATE_DELTA',
        payload: {
          tasks: [{
            id: event.payload.taskId,
            status: 'error',
            error: event.payload.error,
          }],
        },
      };

    // UI directive event → UI_DIRECTIVE
    case 'ui_directive':
      return {
        type: 'UI_DIRECTIVE',
        payload: event.payload,
      };

    // Component state update → STATE_DELTA
    case 'component_state_update':
      return {
        type: 'STATE_DELTA',
        payload: {
          componentStates: {
            [event.payload.componentType]: event.payload.state,
          },
        },
      };

    // Session events → special handling
    case 'session_start':
    case 'session_end':
    case 'session_error':
    case 'message_start':
    case 'message_delta':
    case 'tool_start':
    case 'tool_progress':
    case 'tool_end':
    case 'tool_error':
    case 'interaction_request':
    case 'interaction_response':
      // These events require special handling or do not map directly
      return null;

    default:
      return null;
  }
}

// ============================================================
// Streaming Message Accumulator
// ============================================================

/**
 * Streaming message accumulator
 * Accumulates message_delta events into complete messages
 */
export class MessageAccumulator {
  private messages: Map<string, {
    senderId: string;
    senderType: 'agent' | 'user';
    content: string;
    chunks: string[];
    startTime: number;
  }> = new Map();

  /**
   * Start a new message
   */
  startMessage(messageId: string, senderId: string, senderType: 'agent' | 'user'): void {
    this.messages.set(messageId, {
      senderId,
      senderType,
      content: '',
      chunks: [],
      startTime: Date.now(),
    });
  }

  /**
   * Add message delta
   */
  addDelta(delta: MessageDelta): string {
    const message = this.messages.get(delta.messageId);
    if (!message) {
      // Auto-create if message was not started
      this.startMessage(delta.messageId, 'agent', 'agent');
      return this.addDelta(delta);
    }

    message.chunks.push(delta.content);
    message.content += delta.content;
    return message.content;
  }

  /**
   * End message and get full content
   */
  endMessage(messageId: string): { content: string; duration: number } | null {
    const message = this.messages.get(messageId);
    if (!message) return null;

    const result = {
      content: message.content,
      duration: Date.now() - message.startTime,
    };

    this.messages.delete(messageId);
    return result;
  }

  /**
   * Get current accumulated content
   */
  getCurrentContent(messageId: string): string | null {
    return this.messages.get(messageId)?.content ?? null;
  }

  /**
   * Clear all accumulated messages
   */
  clear(): void {
    this.messages.clear();
  }
}

// ============================================================
// Tool Call Tracker
// ============================================================

/**
 * Tool call tracker
 * Tracks tool call status
 */
export class ToolCallTracker {
  private calls: Map<string, ToolCall> = new Map();

  /**
   * Start tool call
   */
  startCall(call: ToolCall): void {
    this.calls.set(call.id, { ...call, status: 'running' });
  }

  /**
   * Update progress
   */
  updateProgress(toolId: string, progress: number, status?: string): void {
    const call = this.calls.get(toolId);
    if (call) {
      call.progress = progress;
      if (status) {
        call.status = status as ToolCall['status'];
      }
    }
  }

  /**
   * Complete tool call
   */
  completeCall(toolId: string, result: unknown): void {
    const call = this.calls.get(toolId);
    if (call) {
      call.status = 'completed';
      call.result = result;
      call.progress = 100;
    }
  }

  /**
   * Tool call failed
   */
  failCall(toolId: string, error: string): void {
    const call = this.calls.get(toolId);
    if (call) {
      call.status = 'failed';
      call.error = error;
    }
  }

  /**
   * Get tool call status
   */
  getCall(toolId: string): ToolCall | undefined {
    return this.calls.get(toolId);
  }

  /**
   * Get all active tool calls
   */
  getActiveCalls(): ToolCall[] {
    return Array.from(this.calls.values()).filter(
      call => call.status === 'running' || call.status === 'pending'
    );
  }

  /**
   * Clear completed calls
   */
  clearCompleted(): void {
    for (const [id, call] of this.calls) {
      if (call.status === 'completed' || call.status === 'failed') {
        this.calls.delete(id);
      }
    }
  }
}

// ============================================================
// Event Stream Handler
// ============================================================

/**
 * Agent event stream handler
 * Converts sequential Agent events into a Sync protocol message stream
 */
export class AgentEventStreamHandler {
  private messageAccumulator = new MessageAccumulator();
  private toolCallTracker = new ToolCallTracker();
  private eventBuffer: AgentEvent[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private flushIntervalMs: number;

  constructor(
    private onSyncMessage: (message: ServerToClientMessage) => void,
    options?: { flushIntervalMs?: number }
  ) {
    this.flushIntervalMs = options?.flushIntervalMs ?? 100;
  }

  /**
   * Handle Agent event
   */
  handleEvent(event: AgentEvent): void {
    // Handle streaming message events
    if (event.type === 'message_start') {
      this.messageAccumulator.startMessage(
        event.payload.messageId,
        event.payload.senderId,
        event.payload.senderType
      );
      return;
    }

    if (event.type === 'message_delta') {
      const content = this.messageAccumulator.addDelta(event.payload);
      // Optional: send real-time delta updates
      // this.onSyncMessage({ type: 'STATE_DELTA', payload: { ... } });
      return;
    }

    // Handle tool call events
    if (event.type === 'tool_start') {
      this.toolCallTracker.startCall(event.payload);
    } else if (event.type === 'tool_progress') {
      this.toolCallTracker.updateProgress(
        event.payload.toolId,
        event.payload.progress,
        event.payload.status
      );
    } else if (event.type === 'tool_end') {
      this.toolCallTracker.completeCall(event.payload.toolId, event.payload.result);
    } else if (event.type === 'tool_error') {
      this.toolCallTracker.failCall(event.payload.toolId, event.payload.error);
    }

    // Convert and send other events
    const syncMessage = agentEventToSyncMessage(event);
    if (syncMessage) {
      this.onSyncMessage(syncMessage);
    }
  }

  /**
   * Process events in batch
   */
  handleEvents(events: AgentEvent[]): void {
    events.forEach(event => this.handleEvent(event));
  }

  /**
   * Get current state summary
   */
  getStateSummary(): {
    pendingMessages: number;
    activeToolCalls: number;
  } {
    return {
      pendingMessages: 0, // TODO: implement
      activeToolCalls: this.toolCallTracker.getActiveCalls().length,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }
    this.messageAccumulator.clear();
    this.toolCallTracker.clearCompleted();
    this.eventBuffer = [];
  }
}
