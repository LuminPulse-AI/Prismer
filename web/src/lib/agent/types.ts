/**
 * Agent Service Types
 *
 * @description
 * Phase 3A: Agent service abstraction layer type definitions
 * Defines the AgentService interface and AgentEvent types for unifying different Agent backend implementations
 *
 * Design principles:
 * - Compatible with the OpenClaw protocol
 * - Integrates with the existing Sync protocol
 * - Supports streaming event processing
 */

import type { SessionState, AgentState, UIDirective, StateDelta } from '@/lib/sync/types';

// ============================================================
// Agent Event Types
// ============================================================

/**
 * Agent event type enum
 */
export type AgentEventType =
  // Lifecycle events
  | 'session_start'
  | 'session_end'
  | 'session_error'
  // Agent state changes
  | 'agent_thinking'
  | 'agent_responding'
  | 'agent_waiting'
  | 'agent_idle'
  | 'agent_error'
  // Message events
  | 'message_start'
  | 'message_delta'
  | 'message_end'
  // Tool call events
  | 'tool_start'
  | 'tool_progress'
  | 'tool_end'
  | 'tool_error'
  // Task events
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'task_failed'
  // UI directive events
  | 'ui_directive'
  // Component state events
  | 'component_state_update'
  // Interaction request events
  | 'interaction_request'
  | 'interaction_response';

/**
 * Message delta content
 */
export interface MessageDelta {
  /** Message ID */
  messageId: string;
  /** Delta content type */
  type: 'text' | 'code' | 'markdown' | 'thinking';
  /** Delta text */
  content: string;
  /** Whether this is the final chunk */
  isFinal?: boolean;
}

/**
 * Tool call information
 */
export interface ToolCall {
  /** Tool call ID */
  id: string;
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Call status */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Progress (0-100) */
  progress?: number;
  /** Result */
  result?: unknown;
  /** Error message */
  error?: string;
}

/**
 * Interaction request
 */
export interface InteractionRequest {
  /** Request ID */
  id: string;
  /** Target component */
  componentId: string;
  /** Available actions */
  possibleActions: string[];
  /** Prompt message */
  prompt?: string;
  /** Timeout (ms) */
  timeout?: number;
}

/**
 * Agent event base structure
 */
export interface AgentEventBase {
  /** Event ID */
  id: string;
  /** Event type */
  type: AgentEventType;
  /** Session ID */
  sessionId: string;
  /** Timestamp (epoch ms) */
  timestamp: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent event union type
 */
export type AgentEvent =
  | (AgentEventBase & { type: 'session_start'; payload: { sessionId: string; agentId: string } })
  | (AgentEventBase & { type: 'session_end'; payload: { reason: string } })
  | (AgentEventBase & { type: 'session_error'; payload: { code: string; message: string } })
  | (AgentEventBase & { type: 'agent_thinking'; payload: { thought?: string } })
  | (AgentEventBase & { type: 'agent_responding'; payload: { messageId: string } })
  | (AgentEventBase & { type: 'agent_waiting'; payload: InteractionRequest })
  | (AgentEventBase & { type: 'agent_idle'; payload: Record<string, never> })
  | (AgentEventBase & { type: 'agent_error'; payload: { code: string; message: string } })
  | (AgentEventBase & { type: 'message_start'; payload: { messageId: string; senderId: string; senderType: 'agent' | 'user' } })
  | (AgentEventBase & { type: 'message_delta'; payload: MessageDelta })
  | (AgentEventBase & { type: 'message_end'; payload: { messageId: string; content: string; actions?: unknown[] } })
  | (AgentEventBase & { type: 'tool_start'; payload: ToolCall })
  | (AgentEventBase & { type: 'tool_progress'; payload: { toolId: string; progress: number; status?: string } })
  | (AgentEventBase & { type: 'tool_end'; payload: { toolId: string; result: unknown } })
  | (AgentEventBase & { type: 'tool_error'; payload: { toolId: string; error: string } })
  | (AgentEventBase & { type: 'task_created'; payload: { taskId: string; title: string; description?: string } })
  | (AgentEventBase & { type: 'task_updated'; payload: { taskId: string; status: string; progress: number } })
  | (AgentEventBase & { type: 'task_completed'; payload: { taskId: string; outputs?: unknown[] } })
  | (AgentEventBase & { type: 'task_failed'; payload: { taskId: string; error: string } })
  | (AgentEventBase & { type: 'ui_directive'; payload: UIDirective })
  | (AgentEventBase & { type: 'component_state_update'; payload: { componentType: string; state: unknown } })
  | (AgentEventBase & { type: 'interaction_request'; payload: InteractionRequest })
  | (AgentEventBase & { type: 'interaction_response'; payload: { requestId: string; action: string; data?: unknown } });

// ============================================================
// Agent Service Interface
// ============================================================

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Session ID (optional, auto-generated if not provided) */
  sessionId?: string;
  /** Agent Instance ID */
  agentId: string;
  /** User ID */
  userId: string;
  /** Workspace ID */
  workspaceId: string;
  /** Initial context */
  context?: {
    /** Related papers */
    papers?: string[];
    /** Related notes */
    notes?: string[];
    /** Initial message */
    initialMessage?: string;
  };
}

