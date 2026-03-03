/**
 * Session Persistence Types
 *
 * @description
 * Phase 3D: Session persistence type definitions
 * Defines interfaces for storing and restoring session data
 */

import type { SessionState, ClientInfo } from '../types';

// ============================================================
// Persistence Interface
// ============================================================

/**
 * Session persistence interface
 */
export interface SessionPersistence {
  /**
   * Save session state
   */
  saveSession(sessionId: string, state: SessionState): Promise<void>;

  /**
   * Load session state
   */
  loadSession(sessionId: string): Promise<SessionState | null>;

  /**
   * Delete session
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * List all sessions
   */
  listSessions(options?: ListSessionsOptions): Promise<SessionSummary[]>;

  /**
   * Save a message
   */
  saveMessage(sessionId: string, message: SessionMessage): Promise<void>;

  /**
   * Save messages (batch)
   */
  saveMessages(sessionId: string, messages: SessionMessage[]): Promise<void>;

  /**
   * Load messages
   */
  loadMessages(sessionId: string, options?: LoadMessagesOptions): Promise<SessionMessage[]>;

  /**
   * Save a task
   */
  saveTask(sessionId: string, task: SessionTask): Promise<void>;

  /**
   * Save tasks (batch)
   */
  saveTasks(sessionId: string, tasks: SessionTask[]): Promise<void>;

  /**
   * Load tasks
   */
  loadTasks(sessionId: string): Promise<SessionTask[]>;

  /**
   * Save a timeline event
   */
  saveTimelineEvent(sessionId: string, event: TimelineEvent): Promise<void>;

  /**
   * Save timeline events (batch)
   */
  saveTimelineEvents(sessionId: string, events: TimelineEvent[]): Promise<void>;

  /**
   * Load timeline
   */
  loadTimeline(sessionId: string, options?: LoadTimelineOptions): Promise<TimelineEvent[]>;

  /**
   * Save component state
   */
  saveComponentState(
    sessionId: string,
    componentType: string,
    state: unknown
  ): Promise<void>;

  /**
   * Load component states
   */
  loadComponentStates(sessionId: string): Promise<Record<string, unknown>>;

  /**
   * Save state snapshot
   */
  saveSnapshot(sessionId: string, snapshot: StateSnapshot): Promise<void>;

  /**
   * Load snapshots
   */
  loadSnapshots(sessionId: string, limit?: number): Promise<StateSnapshot[]>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;

  /**
   * Close connection
   */
  close(): Promise<void>;
}

// ============================================================
// Data Types
// ============================================================

/**
 * Session message
 */
export interface SessionMessage {
  id: string;
  senderId: string;
  senderType: 'user' | 'agent';
  senderName: string;
  senderAvatar?: string;
  content: string;
  contentType: 'text' | 'markdown' | 'code' | 'image' | 'file';
  actions?: unknown[];
  interactive?: unknown[];
  uiDirectives?: unknown[];
  references?: string[];
  replyTo?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

/**
 * Session task
 */
export interface SessionTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  subtasks?: unknown[];
  outputs?: unknown[];
  dependencies?: string[];
  startTime?: number;
  endTime?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Timeline event
 */
export interface TimelineEvent {
  id: string;
  timestamp: number;
  componentType: string;
  action: string;
  description: string;
  snapshot?: unknown;
  actorId?: string;
  actorType?: 'user' | 'agent';
  messageId?: string;
  duration?: number;
}

/**
 * State snapshot
 */
export interface StateSnapshot {
  id: string;
  layout?: unknown;
  components?: unknown;
  diff?: unknown;
  timelineEventId?: string;
  createdAt: number;
}

/**
 * Session summary
 */
export interface SessionSummary {
  sessionId: string;
  workspaceId: string;
  workspaceName?: string;
  messageCount: number;
  taskCount: number;
  lastActivityAt: number;
  createdAt: number;
  status: 'active' | 'archived';
}

// ============================================================
// Options
// ============================================================

/**
 * List sessions options
 */
export interface ListSessionsOptions {
  workspaceId?: string;
  status?: 'active' | 'archived';
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'updatedAt';
  order?: 'asc' | 'desc';
}

/**
 * Load messages options
 */
export interface LoadMessagesOptions {
  limit?: number;
  before?: number;
  after?: number;
}

/**
 * Load timeline options
 */
export interface LoadTimelineOptions {
  limit?: number;
  since?: number;
  componentType?: string;
}

// ============================================================
// Factory Types
// ============================================================

/**
 * Persistence type
 */
export type PersistenceType = 'memory' | 'prisma';

/**
 * Persistence configuration
 */
export interface PersistenceConfig {
  type: PersistenceType;
  options?: Record<string, unknown>;
}
