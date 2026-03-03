/**
 * Sync Control Matrix Module
 *
 * Sync control matrix module exports
 *
 * @example
 * ```typescript
 * import {
 *   SyncMatrixEngine,
 *   defaultSyncMatrix,
 *   createSyncMatrixEngine,
 *   rule,
 *   DATA_TYPES,
 * } from '@/lib/sync';
 *
 * // Use the default matrix
 * const engine = createSyncMatrixEngine(defaultSyncMatrix);
 *
 * // Check permissions
 * if (engine.canAccess('messages', 'mobile', 'read')) {
 *   // Mobile can read messages
 * }
 *
 * // Dynamically add rules
 * engine.registerRule(
 *   rule('customData', 'Custom data')
 *     .serverOwned()
 *     .endpoint('desktop', 'readwrite')
 *     .persist('database', { table: 'custom_data' })
 *     .bidirectional()
 *     .build()
 * );
 * ```
 */

// ============================================================
// Types
// ============================================================

export type {
  // Endpoint & Access
  EndpointType,
  AccessMode,
  EndpointAccessConfig,
  EndpointConfigMap,

  // Persistence
  PersistenceStrategy,
  PersistenceConfig,

  // Sync
  SyncDirection,
  ConflictStrategy,
  SyncConfig,

  // Rule
  SyncRule,
  InteractionSignalConfig,
  SyncControlMatrix,

  // Runtime
  ClientInfo,
  ClientConnection,
  SessionState,
  AgentState,

  // Protocol
  ServerToClientMessage,
  ClientToServerMessage,
  StateDelta,
  UIDirective,
  UIDirectiveType,
  ComponentEventPayload,

  // Utility
  DeepPartial,
  DataType,
} from './types';

// ============================================================
// Constants
// ============================================================

export { ALL_ENDPOINTS, DATA_TYPES } from './types';

// ============================================================
// Engine
// ============================================================

export {
  SyncMatrixEngine,
  createSyncMatrixEngine,
  createEmptyMatrix,
  SyncRuleBuilder,
  rule,
} from './SyncMatrixEngine';

// ============================================================
// Default Matrix
// ============================================================

export {
  defaultSyncMatrix,
  getDefaultMatrix,
  getDatabaseTables,
  getDesktopWritableTypes,
  getMobileReadableTypes,
  createResearchNotesRule,
  createWhiteboardRule,
  createPaperCitationsRule,
} from './defaultMatrix';

// ============================================================
// Hooks (Client-side)
// ============================================================

// Low-level hook (no Store dependency)
export {
  useAgentConnection,
  useAgentEvent,
  useDesktopAgentConnection,
  useMobileAgentConnection,
} from './useAgentConnection';

export type {
  ClientCapability,
  UseAgentConnectionOptions,
  AgentConnectionResult,
} from './useAgentConnection';

// High-level hooks (workspace-aware) have moved to:
// @/app/workspace/hooks/useWorkspaceAgent
// Import useDesktopAgent, useMobileAgent from there instead.

// ============================================================
// Component State Config
// ============================================================

export {
  componentStateConfigs,
  getComponentConfig,
  shouldSyncField,
  shouldPersistField,
  canMobileAccess,
  filterSyncableState,
  filterPersistableState,
  filterMobileAccessibleState,
  getMobileRelevantComponents,
  filterComponentStatesForMobile,
} from './componentStateConfig';

export type {
  SyncMode,
  MobileAccess,
  FieldSyncConfig,
  ComponentStateSyncConfig,
} from './componentStateConfig';

// ============================================================
// Component Event Forwarder
// ============================================================

export {
  setComponentEventForwarder,
  forwardComponentEvent,
  hasComponentEventForwarder,
} from './componentEventForwarder';

// Component State Bridge
export {
  initComponentStateBridge,
} from './componentStateBridge';

// Content Sync Hooks
export {
  useContentSync,
  useMultiFieldContentSync,
} from './useContentSync';

// ============================================================
// Sync Utilities
// ============================================================

export {
  throttle,
  debounce,
  createBatchProcessor,
  computeStateDiff,
  deepEqual,
  mergeDeltas,
  createMessageDeduplicator,
  createReconnectManager,
  validateSessionState,
  detectStateInconsistency,
} from './syncUtils';

// ============================================================
// Error Handling
// ============================================================

export {
  SyncErrorCode,
  SyncErrorHandler,
  createSyncErrorHandler,
  reconnectStrategy,
  resyncStrategy,
  defaultRecoveryStrategies,
} from './errorHandler';

export type {
  SyncError,
  ErrorHandlerConfig,
  RecoveryStrategy,
  RecoveryContext,
} from './errorHandler';

// ============================================================
// Examples
// ============================================================

export {
  researchNotesSyncRule,
  // createResearchNotesRule is already exported from defaultMatrix
  createResearchNotesSlice,
  createResearchNote,
  getAllTags,
  filterAndSortNotes,
} from './examples/researchNotes';

export type {
  ResearchNote,
  ResearchNotesState,
  ResearchNoteEvent,
  ResearchNotesActions,
} from './examples/researchNotes';
