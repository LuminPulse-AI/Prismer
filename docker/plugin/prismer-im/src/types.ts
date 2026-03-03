/**
 * Prismer IM Channel Plugin - Type Definitions
 *
 * @description
 * Type definitions for the Prismer IM Channel Plugin.
 * Handles communication with PrismerCloud IM Server.
 */

// ============================================================
// Account Configuration
// ============================================================

/**
 * Account configuration for connecting to IM Server
 */
export interface PrismerIMAccountConfig {
  /** IM Server URL (e.g., "https://prismer.cloud") */
  imServerUrl: string;

  /** Bound conversation ID */
  conversationId: string;

  /** JWT token for authentication */
  agentToken: string;

  /** Agent capabilities for discovery */
  capabilities?: string[];

  /** Agent display name */
  displayName?: string;

  /** Agent description */
  description?: string;
}

/**
 * Resolved account with runtime state
 */
export interface ResolvedPrismerIMAccount extends PrismerIMAccountConfig {
  /** Account ID (from config key) */
  accountId: string;

  /** Whether the account is enabled */
  enabled: boolean;

  /** Connection status */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';

  /** Last error message */
  lastError?: string;

  /** Last heartbeat time */
  lastHeartbeat?: Date;
}

// ============================================================
// Message Types
// ============================================================

/**
 * IM Message types supported by PrismerCloud (SDK v1.7 aligned)
 */
export type IMMessageType =
  | 'text'
  | 'markdown'
  | 'code'
  | 'image'
  | 'file'
  | 'tool_call'
  | 'tool_result'
  | 'system_event'
  | 'thinking';

/**
 * Prismer-specific metadata types
 */
export type PrismerMetadataType =
  | 'ui_directive'
  | 'skill_event'
  | 'tool_call'
  | 'tool_result';

/**
 * UIDirective type (subset - see full list in docker/README.md)
 */
export type UIDirectiveType =
  // Global
  | 'SWITCH_COMPONENT'
  | 'LOAD_DOCUMENT'
  | 'SHOW_NOTIFICATION'
  | 'UPDATE_LAYOUT'
  // Jupyter
  | 'JUPYTER_ADD_CELL'
  | 'JUPYTER_EXECUTE_CELL'
  | 'JUPYTER_UPDATE_CELL'
  | 'JUPYTER_CLEAR_OUTPUTS'
  // LaTeX
  | 'LATEX_UPDATE_FILE'
  | 'LATEX_COMPILE'
  | 'LATEX_SCROLL_TO_LINE'
  // PDF
  | 'PDF_LOAD_DOCUMENT'
  | 'PDF_NAVIGATE_TO_PAGE'
  | 'PDF_HIGHLIGHT_REGION'
  // Code Playground
  | 'CODE_LOAD_FILES'
  | 'CODE_UPDATE_FILE'
  | 'CODE_EXECUTE'
  | 'CODE_TERMINAL_OUTPUT'
  // AG Grid
  | 'GRID_LOAD_DATA'
  | 'GRID_UPDATE_DATA'
  // Timeline
  | 'TIMELINE_ADD_EVENT'
  | 'TIMELINE_NAVIGATE';

/**
 * UIDirective structure
 */
export interface UIDirective {
  type: UIDirectiveType;
  payload: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Skill execution phase
 */
export type SkillEventPhase = 'start' | 'progress' | 'complete' | 'error';

/**
 * Skill event structure
 */
export interface SkillEvent {
  skillName: string;
  phase: SkillEventPhase;
  progress?: number;
  message?: string;
  artifacts?: SkillArtifact[];
  error?: string;
}

/**
 * Skill artifact
 */
export interface SkillArtifact {
  type: string;
  path: string;
  componentTarget?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Prismer-specific message metadata
 */
export interface PrismerMetadata {
  type: PrismerMetadataType;
  directive?: UIDirective;
  skillEvent?: SkillEvent;
  toolCall?: {
    callId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: {
    callId: string;
    result: unknown;
    isError?: boolean;
  };
}

/**
 * IM Message sender info
 */
export interface IMMessageSender {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * IM Message structure (from PrismerCloud API)
 */
export interface IMMessage {
  id: string;
  conversationId: string;
  senderId: string;
  /** Sender details (populated from WebSocket events) */
  sender?: IMMessageSender;
  content: string;
  type: IMMessageType;
  metadata?: {
    prismer?: PrismerMetadata;
    [key: string]: unknown;
  };
  routing?: {
    mode: 'explicit' | 'capability' | 'broadcast' | 'none';
    targets?: Array<{ userId: string; username: string }>;
  };
  createdAt: string;
  updatedAt?: string;
}

// ============================================================
// API Response Types
// ============================================================

/**
 * Standard API response wrapper
 */
export interface IMApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Send message response
 */
export interface SendMessageResponse {
  conversationId: string;
  message: IMMessage;
  routing?: {
    mode: string;
    targets: Array<{ userId: string; username: string }>;
  };
}

/**
 * WebSocket event types
 */
export type WSEventType =
  | 'authenticated'
  | 'message.new'
  | 'message.updated'
  | 'typing.start'
  | 'typing.stop'
  | 'error';

/**
 * WebSocket message structure
 */
export interface WSMessage {
  type: WSEventType;
  payload: unknown;
}

// ============================================================
// Channel Status
// ============================================================

/**
 * Channel status snapshot
 */
export interface ChannelStatusSnapshot {
  accountId: string;
  status: 'online' | 'busy' | 'offline' | 'error';
  imServerConnected: boolean;
  wsConnected: boolean;
  lastMessageAt?: Date;
  lastHeartbeat?: Date;
  error?: string;
  stats: {
    messagesSent: number;
    messagesReceived: number;
    directivesSent: number;
    skillEventsSent: number;
  };
}
