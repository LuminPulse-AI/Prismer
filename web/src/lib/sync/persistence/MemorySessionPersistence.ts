/**
 * Memory Session Persistence
 *
 * @description
 * Phase 3D: In-memory session persistence implementation
 * Used for development and testing; data is stored in memory only
 */

import type { SessionState } from '../types';
import type {
  SessionPersistence,
  SessionMessage,
  SessionTask,
  TimelineEvent,
  StateSnapshot,
  SessionSummary,
  ListSessionsOptions,
  LoadMessagesOptions,
  LoadTimelineOptions,
} from './types';

// ============================================================
// Memory Session Persistence Implementation
// ============================================================

export class MemorySessionPersistence implements SessionPersistence {
  private sessions: Map<string, {
    state: SessionState;
    messages: SessionMessage[];
    tasks: SessionTask[];
    timeline: TimelineEvent[];
    componentStates: Record<string, unknown>;
    snapshots: StateSnapshot[];
    createdAt: number;
    updatedAt: number;
  }> = new Map();

  // --------------------------------------------------------
  // Session CRUD
  // --------------------------------------------------------

  async saveSession(sessionId: string, state: SessionState): Promise<void> {
    const existing = this.sessions.get(sessionId);

    this.sessions.set(sessionId, {
      state,
      messages: state.messages as SessionMessage[],
      tasks: state.tasks as SessionTask[],
      timeline: state.timeline as TimelineEvent[],
      componentStates: state.componentStates as Record<string, unknown>,
      snapshots: state.stateSnapshots as StateSnapshot[],
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }

  async loadSession(sessionId: string): Promise<SessionState | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      ...session.state,
      messages: session.messages,
      tasks: session.tasks,
      timeline: session.timeline,
      componentStates: session.componentStates,
      stateSnapshots: session.snapshots,
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async listSessions(options?: ListSessionsOptions): Promise<SessionSummary[]> {
    const sessions = Array.from(this.sessions.entries());

    let filtered = sessions;

    // Apply filters
    if (options?.workspaceId) {
      filtered = filtered.filter(([id]) => id === options.workspaceId);
    }

    // Sort
    const orderBy = options?.orderBy ?? 'updatedAt';
    const order = options?.order ?? 'desc';
    filtered.sort((a, b) => {
      const aVal = orderBy === 'createdAt' ? a[1].createdAt : a[1].updatedAt;
      const bVal = orderBy === 'createdAt' ? b[1].createdAt : b[1].updatedAt;
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    const paginated = filtered.slice(offset, offset + limit);

    return paginated.map(([sessionId, session]) => ({
      sessionId,
      workspaceId: sessionId,
      messageCount: session.messages.length,
      taskCount: session.tasks.length,
      lastActivityAt: session.updatedAt,
      createdAt: session.createdAt,
      status: 'active' as const,
    }));
  }

  // --------------------------------------------------------
  // Messages
  // --------------------------------------------------------

  async saveMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    const index = session.messages.findIndex(m => m.id === message.id);

    if (index >= 0) {
      session.messages[index] = message;
    } else {
      session.messages.push(message);
    }

    session.updatedAt = Date.now();
  }

  async saveMessages(sessionId: string, messages: SessionMessage[]): Promise<void> {
    for (const message of messages) {
      await this.saveMessage(sessionId, message);
    }
  }

  async loadMessages(sessionId: string, options?: LoadMessagesOptions): Promise<SessionMessage[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    let messages = [...session.messages];

    if (options?.before) {
      messages = messages.filter(m => m.createdAt < options.before!);
    }
    if (options?.after) {
      messages = messages.filter(m => m.createdAt > options.after!);
    }

    messages.sort((a, b) => a.createdAt - b.createdAt);

    if (options?.limit) {
      messages = messages.slice(-options.limit);
    }

    return messages;
  }

  // --------------------------------------------------------
  // Tasks
  // --------------------------------------------------------

  async saveTask(sessionId: string, task: SessionTask): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    const index = session.tasks.findIndex(t => t.id === task.id);

    if (index >= 0) {
      session.tasks[index] = task;
    } else {
      session.tasks.push(task);
    }

    session.updatedAt = Date.now();
  }

  async saveTasks(sessionId: string, tasks: SessionTask[]): Promise<void> {
    for (const task of tasks) {
      await this.saveTask(sessionId, task);
    }
  }

  async loadTasks(sessionId: string): Promise<SessionTask[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return [...session.tasks];
  }

  // --------------------------------------------------------
  // Timeline
  // --------------------------------------------------------

  async saveTimelineEvent(sessionId: string, event: TimelineEvent): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    const index = session.timeline.findIndex(e => e.id === event.id);

    if (index >= 0) {
      session.timeline[index] = event;
    } else {
      session.timeline.push(event);
    }

    session.updatedAt = Date.now();
  }

  async saveTimelineEvents(sessionId: string, events: TimelineEvent[]): Promise<void> {
    for (const event of events) {
      await this.saveTimelineEvent(sessionId, event);
    }
  }

  async loadTimeline(sessionId: string, options?: LoadTimelineOptions): Promise<TimelineEvent[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    let timeline = [...session.timeline];

    if (options?.since) {
      timeline = timeline.filter(e => e.timestamp > options.since!);
    }
    if (options?.componentType) {
      timeline = timeline.filter(e => e.componentType === options.componentType);
    }

    timeline.sort((a, b) => a.timestamp - b.timestamp);

    if (options?.limit) {
      timeline = timeline.slice(-options.limit);
    }

    return timeline;
  }

  // --------------------------------------------------------
  // Component States
  // --------------------------------------------------------

  async saveComponentState(
    sessionId: string,
    componentType: string,
    state: unknown
  ): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    session.componentStates[componentType] = state;
    session.updatedAt = Date.now();
  }

  async loadComponentStates(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if (!session) return {};
    return { ...session.componentStates };
  }

  // --------------------------------------------------------
  // Snapshots
  // --------------------------------------------------------

  async saveSnapshot(sessionId: string, snapshot: StateSnapshot): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    session.snapshots.push(snapshot);

    // Limit snapshot count
    if (session.snapshots.length > 100) {
      session.snapshots = session.snapshots.slice(-100);
    }

    session.updatedAt = Date.now();
  }

  async loadSnapshots(sessionId: string, limit = 10): Promise<StateSnapshot[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.snapshots.slice(-limit).reverse();
  }

  // --------------------------------------------------------
  // Health Check & Cleanup
  // --------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.sessions.clear();
  }

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  private getOrCreateSession(sessionId: string) {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        state: {
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
        },
        messages: [],
        tasks: [],
        timeline: [],
        componentStates: {},
        snapshots: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }

    return session;
  }

  // --------------------------------------------------------
  // Debug Methods
  // --------------------------------------------------------

  getSessionCount(): number {
    return this.sessions.size;
  }

  clear(): void {
    this.sessions.clear();
  }
}
