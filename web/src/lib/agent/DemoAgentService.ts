/**
 * Demo Agent Service
 *
 * @description
 * Phase 3A: Demo Agent service implementation
 * Simulates Agent behavior for development and testing
 * Backward-compatible with the existing DemoFlowController
 */

import type {
  AgentService,
  AgentEvent,
  AgentEventHandler,
  SessionConfig,
  TaskConfig,
  UserInteraction,
  createAgentEvent,
} from './types';
import type { SessionState, AgentState } from '@/lib/sync/types';

// ============================================================
// Demo Flow Steps (from existing DemoFlowController)
// ============================================================

interface DemoStep {
  id: string;
  type: 'message' | 'task' | 'ui_directive' | 'interaction_wait';
  delay: number;
  data: unknown;
}

const DEFAULT_DEMO_FLOW: DemoStep[] = [
  {
    id: 'greeting',
    type: 'message',
    delay: 500,
    data: {
      content: "Hello! I'm your research assistant. How can I help you today?",
      actions: [
        { id: 'search', label: 'Search Papers', type: 'button' },
        { id: 'analyze', label: 'Analyze Document', type: 'button' },
      ],
    },
  },
  {
    id: 'task-init',
    type: 'task',
    delay: 1000,
    data: {
      title: 'Initializing workspace',
      description: 'Setting up your research environment',
    },
  },
];

// ============================================================
// Demo Agent Service Implementation
// ============================================================

export class DemoAgentService implements AgentService {
  readonly type = 'demo' as const;

  private sessions: Map<string, {
    state: SessionState;
    handlers: Set<AgentEventHandler>;
    stepIndex: number;
    isPaused: boolean;
    timer: NodeJS.Timeout | null;
  }> = new Map();

  private config: {
    simulatedDelay: number;
    enableDemoFlow: boolean;
  };

  constructor(config?: { simulatedDelay?: number; enableDemoFlow?: boolean }) {
    this.config = {
      simulatedDelay: config?.simulatedDelay ?? 1000,
      enableDemoFlow: config?.enableDemoFlow ?? true,
    };
  }

  // --------------------------------------------------------
  // Session Management
  // --------------------------------------------------------

  async startSession(config: SessionConfig): Promise<SessionState> {
    const sessionId = config.sessionId || this.generateSessionId();

    const initialState: SessionState = {
      sessionId,
      messages: [],
      tasks: [],
      participants: [
        {
          id: config.userId,
          name: 'User',
          type: 'user',
          role: 'owner',
          status: 'online',
        },
        {
          id: config.agentId,
          name: 'Research Assistant',
          type: 'agent',
          role: 'agent',
          status: 'online',
          avatar: '/avatars/agent-default.png',
        },
      ],
      completedInteractions: [],
      timeline: [],
      stateSnapshots: [],
      componentStates: {},
      agentState: {
        status: 'idle',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, {
      state: initialState,
      handlers: new Set(),
      stepIndex: -1,
      isPaused: false,
      timer: null,
    });

    // Emit session start event
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'session_start',
      sessionId,
      timestamp: Date.now(),
      payload: { sessionId, agentId: config.agentId },
    });

    // If demo flow is enabled, start execution
    if (this.config.enableDemoFlow) {
      this.scheduleNextStep(sessionId);
    }

    return initialState;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Clean up timer
    if (session.timer) {
      clearTimeout(session.timer);
    }

