/**
 * Default Sync Control Matrix
 *
 * Default sync control matrix configuration
 * Defines sync rules for all built-in data types
 */

import type { SyncControlMatrix, SyncRule } from './types';
import { DATA_TYPES } from './types';
import { rule } from './SyncMatrixEngine';

// ============================================================
// Default Rules
// ============================================================

/**
 * Messages rule - chat messages
 */
const messagesRule: SyncRule = rule(DATA_TYPES.MESSAGES, 'Chat messages')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'readwrite')
  .endpoint('web', 'readwrite')
  .endpoint('agent', 'read')
  .persist('database', { table: 'workspace_messages' })
  .bidirectional('server_wins')
  .throttle(100)
  .interactions({
    canTrigger: ['desktop', 'mobile', 'web'],
    targetEndpoints: ['server'],
  })
  .build();

/**
 * Tasks rule - task list
 */
const tasksRule: SyncRule = rule(DATA_TYPES.TASKS, 'Task list')
  .serverOwned()
  .endpoint('desktop', 'read')
  .endpoint('mobile', 'read')
  .endpoint('agent', 'readwrite')
  .persist('database', { table: 'workspace_tasks' })
  .broadcast()
  .build();

/**
 * Participants rule - participant list
 */
const participantsRule: SyncRule = rule(DATA_TYPES.PARTICIPANTS, 'Participant list')
  .serverOwned()
  .endpoint('desktop', 'read')
  .endpoint('mobile', 'read')
  .persist('database', { table: 'workspace_participants' })
  .broadcast()
  .build();

/**
 * Completed interactions rule
 */
const completedInteractionsRule: SyncRule = rule(DATA_TYPES.COMPLETED_INTERACTIONS, 'Completed interaction components')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'readwrite')
  .persist('database')
  .bidirectional('merge')
  .interactions({
    canTrigger: ['desktop', 'mobile'],
    targetEndpoints: ['server'],
  })
  .build();

/**
 * Timeline rule - timeline event history
 */
const timelineRule: SyncRule = rule(DATA_TYPES.TIMELINE, 'Timeline event history')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'read')  // Mobile has read-only access to timeline
  .endpoint('agent', 'readwrite')
  .persist('database', { 
    table: 'timeline_events',
    maxItems: 1000,  // Limit the number of timeline events
  })
  .bidirectional('merge')
  .throttle(500)
  .build();

/**
 * State snapshots rule - for timeline replay
 */
const stateSnapshotsRule: SyncRule = rule(DATA_TYPES.STATE_SNAPSHOTS, 'State snapshots (for timeline replay)')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'partial', { 
    filter: ['latest_only'],  // Mobile only needs the latest snapshot
  })
  .endpoint('agent', 'read')
  .persist('database', { 
    table: 'state_snapshots',
    maxItems: 100,
    compression: true,  // Snapshots can be large, enable compression
  })
  .broadcast()
  .build();

/**
 * Component states rule - internal UI component state
 */
const componentStatesRule: SyncRule = rule(DATA_TYPES.COMPONENT_STATES, 'Internal UI component state (editor content, scroll position, etc.)')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'partial', {
    filter: ['chat', 'task_panel'],  // Mobile only cares about certain components
  })
  .endpoint('agent', 'read')
  .persist('database', { table: 'component_states' })
  .bidirectional('latest_wins')
  .throttle(200)
  .build();

/**
 * Active component rule
 */
const activeComponentRule: SyncRule = rule(DATA_TYPES.ACTIVE_COMPONENT, 'Currently active component (which one WindowViewer displays)')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'none')  // Mobile does not support component switching
  .persist('memory')
  .broadcast()
  .build();

/**
 * Agent state rule
 */
const agentStateRule: SyncRule = rule(DATA_TYPES.AGENT_STATE, 'Agent runtime status')
  .serverOwned()
  .endpoint('desktop', 'read')
  .endpoint('mobile', 'read')
  .endpoint('agent', 'write')
  .persist('memory')
  .broadcast()
  .build();

/**
 * UI directive rule
 */
const uiDirectiveRule: SyncRule = rule(DATA_TYPES.UI_DIRECTIVE, 'UI control directives')
  .serverOwned()
  .endpoint('desktop', 'partial', {
    filter: ['full_ui'],  // Requires full_ui capability
    requiredCapabilities: ['full_ui'],
  })
  .endpoint('mobile', 'partial', {
    filter: ['notifications'],  // Only execute notification-type directives
    requiredCapabilities: ['notifications'],
  })
  .endpoint('agent', 'write')  // Agent can generate directives
  .persist('none')
  .broadcast()
  .build();

