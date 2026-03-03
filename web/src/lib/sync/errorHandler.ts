/**
 * Sync Error Handler
 *
 * Error handling, state recovery, and inconsistency detection for the sync system
 */

import type { SessionState, StateDelta } from './types';
import { validateSessionState, detectStateInconsistency } from './syncUtils';

// ============================================================
// Error Types
// ============================================================

export enum SyncErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  STATE_MISMATCH = 'STATE_MISMATCH',
  STATE_VALIDATION_FAILED = 'STATE_VALIDATION_FAILED',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface SyncError {
  code: SyncErrorCode;
  message: string;
  timestamp: number;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

// ============================================================
// Error Handler
// ============================================================

export interface ErrorHandlerConfig {
  /** Maximum error history size */
  maxErrorHistory: number;
  /** Error notification callback */
  onError?: (error: SyncError) => void;
  /** Recovery success callback */
  onRecovery?: (errorCode: SyncErrorCode) => void;
  /** Whether to enable auto-recovery */
  enableAutoRecovery: boolean;
  /** State inconsistency threshold (percentage difference) */
  inconsistencyThreshold: number;
}

const defaultConfig: ErrorHandlerConfig = {
  maxErrorHistory: 50,
  enableAutoRecovery: true,
  inconsistencyThreshold: 10,
};

export class SyncErrorHandler {
  private config: ErrorHandlerConfig;
  private errorHistory: SyncError[] = [];
  private recoveryAttempts: Map<SyncErrorCode, number> = new Map();

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  // ==================== Error Handling ====================

  /**
   * Handle an error
   */
  handleError(
    code: SyncErrorCode,
    message: string,
    details?: Record<string, unknown>
  ): SyncError {
    const error: SyncError = {
      code,
      message,
      timestamp: Date.now(),
      recoverable: this.isRecoverable(code),
      details,
    };

    // Record error
    this.errorHistory.push(error);
    if (this.errorHistory.length > this.config.maxErrorHistory) {
      this.errorHistory.shift();
    }

    // Notify
    this.config.onError?.(error);

    console.error(`[SyncError] ${code}: ${message}`, details);

    return error;
  }

  /**
   * Determine if an error is recoverable
   */
  isRecoverable(code: SyncErrorCode): boolean {
    switch (code) {
      case SyncErrorCode.CONNECTION_FAILED:
      case SyncErrorCode.CONNECTION_TIMEOUT:
      case SyncErrorCode.CONNECTION_LOST:
      case SyncErrorCode.STATE_MISMATCH:
        return true;
      case SyncErrorCode.MAX_RETRIES_EXCEEDED:
      case SyncErrorCode.INVALID_MESSAGE:
      case SyncErrorCode.STATE_VALIDATION_FAILED:
      case SyncErrorCode.SERVER_ERROR:
      case SyncErrorCode.UNKNOWN:
        return false;
      default:
        return false;
    }
  }

  // ==================== Recovery ====================

  /**
   * Attempt recovery
   */
  async attemptRecovery(
    code: SyncErrorCode,
    recoveryFn: () => Promise<boolean>
  ): Promise<boolean> {
    if (!this.config.enableAutoRecovery) {
      return false;
    }

    if (!this.isRecoverable(code)) {
      return false;
    }

    const attempts = (this.recoveryAttempts.get(code) || 0) + 1;
    this.recoveryAttempts.set(code, attempts);

    console.log(`[SyncError] Attempting recovery for ${code} (attempt ${attempts})`);

    try {
      const success = await recoveryFn();
      
      if (success) {
        this.recoveryAttempts.delete(code);
        this.config.onRecovery?.(code);
        console.log(`[SyncError] Recovery successful for ${code}`);
      }

      return success;
    } catch (err) {
      console.error(`[SyncError] Recovery failed for ${code}:`, err);
      return false;
    }
  }

  /**
   * Reset recovery attempt count
   */
  resetRecoveryAttempts(code?: SyncErrorCode): void {
    if (code) {
      this.recoveryAttempts.delete(code);
    } else {
      this.recoveryAttempts.clear();
    }
  }

  // ==================== State Validation ====================

  /**
   * Validate state
   */
  validateState(state: unknown): SyncError | null {
    const result = validateSessionState(state);
    
    if (!result.valid) {
      return this.handleError(
        SyncErrorCode.STATE_VALIDATION_FAILED,
        'State validation failed',
        { errors: result.errors }
      );
    }

    return null;
  }

  /**
   * Detect state inconsistency
   */
  checkStateConsistency(
    localState: SessionState,
    serverState: SessionState
  ): SyncError | null {
    const result = detectStateInconsistency(localState, serverState);

    if (!result.consistent) {
      // Calculate difference percentage
      const localCount = localState.messages?.length || 0;
      const serverCount = serverState.messages?.length || 0;
      const diff = Math.abs(localCount - serverCount);
      const threshold = Math.max(localCount, serverCount) * (this.config.inconsistencyThreshold / 100);

      if (diff > threshold) {
        return this.handleError(
          SyncErrorCode.STATE_MISMATCH,
          'Significant state mismatch detected',
          {
            differences: result.differences,
            localMessageCount: localCount,
            serverMessageCount: serverCount,
          }
        );
      }
    }

    return null;
  }

  // ==================== Error History ====================

  /**
   * Get error history
   */
  getErrorHistory(): SyncError[] {
    return [...this.errorHistory];
  }

  /**
   * Get the most recent error of a specific type
   */
  getLastError(code?: SyncErrorCode): SyncError | undefined {
    if (code) {
      return [...this.errorHistory].reverse().find(e => e.code === code);
    }
    return this.errorHistory[this.errorHistory.length - 1];
  }

  /**
   * Clear error history
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Record<SyncErrorCode, number> {
    const stats: Record<string, number> = {};
    
    for (const error of this.errorHistory) {
      stats[error.code] = (stats[error.code] || 0) + 1;
    }

    return stats as Record<SyncErrorCode, number>;
  }
}

// ============================================================
// Recovery Strategies
// ============================================================

export interface RecoveryStrategy {
  /** Strategy name */
  name: string;
  /** Applicable error types */
  applicableTo: SyncErrorCode[];
  /** Execute recovery */
  execute: (context: RecoveryContext) => Promise<boolean>;
}

export interface RecoveryContext {
  /** Current connection status */
  isConnected: boolean;
  /** Reconnect function */
  reconnect: () => void;
  /** Request full state function */
  requestFullState: () => void;
  /** Local state */
  localState: SessionState | null;
  /** Error handler */
  errorHandler: SyncErrorHandler;
}

/**
 * Reconnect strategy
 */
export const reconnectStrategy: RecoveryStrategy = {
  name: 'reconnect',
  applicableTo: [
    SyncErrorCode.CONNECTION_FAILED,
    SyncErrorCode.CONNECTION_TIMEOUT,
    SyncErrorCode.CONNECTION_LOST,
  ],
  execute: async (context) => {
    if (context.isConnected) {
      return true;
    }

    return new Promise((resolve) => {
      context.reconnect();
      
      // Wait for connection
      const checkInterval = setInterval(() => {
        if (context.isConnected) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve(true);
        }
      }, 100);

      // Timeout
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 10000);
    });
  },
};

