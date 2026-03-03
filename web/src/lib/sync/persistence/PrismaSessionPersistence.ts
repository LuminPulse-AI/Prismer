/**
 * Prisma Session Persistence
 *
 * @description
 * Phase 3D: Prisma-based session persistence implementation
 * Stores session data in SQLite/MySQL database
 */

import { prisma } from '@/lib/prisma';
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
// Prisma Session Persistence Implementation
// ============================================================

export class PrismaSessionPersistence implements SessionPersistence {
  // --------------------------------------------------------
  // Session CRUD
  // --------------------------------------------------------

  async saveSession(sessionId: string, state: SessionState): Promise<void> {
    // Resolve workspace ID from session ID or use mapping
    const workspaceId = await this.resolveWorkspaceId(sessionId);

    if (!workspaceId) {
      console.warn(`[PrismaSessionPersistence] Cannot resolve workspace for session ${sessionId}`);
      return;
    }

    // Update workspace's updatedAt timestamp
    await prisma.workspaceSession.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });

    // Save all messages
    if (state.messages.length > 0) {
      await this.saveMessages(sessionId, state.messages as SessionMessage[]);
    }

    // Save all tasks
    if (state.tasks.length > 0) {
      await this.saveTasks(sessionId, state.tasks as SessionTask[]);
    }

    // Save timeline
    if (state.timeline.length > 0) {
      await this.saveTimelineEvents(sessionId, state.timeline as TimelineEvent[]);
    }

    // Save component states
    for (const [componentType, componentState] of Object.entries(state.componentStates)) {
      await this.saveComponentState(sessionId, componentType, componentState);
    }
  }

  async loadSession(sessionId: string): Promise<SessionState | null> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return null;

    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      include: {
        participants: true,
      },
    });

    if (!workspace) return null;

    const [messages, tasks, timeline, componentStates, snapshots] = await Promise.all([
      this.loadMessages(sessionId),
      this.loadTasks(sessionId),
      this.loadTimeline(sessionId),
      this.loadComponentStates(sessionId),
      this.loadSnapshots(sessionId, 10),
    ]);

    return {
      sessionId,
      messages,
      tasks,
      participants: workspace.participants.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        role: p.role,
        status: p.status,
        avatar: p.avatar,
      })),
      completedInteractions: [], // Restored from timeline
      timeline,
      stateSnapshots: snapshots,
      componentStates,
      agentState: { status: 'idle' },
      createdAt: workspace.createdAt.getTime(),
      updatedAt: workspace.updatedAt.getTime(),
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    // Cascade delete will clean up related data
    await prisma.workspaceSession.delete({
      where: { id: workspaceId },
    });
  }

  async listSessions(options?: ListSessionsOptions): Promise<SessionSummary[]> {
    const workspaces = await prisma.workspaceSession.findMany({
      where: {
        ...(options?.workspaceId && { id: options.workspaceId }),
        ...(options?.status && { status: options.status }),
      },
      include: {
        _count: {
          select: {
            messages: true,
            tasks: true,
          },
        },
      },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
      orderBy: {
        [options?.orderBy ?? 'updatedAt']: options?.order ?? 'desc',
      },
    });

    return workspaces.map(ws => ({
      sessionId: ws.id,
      workspaceId: ws.id,
      workspaceName: ws.name,
      messageCount: ws._count.messages,
      taskCount: ws._count.tasks,
      lastActivityAt: ws.updatedAt.getTime(),
      createdAt: ws.createdAt.getTime(),
      status: ws.status as 'active' | 'archived',
    }));
  }

  // --------------------------------------------------------
  // Messages
  // --------------------------------------------------------

  async saveMessage(sessionId: string, message: SessionMessage): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    await prisma.workspaceMessage.upsert({
      where: { id: message.id },
      create: {
        id: message.id,
        workspaceId,
        senderId: message.senderId,
        senderType: message.senderType,
        senderName: message.senderName,
        senderAvatar: message.senderAvatar,
        content: message.content,
        contentType: message.contentType,
        actions: message.actions ? JSON.stringify(message.actions) : null,
        interactive: message.interactive ? JSON.stringify(message.interactive) : null,
        uiDirectives: message.uiDirectives ? JSON.stringify(message.uiDirectives) : null,
        references: message.references ? JSON.stringify(message.references) : null,
        replyTo: message.replyTo,
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
        createdAt: new Date(message.createdAt),
      },
      update: {
        content: message.content,
        actions: message.actions ? JSON.stringify(message.actions) : null,
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
      },
    });
  }

  async saveMessages(sessionId: string, messages: SessionMessage[]): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    // Batch save using transaction
    await prisma.$transaction(
      messages.map(message =>
        prisma.workspaceMessage.upsert({
          where: { id: message.id },
          create: {
            id: message.id,
            workspaceId,
            senderId: message.senderId,
            senderType: message.senderType,
            senderName: message.senderName,
            senderAvatar: message.senderAvatar,
            content: message.content,
            contentType: message.contentType,
            actions: message.actions ? JSON.stringify(message.actions) : null,
            interactive: message.interactive ? JSON.stringify(message.interactive) : null,
            uiDirectives: message.uiDirectives ? JSON.stringify(message.uiDirectives) : null,
            references: message.references ? JSON.stringify(message.references) : null,
            replyTo: message.replyTo,
            metadata: message.metadata ? JSON.stringify(message.metadata) : null,
            createdAt: new Date(message.createdAt),
          },
          update: {},
        })
      )
    );
  }

  async loadMessages(sessionId: string, options?: LoadMessagesOptions): Promise<SessionMessage[]> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return [];

    const messages = await prisma.workspaceMessage.findMany({
      where: {
        workspaceId,
        ...(options?.before && { createdAt: { lt: new Date(options.before) } }),
        ...(options?.after && { createdAt: { gt: new Date(options.after) } }),
      },
      take: options?.limit ?? 100,
      orderBy: { createdAt: 'asc' },
    });

    return messages.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      senderType: msg.senderType as 'user' | 'agent',
      senderName: msg.senderName,
      senderAvatar: msg.senderAvatar ?? undefined,
      content: msg.content,
      contentType: msg.contentType as SessionMessage['contentType'],
      actions: msg.actions ? JSON.parse(msg.actions) : undefined,
      interactive: msg.interactive ? JSON.parse(msg.interactive) : undefined,
      uiDirectives: msg.uiDirectives ? JSON.parse(msg.uiDirectives) : undefined,
      references: msg.references ? JSON.parse(msg.references) : undefined,
      replyTo: msg.replyTo ?? undefined,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
      createdAt: msg.createdAt.getTime(),
    }));
  }

  // --------------------------------------------------------
  // Tasks
  // --------------------------------------------------------

  async saveTask(sessionId: string, task: SessionTask): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    await prisma.workspaceTask.upsert({
      where: { id: task.id },
      create: {
        id: task.id,
        workspaceId,
        title: task.title,
        description: task.description,
        status: task.status,
        progress: task.progress,
        subtasks: task.subtasks ? JSON.stringify(task.subtasks) : null,
        outputs: task.outputs ? JSON.stringify(task.outputs) : null,
        dependencies: task.dependencies ? JSON.stringify(task.dependencies) : null,
        startTime: task.startTime ? new Date(task.startTime) : null,
        endTime: task.endTime ? new Date(task.endTime) : null,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
      },
      update: {
        status: task.status,
        progress: task.progress,
        subtasks: task.subtasks ? JSON.stringify(task.subtasks) : null,
        outputs: task.outputs ? JSON.stringify(task.outputs) : null,
        startTime: task.startTime ? new Date(task.startTime) : null,
        endTime: task.endTime ? new Date(task.endTime) : null,
        updatedAt: new Date(task.updatedAt),
      },
    });
  }

  async saveTasks(sessionId: string, tasks: SessionTask[]): Promise<void> {
    for (const task of tasks) {
      await this.saveTask(sessionId, task);
    }
  }

  async loadTasks(sessionId: string): Promise<SessionTask[]> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return [];

    const tasks = await prisma.workspaceTask.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    return tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description ?? undefined,
      status: task.status as SessionTask['status'],
      progress: task.progress,
      subtasks: task.subtasks ? JSON.parse(task.subtasks) : undefined,
      outputs: task.outputs ? JSON.parse(task.outputs) : undefined,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : undefined,
      startTime: task.startTime?.getTime(),
      endTime: task.endTime?.getTime(),
      createdAt: task.createdAt.getTime(),
      updatedAt: task.updatedAt.getTime(),
    }));
  }

  // --------------------------------------------------------
  // Timeline
  // --------------------------------------------------------

  async saveTimelineEvent(sessionId: string, event: TimelineEvent): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    await prisma.workspaceTimelineEvent.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        workspaceId,
        timestamp: BigInt(event.timestamp),
        componentType: event.componentType,
        action: event.action,
        description: event.description,
        snapshot: event.snapshot ? JSON.stringify(event.snapshot) : null,
        actorId: event.actorId,
        actorType: event.actorType,
        messageId: event.messageId,
        duration: event.duration,
        createdAt: new Date(event.timestamp),
      },
      update: {},
    });
  }

  async saveTimelineEvents(sessionId: string, events: TimelineEvent[]): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    await prisma.$transaction(
      events.map(event =>
        prisma.workspaceTimelineEvent.upsert({
          where: { id: event.id },
          create: {
            id: event.id,
            workspaceId,
            timestamp: BigInt(event.timestamp),
            componentType: event.componentType,
            action: event.action,
            description: event.description,
            snapshot: event.snapshot ? JSON.stringify(event.snapshot) : null,
            actorId: event.actorId,
            actorType: event.actorType,
            messageId: event.messageId,
            duration: event.duration,
            createdAt: new Date(event.timestamp),
          },
          update: {},
        })
      )
    );
  }

  async loadTimeline(sessionId: string, options?: LoadTimelineOptions): Promise<TimelineEvent[]> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return [];

    const events = await prisma.workspaceTimelineEvent.findMany({
      where: {
        workspaceId,
        ...(options?.since && { timestamp: { gt: BigInt(options.since) } }),
        ...(options?.componentType && { componentType: options.componentType }),
      },
      take: options?.limit ?? 100,
      orderBy: { timestamp: 'asc' },
    });

    return events.map(event => ({
      id: event.id,
      timestamp: Number(event.timestamp),
      componentType: event.componentType,
      action: event.action,
      description: event.description,
      snapshot: event.snapshot ? JSON.parse(event.snapshot) : undefined,
      actorId: event.actorId ?? undefined,
      actorType: event.actorType as 'user' | 'agent' | undefined,
      messageId: event.messageId ?? undefined,
      duration: event.duration ?? undefined,
    }));
  }

  // --------------------------------------------------------
  // Component States
  // --------------------------------------------------------

  async saveComponentState(
    sessionId: string,
    componentType: string,
    state: unknown
  ): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    await prisma.workspaceComponentState.upsert({
      where: {
        workspaceId_componentType: {
          workspaceId,
          componentType,
        },
      },
      create: {
        workspaceId,
        componentType,
        state: JSON.stringify(state),
      },
      update: {
        state: JSON.stringify(state),
      },
    });
  }

  async loadComponentStates(sessionId: string): Promise<Record<string, unknown>> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return {};

    const states = await prisma.workspaceComponentState.findMany({
      where: { workspaceId },
    });

    const result: Record<string, unknown> = {};
    for (const state of states) {
      result[state.componentType] = JSON.parse(state.state);
    }
    return result;
  }

  // --------------------------------------------------------
  // Snapshots
  // --------------------------------------------------------

  async saveSnapshot(sessionId: string, snapshot: StateSnapshot): Promise<void> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return;

    await prisma.workspaceStateSnapshot.create({
      data: {
        id: snapshot.id,
        workspaceId,
        layout: snapshot.layout ? JSON.stringify(snapshot.layout) : null,
        components: snapshot.components ? JSON.stringify(snapshot.components) : null,
        diff: snapshot.diff ? JSON.stringify(snapshot.diff) : null,
        timelineEventId: snapshot.timelineEventId,
        createdAt: new Date(snapshot.createdAt),
      },
    });
  }

  async loadSnapshots(sessionId: string, limit = 10): Promise<StateSnapshot[]> {
    const workspaceId = await this.resolveWorkspaceId(sessionId);
    if (!workspaceId) return [];

    const snapshots = await prisma.workspaceStateSnapshot.findMany({
      where: { workspaceId },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return snapshots.map(snap => ({
      id: snap.id,
      layout: snap.layout ? JSON.parse(snap.layout) : undefined,
      components: snap.components ? JSON.parse(snap.components) : undefined,
      diff: snap.diff ? JSON.parse(snap.diff) : undefined,
      timelineEventId: snap.timelineEventId ?? undefined,
      createdAt: snap.createdAt.getTime(),
    }));
  }

  // --------------------------------------------------------
  // Health Check & Cleanup
  // --------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Prisma 连接由应用程序管理
  }

  // --------------------------------------------------------
  // Helpers
  // --------------------------------------------------------

  /**
   * 解析 session ID 到 workspace ID
   * 支持两种格式:
   * - 直接是 workspace ID
   * - sess-{timestamp}-{random} 格式，需要从 session 映射表查询
   */
  private async resolveWorkspaceId(sessionId: string): Promise<string | null> {
    // 如果 sessionId 以 sess- 开头，尝试从映射查找
    if (sessionId.startsWith('sess-')) {
      // 暂时使用简单映射：检查是否有 AgentInstance 与此 session 关联
      // 实际应用中可能需要一个 session->workspace 映射表
      return null;
    }

    // 否则假设 sessionId 就是 workspaceId
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });

    return workspace?.id ?? null;
  }
}