/**
 * Layout state rule - local state, not synced
 */
const layoutStateRule: SyncRule = rule(DATA_TYPES.LAYOUT_STATE, 'Layout state (chatExpanded, taskPanelHeight, etc.)')
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'readwrite')
  .persist('none')
  .build();

// ============================================================
// Default Matrix
// ============================================================

/**
 * Research notes rule (example extended data type)
 */
const researchNotesRule: SyncRule = rule('researchNotes', 'Research note cards')
  .serverOwned()
  .endpoint('desktop', 'readwrite')
  .endpoint('mobile', 'readwrite')
  .endpoint('web', 'readwrite')
  .endpoint('agent', 'read')
  .persist('database', { table: 'research_notes' })
  .bidirectional('merge')
  .throttle(1000)
  .interactions({
    canTrigger: ['desktop', 'mobile', 'web'],
    targetEndpoints: ['server', 'agent'],
    signalTypes: ['note_created', 'note_updated', 'note_deleted', 'note_linked'],
  })
  .build();

/**
 * Default sync control matrix
 */
export const defaultSyncMatrix: SyncControlMatrix = {
  version: '1.0.0',
  rules: [
    // Core session data
    messagesRule,
    tasksRule,
    participantsRule,
    completedInteractionsRule,
    
    // Timeline data
    timelineRule,
    stateSnapshotsRule,
    
    // Component states
    componentStatesRule,
    activeComponentRule,
    
    // Agent state
    agentStateRule,
    
    // UI directives
    uiDirectiveRule,
    
    // Local state
    layoutStateRule,
    
    // Extended data types (example)
    researchNotesRule,
  ],
  globalConfig: {
    defaultThrottleMs: 100,
    defaultTimeout: 30000,
    enableDebugLogging: process.env.NODE_ENV === 'development',
  },
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get a copy of the default matrix
 */
export function getDefaultMatrix(): SyncControlMatrix {
  return JSON.parse(JSON.stringify(defaultSyncMatrix));
}

/**
 * Get all database-persisted table names
 */
export function getDatabaseTables(): string[] {
  return defaultSyncMatrix.rules
    .filter(r => r.persistence.strategy === 'database' && r.persistence.table)
    .map(r => r.persistence.table as string);
}

/**
 * Get data types writable by desktop
 */
export function getDesktopWritableTypes(): string[] {
  return defaultSyncMatrix.rules
    .filter(r => {
      const config = r.endpoints.desktop;
      return config && (config.access === 'readwrite' || config.access === 'write');
    })
    .map(r => r.dataType);
}

/**
 * Get data types readable by mobile
 */
export function getMobileReadableTypes(): string[] {
  return defaultSyncMatrix.rules
    .filter(r => {
      const config = r.endpoints.mobile;
      return config && config.access !== 'none';
    })
    .map(r => r.dataType);
}

// ============================================================
// Predefined Rule Templates
// ============================================================

/**
 * Create research notes rule template
 * Example: how to add a new data type
 */
export function createResearchNotesRule(): SyncRule {
  return rule('researchNotes', 'Research note cards')
    .serverOwned()
    .endpoint('desktop', 'readwrite')
    .endpoint('mobile', 'readwrite')
    .endpoint('agent', 'read')
    .persist('database', { table: 'research_notes' })
    .bidirectional('merge')
    .throttle(1000)
    .interactions({
      canTrigger: ['desktop', 'mobile'],
      targetEndpoints: ['server', 'agent'],
      signalTypes: ['note_created', 'note_updated', 'note_deleted'],
    })
    .build();
}

/**
 * Create collaborative whiteboard rule template
 */
export function createWhiteboardRule(): SyncRule {
  return rule('whiteboard', 'Collaborative whiteboard state')
    .serverOwned()
    .endpoint('desktop', 'readwrite')
    .endpoint('mobile', 'readwrite')
    .endpoint('web', 'readwrite')
    .persist('database', { table: 'whiteboard_state' })
    .bidirectional('merge')
    .throttle(50)  // Real-time collaboration requires low latency
    .build();
}

/**
 * Create paper citations rule template
 */
export function createPaperCitationsRule(): SyncRule {
  return rule('paperCitations', 'Paper citation collection')
    .serverOwned()
    .endpoint('desktop', 'readwrite')
    .endpoint('mobile', 'read')  // Mobile is read-only
    .endpoint('agent', 'readwrite')
    .persist('database', { table: 'paper_citations' })
    .bidirectional('merge')
    .interactions({
      canTrigger: ['desktop', 'agent'],
      targetEndpoints: ['server'],
      signalTypes: ['citation_added', 'citation_analyzed'],
    })
    .build();
}