/**
 * Task execution configuration
 */
export interface TaskConfig {
  /** Task title */
  title: string;
  /** Task description */
  description?: string;
  /** Task type */
  type?: 'research' | 'writing' | 'analysis' | 'review' | 'general';
  /** Dependent task IDs */
  dependencies?: string[];
  /** Priority */
  priority?: number;
  /** Timeout (ms) */
  timeout?: number;
}

/**
 * User interaction data
 */
export interface UserInteraction {
  /** Component ID */
  componentId: string;
  /** Action ID */
  actionId: string;
  /** Additional data */
  data?: unknown;
}

/**
 * Agent service interface
 *
 * @description
 * Defines the methods that Agent backends must implement.
 * Supports DemoAgentService (local demo) and OpenClawAgentService (production).
 */
export interface AgentService {
  /**
   * Service type identifier
   */
  readonly type: 'demo' | 'openclaw';

  /**
   * Start session
   *
   * @param config - Session configuration
   * @returns Session state
   */
  startSession(config: SessionConfig): Promise<SessionState>;

  /**
   * End session
   *
   * @param sessionId - Session ID
   */
  endSession(sessionId: string): Promise<void>;

  /**
   * Send user message
   *
   * @param sessionId - Session ID
   * @param content - Message content
   * @param metadata - Metadata
   */
  sendMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Execute task
   *
   * @param sessionId - Session ID
   * @param config - Task configuration
   * @returns Task ID
   */
  executeTask(sessionId: string, config: TaskConfig): Promise<string>;

  /**
   * Handle user interaction
   *
   * @param sessionId - Session ID
   * @param interaction - Interaction data
   */
  handleInteraction(sessionId: string, interaction: UserInteraction): Promise<void>;

  /**
   * Pause session
   *
   * @param sessionId - Session ID
   */
  pauseSession(sessionId: string): Promise<void>;

  /**
   * Resume session
   *
   * @param sessionId - Session ID
   */
  resumeSession(sessionId: string): Promise<void>;

  /**
   * Get session state
   *
   * @param sessionId - Session ID
   * @returns Session state
   */
  getSessionState(sessionId: string): Promise<SessionState | null>;

  /**
   * Subscribe to event stream
   *
   * @param sessionId - Session ID
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  subscribe(sessionId: string, handler: AgentEventHandler): () => void;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Agent event handler
 */
export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

// ============================================================
// Event to Sync Protocol Mapping
// ============================================================

/**
 * AgentEvent to Sync protocol message mapping configuration
 */
export interface EventToSyncMapping {
  /** Agent event type */
  eventType: AgentEventType;
  /** Corresponding Sync message type */
  syncType: 'STATE_DELTA' | 'UI_DIRECTIVE' | 'AGENT_STATUS';
  /** Transform function */
  transform: (event: AgentEvent) => StateDelta | UIDirective | AgentState;
}

/**
 * Create Agent event
 */
export function createAgentEvent<T extends AgentEventType>(
  type: T,
  sessionId: string,
  payload: Extract<AgentEvent, { type: T }>['payload']
): Extract<AgentEvent, { type: T }> {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    sessionId,
    timestamp: Date.now(),
    payload,
  } as Extract<AgentEvent, { type: T }>;
}

// ============================================================
// Service Factory Types
// ============================================================

/**
 * Agent service factory configuration
 */
export interface AgentServiceFactoryConfig {
  /** Default service type */
  defaultType: 'demo' | 'openclaw';
  /** Demo service configuration */
  demo?: {
    /** Simulated delay (ms) */
    simulatedDelay?: number;
    /** Whether to enable demo flow */
    enableDemoFlow?: boolean;
  };
  /** OpenClaw service configuration */
  openclaw?: {
    /** Gateway URL */
    gatewayUrl: string;
    /** Auth token */
    authToken?: string;
    /** Timeout (ms) */
    timeout?: number;
    /** Retry count */
    retryCount?: number;
  };
}

/**
 * Service creation options
 */
export interface CreateServiceOptions {
  /** Service type (overrides default) */
  type?: 'demo' | 'openclaw';
  /** Agent Instance ID */
  agentId: string;
  /** Gateway URL (OpenClaw only) */
  gatewayUrl?: string;
}