/**
 * State resync strategy
 */
export const resyncStrategy: RecoveryStrategy = {
  name: 'resync',
  applicableTo: [SyncErrorCode.STATE_MISMATCH],
  execute: async (context) => {
    if (!context.isConnected) {
      return false;
    }

    context.requestFullState();

    // Wait for state update
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true);
      }, 2000);
    });
  },
};

/**
 * Default recovery strategy list
 */
export const defaultRecoveryStrategies: RecoveryStrategy[] = [
  reconnectStrategy,
  resyncStrategy,
];

// ============================================================
// Error Handler Factory
// ============================================================

/**
 * Create an error handler with recovery capabilities
 */
export function createSyncErrorHandler(
  config?: Partial<ErrorHandlerConfig>,
  strategies: RecoveryStrategy[] = defaultRecoveryStrategies
) {
  const handler = new SyncErrorHandler(config);

  return {
    handler,
    strategies,

    /**
     * Handle error and attempt recovery
     */
    async handleAndRecover(
      code: SyncErrorCode,
      message: string,
      context: RecoveryContext,
      details?: Record<string, unknown>
    ): Promise<{ error: SyncError; recovered: boolean }> {
      const error = handler.handleError(code, message, details);

      if (!error.recoverable) {
        return { error, recovered: false };
      }

      // Find applicable recovery strategy
      const strategy = strategies.find(s => s.applicableTo.includes(code));
      
      if (!strategy) {
        return { error, recovered: false };
      }

      const recovered = await handler.attemptRecovery(code, () =>
        strategy.execute({ ...context, errorHandler: handler })
      );

      return { error, recovered };
    },
  };
}

export default SyncErrorHandler;
