/**
 * OpenClaw Agent Service
 *
 * @description
 * Phase 3B: OpenClaw Agent service implementation
 * Connects to the OpenClaw Gateway via WebSocket and handles real Agent interactions
 */

import type {
  AgentService,
  AgentEvent,
  AgentEventHandler,
  SessionConfig,
  TaskConfig,
  UserInteraction,
} from './types';
import type { SessionState } from '@/lib/sync/types';

// ============================================================
// OpenClaw Protocol Types
// ============================================================

/**
 * OpenClaw Gateway message types
 */
type OpenClawMessageType =
  | 'connect'
  | 'disconnect'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'state_update'
  | 'error'
  | 'ping'
  | 'pong';

/**
 * OpenClaw Gateway message
 */
interface OpenClawMessage {
  type: OpenClawMessageType;
  id?: string;
  payload?: unknown;
  timestamp?: number;
}

/**
 * OpenClaw connection configuration
 */
export interface OpenClawConfig {
  /** Gateway WebSocket URL */
  gatewayUrl: string;
  /** Auth token */
  authToken?: string;
  /** Timeout (ms) */
  timeout?: number;
  /** Retry count */
  retryCount?: number;
  /** Retry delay (ms) */
  retryDelay?: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
}

// ============================================================
// OpenClaw Agent Service Implementation
// ============================================================

export class OpenClawAgentService implements AgentService {
  readonly type = 'openclaw' as const;

  private config: Required<OpenClawConfig>;
  private ws: WebSocket | null = null;
  private sessions: Map<string, {
    state: SessionState;
    handlers: Set<AgentEventHandler>;
  }> = new Map();
  private messageQueue: OpenClawMessage[] = [];
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  constructor(config: OpenClawConfig) {
    this.config = {
      gatewayUrl: config.gatewayUrl,
      authToken: config.authToken ?? '',
      timeout: config.timeout ?? 30000,
      retryCount: config.retryCount ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
    };
  }

  // --------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.isConnected) return;