    // Emit session end event
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'session_end',
      sessionId,
      timestamp: Date.now(),
      payload: { reason: 'user_ended' },
    });

    this.sessions.delete(sessionId);
  }

  async getSessionState(sessionId: string): Promise<SessionState | null> {
    return this.sessions.get(sessionId)?.state ?? null;
  }

  // --------------------------------------------------------
  // Messaging
  // --------------------------------------------------------

  async sendMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const messageId = this.generateMessageId();

    // Add user message
    const userMessage = {
      id: messageId,
      senderId: 'user',
      senderType: 'user' as const,
      senderName: 'User',
      content,
      contentType: 'text' as const,
      createdAt: Date.now(),
      metadata,
    };

    session.state.messages.push(userMessage);
    session.state.updatedAt = Date.now();

    // Update Agent state to thinking
    this.updateAgentState(sessionId, { status: 'running' });

    // Simulate Agent response
    setTimeout(() => {
      this.generateAgentResponse(sessionId, content);
    }, this.config.simulatedDelay);
  }

  private async generateAgentResponse(sessionId: string, userMessage: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.isPaused) return;

    const responseId = this.generateMessageId();

    // Emit message start event
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'message_start',
      sessionId,
      timestamp: Date.now(),
      payload: { messageId: responseId, senderId: 'agent', senderType: 'agent' },
    });

    // Simulate streaming response
    const responseContent = this.generateResponseContent(userMessage);
    const chunks = this.splitIntoChunks(responseContent, 20);

    for (let i = 0; i < chunks.length; i++) {
      await this.delay(50);
      if (session.isPaused) return;

      this.emitEvent(sessionId, {
        id: this.generateEventId(),
        type: 'message_delta',
        sessionId,
        timestamp: Date.now(),
        payload: {
          messageId: responseId,
          type: 'text',
          content: chunks[i],
          isFinal: i === chunks.length - 1,
        },
      });
    }

    // Emit message end event
    const agentMessage = {
      id: responseId,
      senderId: 'agent',
      senderType: 'agent' as const,
      senderName: 'Research Assistant',
      content: responseContent,
      contentType: 'text' as const,
      createdAt: Date.now(),
    };

    session.state.messages.push(agentMessage);

    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'message_end',
      sessionId,
      timestamp: Date.now(),
      payload: { messageId: responseId, content: responseContent },
    });

    // Restore idle state
    this.updateAgentState(sessionId, { status: 'idle' });
  }

  // --------------------------------------------------------
  // Task Execution
  // --------------------------------------------------------

  async executeTask(sessionId: string, config: TaskConfig): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const taskId = this.generateTaskId();

    // Create task
    const task = {
      id: taskId,
      title: config.title,
      description: config.description,
      status: 'pending' as const,
      progress: 0,
      createdAt: Date.now(),
    };

    session.state.tasks.push(task);

    // Emit task created event
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'task_created',
      sessionId,
      timestamp: Date.now(),
      payload: { taskId, title: config.title, description: config.description },
    });

    // Simulate task execution
    this.simulateTaskExecution(sessionId, taskId);

    return taskId;
  }

  private async simulateTaskExecution(sessionId: string, taskId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const task = session.state.tasks.find(
      (t) => (t as { id: string }).id === taskId
    ) as { id: string; status: string; progress: number } | undefined;
    if (!task) return;

    // Update task status
    task.status = 'running';
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'task_updated',
      sessionId,
      timestamp: Date.now(),
      payload: { taskId, status: 'running', progress: 0 },
    });

    // Simulate progress
    for (let progress = 20; progress <= 100; progress += 20) {
      await this.delay(500);
      if (session.isPaused) return;

      task.progress = progress;
      this.emitEvent(sessionId, {
        id: this.generateEventId(),
        type: 'task_updated',
        sessionId,
        timestamp: Date.now(),
        payload: { taskId, status: 'running', progress },
      });
    }

    // Task completed
    task.status = 'completed';
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'task_completed',
      sessionId,
      timestamp: Date.now(),
      payload: { taskId, outputs: [{ type: 'result', data: 'Task completed successfully' }] },
    });
  }

  // --------------------------------------------------------
  // Interaction Handling
  // --------------------------------------------------------

  async handleInteraction(sessionId: string, interaction: UserInteraction): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Record completed interaction
    if (!session.state.completedInteractions.includes(interaction.componentId)) {
      session.state.completedInteractions.push(interaction.componentId);
    }

    // Emit interaction response event
    this.emitEvent(sessionId, {
      id: this.generateEventId(),
      type: 'interaction_response',
      sessionId,
      timestamp: Date.now(),
      payload: {
        requestId: interaction.componentId,
        action: interaction.actionId,
        data: interaction.data,
      },
    });

    // If Agent is waiting for interaction, continue execution
    if (session.state.agentState.status === 'waiting_interaction') {
      this.updateAgentState(sessionId, { status: 'running' });

      // Continue demo flow
      if (this.config.enableDemoFlow) {
        this.scheduleNextStep(sessionId);
      }
    }
  }

  // --------------------------------------------------------
  // Session Control
  // --------------------------------------------------------

  async pauseSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isPaused = true;
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }

    this.updateAgentState(sessionId, { status: 'paused' });
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isPaused = false;
    this.updateAgentState(sessionId, { status: 'running' });

    // Continue demo flow
    if (this.config.enableDemoFlow) {
      this.scheduleNextStep(sessionId);
    }
  }

  // --------------------------------------------------------
  // Event Subscription
  // --------------------------------------------------------

  subscribe(sessionId: string, handler: AgentEventHandler): () => void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.handlers.add(handler);

    return () => {
      session.handlers.delete(handler);
    };
  }

  // --------------------------------------------------------
  // Health Check
  // --------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    return true; // Demo service is always healthy
  }

  // --------------------------------------------------------
  // Demo Flow Control
  // --------------------------------------------------------

  private scheduleNextStep(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.isPaused) return;

    session.stepIndex++;
    const step = DEFAULT_DEMO_FLOW[session.stepIndex];

    if (!step) {
      // Demo flow ended
      this.updateAgentState(sessionId, { status: 'idle' });
      return;
    }

    session.timer = setTimeout(() => {
      this.executeDemoStep(sessionId, step);
    }, step.delay);
  }

  private async executeDemoStep(sessionId: string, step: DemoStep): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.isPaused) return;

    switch (step.type) {
      case 'message': {
        const data = step.data as { content: string; actions?: unknown[] };
        const messageId = this.generateMessageId();

        const message = {
          id: messageId,
          senderId: 'agent',
          senderType: 'agent' as const,
          senderName: 'Research Assistant',
          content: data.content,
          contentType: 'text' as const,
          actions: data.actions,
          createdAt: Date.now(),
        };

        session.state.messages.push(message);

        this.emitEvent(sessionId, {
          id: this.generateEventId(),
          type: 'message_end',
          sessionId,
          timestamp: Date.now(),
          payload: { messageId, content: data.content, actions: data.actions },
        });
        break;
      }

      case 'task': {
        const data = step.data as { title: string; description?: string };
        await this.executeTask(sessionId, {
          title: data.title,
          description: data.description,
        });
        break;
      }

      case 'ui_directive': {
        this.emitEvent(sessionId, {
          id: this.generateEventId(),
          type: 'ui_directive',
          sessionId,
          timestamp: Date.now(),
          payload: step.data as any,
        });
        break;
      }

      case 'interaction_wait': {
        const data = step.data as { componentId: string; possibleActions: string[] };
        this.updateAgentState(sessionId, {
          status: 'waiting_interaction',
          waitingFor: data,
        });

        this.emitEvent(sessionId, {
          id: this.generateEventId(),
          type: 'interaction_request',
          sessionId,
          timestamp: Date.now(),
          payload: {
            id: this.generateEventId(),
            componentId: data.componentId,
            possibleActions: data.possibleActions,
          },
        });
        return; // Don't schedule next step, wait for interaction
      }
    }

    // Continue to next step
    this.scheduleNextStep(sessionId);
  }

  // --------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------

  private emitEvent(sessionId: string, event: AgentEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Record to timeline
    session.state.timeline.push({
      id: event.id,
      timestamp: event.timestamp,
      type: event.type,
      data: event.payload,
    });

    session.state.updatedAt = Date.now();

    // Notify all subscribers
    session.handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('[DemoAgentService] Handler error:', error);
      }
    });
  }

  private updateAgentState(sessionId: string, state: Partial<AgentState>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state.agentState = {
      ...session.state.agentState,
      ...state,
    };

    // Emit corresponding state event
    const statusEvent = this.mapStateToEvent(state);
    if (statusEvent) {
      this.emitEvent(sessionId, {
        id: this.generateEventId(),
        type: statusEvent,
        sessionId,
        timestamp: Date.now(),
        payload: state.status === 'waiting_interaction'
          ? state.waitingFor as any
          : {},
      } as AgentEvent);
    }
  }

  private mapStateToEvent(state: Partial<AgentState>): AgentEvent['type'] | null {
    switch (state.status) {
      case 'running': return 'agent_responding';
      case 'waiting_interaction': return 'agent_waiting';
      case 'idle': return 'agent_idle';
      case 'error': return 'agent_error';
      case 'paused': return null;
      default: return null;
    }
  }

  private generateResponseContent(userMessage: string): string {
    // Simple response generation logic
    const responses: Record<string, string> = {
      hello: "Hello! I'm ready to help you with your research. What would you like to explore?",
      search: "I can search through academic databases for papers. What topic are you interested in?",
      help: "I can help you with: searching papers, analyzing documents, summarizing content, and more.",
    };

    const lower = userMessage.toLowerCase();
    for (const [key, response] of Object.entries(responses)) {
      if (lower.includes(key)) {
        return response;
      }
    }

    return `I understand you're asking about "${userMessage}". Let me help you explore this topic further.`;
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateSessionId(): string {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
