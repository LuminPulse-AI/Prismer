/**
 * State Snapshot Manager
 * 
 * State snapshot manager - captures, stores, and restores UI state.
 * Supports timeline playback and state comparison.
 */

import type {
  StateSnapshot,
  ComponentType,
  ComponentStates,
  TaskPanelHeight,
  DiffChange,
} from '../types';

// ============================================================
// Types
// ============================================================

export interface SnapshotCaptureOptions {
  includeContent?: boolean;
  maxSnapshots?: number;
}

export interface StateSource {
  chatExpanded: boolean;
  chatPanelWidth: number;
  taskPanelHeight: TaskPanelHeight;
  activeComponent: ComponentType;
  componentStates: ComponentStates;
  activeDiff: {
    component: ComponentType;
    file?: string;
    changes: DiffChange[];
  } | null;
}

// ============================================================
// Snapshot Manager
// ============================================================

export class StateSnapshotManager {
  private snapshots: Map<string, StateSnapshot> = new Map();
  private snapshotOrder: string[] = [];
  private maxSnapshots: number;

  constructor(maxSnapshots = 100) {
    this.maxSnapshots = maxSnapshots;
  }

  /**
   * Capture a snapshot of the current state
   */
  capture(source: StateSource, options?: SnapshotCaptureOptions): StateSnapshot {
    const snapshot: StateSnapshot = {
      id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      layout: {
        chatExpanded: source.chatExpanded,
        chatPanelWidth: source.chatPanelWidth,
        taskPanelHeight: source.taskPanelHeight,
        activeComponent: source.activeComponent,
      },
      components: options?.includeContent
        ? this.deepClone(source.componentStates) as ComponentStates
        : { ...source.componentStates },
      diff: source.activeDiff || undefined,
    };

    this.addSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Add a snapshot
   */
  addSnapshot(snapshot: StateSnapshot): void {
    // Check if limit is exceeded
    while (this.snapshotOrder.length >= this.maxSnapshots) {
      const oldestId = this.snapshotOrder.shift();
      if (oldestId) {
        this.snapshots.delete(oldestId);
      }
    }

    this.snapshots.set(snapshot.id, snapshot);
    this.snapshotOrder.push(snapshot.id);
  }

  /**
   * Get a snapshot by ID
   */
  getSnapshot(id: string): StateSnapshot | undefined {
    return this.snapshots.get(id);
  }

  /**
   * Get all snapshots (sorted by time)
   */
  getAllSnapshots(): StateSnapshot[] {
    return this.snapshotOrder
      .map((id) => this.snapshots.get(id))
      .filter((s): s is StateSnapshot => !!s);
  }

  /**
   * Get the most recent N snapshots
   */
  getRecentSnapshots(count: number): StateSnapshot[] {
    return this.getAllSnapshots().slice(-count);
  }

  /**
   * Get the snapshot closest to a given timestamp
   */
  getSnapshotAtTime(timestamp: number): StateSnapshot | undefined {
    const snapshots = this.getAllSnapshots();

    // Find the closest snapshot
    let closest: StateSnapshot | undefined;
    let minDiff = Infinity;

    for (const snapshot of snapshots) {
      const diff = Math.abs(snapshot.timestamp - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snapshot;
      }
    }

    return closest;
  }

  /**
   * Get snapshots within a time range
   */
  getSnapshotsInRange(startTime: number, endTime: number): StateSnapshot[] {
    return this.getAllSnapshots().filter(
      (s) => s.timestamp >= startTime && s.timestamp <= endTime
    );
  }

  /**
   * Compare the differences between two snapshots
   */
  compareSnapshots(
    snapshotA: StateSnapshot,
    snapshotB: StateSnapshot
  ): SnapshotDiff {
    const diff: SnapshotDiff = {
      layoutChanges: {},
      componentChanges: {},
      timestamp: {
        from: snapshotA.timestamp,
        to: snapshotB.timestamp,
      },
    };

    // Compare layout
    const layoutKeys = Object.keys(snapshotA.layout) as (keyof StateSnapshot['layout'])[];
    for (const key of layoutKeys) {
      if (snapshotA.layout[key] !== snapshotB.layout[key]) {
        (diff.layoutChanges as Record<string, { from: unknown; to: unknown }>)[key] = {
          from: snapshotA.layout[key],
          to: snapshotB.layout[key],
        };
      }
    }

    // Compare component states
    const allComponents = new Set([
      ...Object.keys(snapshotA.components),
      ...Object.keys(snapshotB.components),
    ]);

    for (const component of allComponents) {
      const key = component as keyof ComponentStates;
      const stateA = snapshotA.components[key];
      const stateB = snapshotB.components[key];

      if (JSON.stringify(stateA) !== JSON.stringify(stateB)) {
        (diff.componentChanges as Record<string, { from: unknown; to: unknown }>)[key] = {
          from: stateA,
          to: stateB,
        };
      }
    }

    return diff;
  }

  /**
   * Clear all snapshots
   */
  clear(): void {
    this.snapshots.clear();
    this.snapshotOrder = [];
  }

  /**
   * Delete a specific snapshot
   */
  deleteSnapshot(id: string): boolean {
    const index = this.snapshotOrder.indexOf(id);
    if (index !== -1) {
      this.snapshotOrder.splice(index, 1);
      this.snapshots.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Export snapshots (for persistence)
   */
  export(): { snapshots: StateSnapshot[]; exportedAt: number } {
    return {
      snapshots: this.getAllSnapshots(),
      exportedAt: Date.now(),
    };
  }

  /**
   * Import snapshots
   */
  import(data: { snapshots: StateSnapshot[] }): void {
    for (const snapshot of data.snapshots) {
      this.addSnapshot(snapshot);
    }
  }

  // ==================== Utility Methods ====================

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  private shallowClone<T extends Record<string, unknown>>(obj: T): T {
    const result = {} as T;
    for (const key of Object.keys(obj) as (keyof T)[]) {
      result[key] = obj[key];
    }
    return result;
  }
}

// ============================================================
// Types for Diff
// ============================================================

export interface SnapshotDiff {
  layoutChanges: Partial<{
    [K in keyof StateSnapshot['layout']]: {
      from: StateSnapshot['layout'][K];
      to: StateSnapshot['layout'][K];
    };
  }>;
  componentChanges: Partial<{
    [K in keyof ComponentStates]: {
      from: ComponentStates[K] | undefined;
      to: ComponentStates[K] | undefined;
    };
  }>;
  timestamp: {
    from: number;
    to: number;
  };
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a state snapshot manager
 */
export function createSnapshotManager(maxSnapshots?: number): StateSnapshotManager {
  return new StateSnapshotManager(maxSnapshots);
}

// ============================================================
// Singleton Instance
// ============================================================

let defaultManager: StateSnapshotManager | null = null;

/**
 * Get the default snapshot manager instance
 */
export function getDefaultSnapshotManager(): StateSnapshotManager {
  if (!defaultManager) {
    defaultManager = new StateSnapshotManager();
  }
  return defaultManager;
}
