/**
 * Agent Service Module
 *
 * @description
 * Phase 3: OpenClaw Agent integration layer
 * Provides a unified Agent service abstraction supporting Demo and OpenClaw backends
 *
 * @example
 * ```typescript
 * import { createAgentService, AgentServiceFactory } from '@/lib/agent';
 *
 * // Auto-select service type
 * const service = createAgentService('agent-123', 'ws://localhost:18900');
 *
 * // Start session
 * const state = await service.startSession({
 *   agentId: 'agent-123',
 *   userId: 'user-1',
 *   workspaceId: 'ws-1',
 * });
 *
 * // Subscribe to events
 * const unsubscribe = service.subscribe(state.sessionId, (event) => {
 *   console.log('Event:', event);
 * });
 *
 * // Send message
 * await service.sendMessage(state.sessionId, 'Hello!');
 * ```
 */

// Types
export type {
  AgentService,
  AgentEvent,
  AgentEventType,
  AgentEventHandler,
  SessionConfig,
  TaskConfig,
  UserInteraction,
  MessageDelta,
  ToolCall,
  InteractionRequest,
  AgentServiceFactoryConfig,
  CreateServiceOptions,
} from './types';

export { createAgentEvent } from './types';

// Services
export { DemoAgentService } from './DemoAgentService';
export { OpenClawAgentService, type OpenClawConfig } from './OpenClawAgentService';

// Factory
export {
  AgentServiceFactory,
  getAgentService,
  createDemoService,
  createOpenClawService,
  createAgentService,
} from './AgentServiceFactory';

// Event Mapping
export {
  agentEventToSyncMessage,
  MessageAccumulator,
  ToolCallTracker,
  AgentEventStreamHandler,
} from './eventMapper';
