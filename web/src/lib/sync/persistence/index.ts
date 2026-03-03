/**
 * Session Persistence Module
 *
 * @description
 * Phase 3D: Session persistence module
 * Provides session data storage and restoration capabilities
 */

// Types
export type {
  SessionPersistence,
  SessionMessage,
  SessionTask,
  TimelineEvent,
  StateSnapshot,
  SessionSummary,
  ListSessionsOptions,
  LoadMessagesOptions,
  LoadTimelineOptions,
  PersistenceType,
  PersistenceConfig,
} from './types';

// Implementations
export { MemorySessionPersistence } from './MemorySessionPersistence';
export { PrismaSessionPersistence } from './PrismaSessionPersistence';

// Factory
import type { SessionPersistence, PersistenceConfig } from './types';
import { MemorySessionPersistence } from './MemorySessionPersistence';
import { PrismaSessionPersistence } from './PrismaSessionPersistence';

let _defaultPersistence: SessionPersistence | null = null;

/**
 * Create a persistence instance
 */
export function createPersistence(config: PersistenceConfig): SessionPersistence {
  switch (config.type) {
    case 'memory':
      return new MemorySessionPersistence();
    case 'prisma':
      return new PrismaSessionPersistence();
    default:
      throw new Error(`Unknown persistence type: ${config.type}`);
  }
}

/**
 * Get the default persistence instance
 */
export function getDefaultPersistence(): SessionPersistence {
  if (!_defaultPersistence) {
    // Choose default persistence based on environment
    const useDatabase = process.env.NODE_ENV === 'production' ||
      process.env.SYNC_PERSISTENCE === 'prisma';

    _defaultPersistence = createPersistence({
      type: useDatabase ? 'prisma' : 'memory',
    });
  }
  return _defaultPersistence;
}

/**
 * Set the default persistence instance
 */
export function setDefaultPersistence(persistence: SessionPersistence): void {
  _defaultPersistence = persistence;
}