    return new Promise((resolve, reject) => {
      const url = new URL(this.config.gatewayUrl);
      if (this.config.authToken) {
        url.searchParams.set('token', this.config.authToken);
      }

      this.ws = new WebSocket(url.toString());

      const connectionTimeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, this.config.timeout);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.flushMessageQueue();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[OpenClawAgentService] WebSocket error:', error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopHeartbeat();
        this.handleDisconnect();
      };
    });
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.retryCount) {
      console.error('[OpenClawAgentService] Max reconnection attempts reached');
      this.notifyAllSessions('session_error', {
        code: 'CONNECTION_LOST',
        message: 'Failed to reconnect to OpenClaw Gateway',
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.retryDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[OpenClawAgentService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
      // Re-register all sessions
      for (const [sessionId, session] of this.sessions) {
        await this.sendWsMessage({
          type: 'connect',
          id: sessionId,
          payload: { sessionId, reconnect: true },
        });
      }
    } catch (error) {
      console.error('[OpenClawAgentService] Reconnection failed:', error);
      this.reconnect();
    }
  }

  private handleDisconnect(): void {
    // Clean up pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Attempt reconnection
    this.reconnect();
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendWsMessage({ type: 'ping', timestamp: Date.now() });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // --------------------------------------------------------
  // Message Handling
  // --------------------------------------------------------

  private async sendWsMessage(message: OpenClawMessage): Promise<void> {
    if (!this.isConnected) {
      this.messageQueue.push(message);
      await this.connect();
      return;
    }

    this.ws?.send(JSON.stringify(message));
  }

  private async sendRequest<T>(message: OpenClawMessage): Promise<T> {
    const requestId = message.id || this.generateRequestId();
    message.id = requestId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, this.config.timeout);

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.sendWsMessage(message);
    });
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws?.send(JSON.stringify(message));
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const message: OpenClawMessage = JSON.parse(data);

      // Handle heartbeat response
      if (message.type === 'pong') {
        return;
      }

      // Handle request response
      if (message.id && this.pendingRequests.has(message.id)) {
        const request = this.pendingRequests.get(message.id)!;
        clearTimeout(request.timeout);
        this.pendingRequests.delete(message.id);

        if (message.type === 'error') {
          request.reject(new Error((message.payload as any)?.message || 'Unknown error'));
        } else {
          request.resolve(message.payload);
        }
        return;
      }

      // Handle push message
      this.handlePushMessage(message);
    } catch (error) {
      console.error('[OpenClawAgentService] Failed to parse message:', error);
    }
  }

  private handlePushMessage(message: OpenClawMessage): void {
    const event = this.mapOpenClawToAgentEvent(message);
    if (!event) return;

    // Notify relevant session
    const sessionId = (message.payload as any)?.sessionId;
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.handlers.forEach(handler => {
          try {
            handler(event);
          } catch (error) {
            console.error('[OpenClawAgentService] Handler error:', error);
          }
        });
      }
    }
  }

  private mapOpenClawToAgentEvent(message: OpenClawMessage): AgentEvent | null {
    const sessionId = (message.payload as any)?.sessionId || 'unknown';
    const timestamp = message.timestamp || Date.now();

    switch (message.type) {
      case 'message': {
        const payload = message.payload as any;
        if (payload.delta) {
          return {
            id: this.generateEventId(),
            type: 'message_delta',
            sessionId,
            timestamp,
            payload: {
              messageId: payload.messageId,
              type: payload.contentType || 'text',
              content: payload.delta,
              isFinal: payload.isFinal,
            },
          };
        } else if (payload.content) {
          return {
            id: this.generateEventId(),
            type: 'message_end',
            sessionId,
            timestamp,
            payload: {
              messageId: payload.messageId,
              content: payload.content,
              actions: payload.actions,
            },
          };
        }
        return null;
      }

      case 'tool_call': {
        const payload = message.payload as any;
        return {
          id: this.generateEventId(),
          type: 'tool_start',
          sessionId,
          timestamp,
          payload: {
            id: payload.toolCallId,
            name: payload.name,
            arguments: payload.arguments,
            status: 'running',
          },
        };
      }

      case 'tool_result': {
        const payload = message.payload as any;
        if (payload.error) {
          return {
            id: this.generateEventId(),
            type: 'tool_error',
            sessionId,
            timestamp,
            payload: {
              toolId: payload.toolCallId,
              error: payload.error,
            },
          };
        }
        return {
          id: this.generateEventId(),
          type: 'tool_end',
          sessionId,
          timestamp,
          payload: {
            toolId: payload.toolCallId,
            result: payload.result,
          },
        };
      }

      case 'state_update': {
        const payload = message.payload as any;
        if (payload.agentState) {
          const status = payload.agentState.status;
          if (status === 'thinking') {
            return {
              id: this.generateEventId(),
              type: 'agent_thinking',
              sessionId,
              timestamp,
              payload: { thought: payload.agentState.thought },
            };
          } else if (status === 'waiting') {
            return {
              id: this.generateEventId(),
              type: 'agent_waiting',
              sessionId,
              timestamp,
              payload: {
                id: this.generateEventId(),
                componentId: payload.agentState.waitingFor?.componentId,
                possibleActions: payload.agentState.waitingFor?.possibleActions || [],
              },
            };
          } else if (status === 'idle') {
            return {
              id: this.generateEventId(),
              type: 'agent_idle',
              sessionId,
              timestamp,
              payload: {},
            };
          }
        }
        return null;
      }

      case 'error': {
        const payload = message.payload as any;
        return {
          id: this.generateEventId(),
          type: 'agent_error',
          sessionId,
          timestamp,
          payload: {
            code: payload.code || 'UNKNOWN_ERROR',
            message: payload.message || 'An error occurred',
          },
        };
      }

      default:
        return null;
    }
  }

  // --------------------------------------------------------
  // AgentService Implementation
  // --------------------------------------------------------

  async startSession(config: SessionConfig): Promise<SessionState> {
    await this.connect();

    const sessionId = config.sessionId || this.generateSessionId();

    const response = await this.sendRequest<{ state: SessionState }>({
      type: 'connect',
      id: this.generateRequestId(),
      payload: {
        sessionId,
        agentId: config.agentId,
        userId: config.userId,
        workspaceId: config.workspaceId,
        context: config.context,
      },
    });

    const state = response.state || this.createInitialState(sessionId, config);

    this.sessions.set(sessionId, {
      state,
      handlers: new Set(),
    });

    return state;
  }

  async endSession(sessionId: string): Promise<void> {
    await this.sendWsMessage({
      type: 'disconnect',
      payload: { sessionId },
    });

    this.sessions.delete(sessionId);

    // If no active sessions remain, close the connection
    if (this.sessions.size === 0) {
      this.ws?.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  async sendMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.sendWsMessage({
      type: 'message',
      payload: {
        sessionId,
        content,
        metadata,
        role: 'user',
      },
    });
  }

  async executeTask(sessionId: string, config: TaskConfig): Promise<string> {
    const response = await this.sendRequest<{ taskId: string }>({
      type: 'message',
      id: this.generateRequestId(),
      payload: {
        sessionId,
        type: 'task',
        task: config,
      },
    });

    return response.taskId;
  }

  async handleInteraction(sessionId: string, interaction: UserInteraction): Promise<void> {
    await this.sendWsMessage({
      type: 'message',
      payload: {
        sessionId,
        type: 'interaction',
        interaction,
      },
    });
  }

  async pauseSession(sessionId: string): Promise<void> {
    await this.sendWsMessage({
      type: 'message',
      payload: {
        sessionId,
        type: 'control',
        command: 'pause',
      },
    });
  }

  async resumeSession(sessionId: string): Promise<void> {
    await this.sendWsMessage({
      type: 'message',
      payload: {
        sessionId,
        type: 'control',
        command: 'resume',
      },
    });
  }

  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session.state;
    }

    // Fetch from server
    try {
      const response = await this.sendRequest<{ state: SessionState }>({
        type: 'message',
        id: this.generateRequestId(),
        payload: {
          sessionId,
          type: 'get_state',
        },
      });
      return response.state;
    } catch {
      return null;
    }
  }

  subscribe(sessionId: string, handler: AgentEventHandler): () => void {
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Create placeholder session
      session = {
        state: this.createInitialState(sessionId, {
          agentId: 'unknown',
          userId: 'unknown',
          workspaceId: 'unknown',
        }),
        handlers: new Set(),
      };
      this.sessions.set(sessionId, session);
    }

    session.handlers.add(handler);

    return () => {
      session?.handlers.delete(handler);
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.isConnected) {
      try {
        await this.connect();
      } catch {
        return false;
      }
    }

    try {
      await this.sendRequest<{ ok: boolean }>({
        type: 'ping',
        id: this.generateRequestId(),
      });
      return true;
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------

  private createInitialState(sessionId: string, config: SessionConfig): SessionState {
    return {
      sessionId,
      messages: [],
      tasks: [],
      participants: [],
      completedInteractions: [],
      timeline: [],
      stateSnapshots: [],
      componentStates: {},
      agentState: { status: 'idle' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private notifyAllSessions(type: AgentEvent['type'], payload: unknown): void {
    for (const [sessionId, session] of this.sessions) {
      const event: AgentEvent = {
        id: this.generateEventId(),
        type,
        sessionId,
        timestamp: Date.now(),
        payload,
      } as AgentEvent;

      session.handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error('[OpenClawAgentService] Handler error:', error);
        }
      });
    }
  }

  private generateSessionId(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // --------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------

  dispose(): void {
    this.stopHeartbeat();

    // Clean up pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Service disposed'));
    }
    this.pendingRequests.clear();

    // Close connection
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;

    // Clean up sessions
    this.sessions.clear();
    this.messageQueue = [];
  }
}
