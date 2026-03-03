/**
 * User Storage Manager
 * 
 * Manages user-level storage isolation
 * - Tracks the currently logged-in user
 * - Manages storage key prefixes
 * - Data cleanup and switching on login/logout
 * - Event notification mechanism
 */

// ============================================================================
// Constants
// ============================================================================

const GUEST_PREFIX = 'guest';
const USER_PREFIX = 'user';

// localStorage keys that require user isolation
export const USER_ISOLATED_STORAGE_KEYS = [
  'reader-store',
  'chat-session-storage',
  'notebook-storage',
  'insight-storage',
  'ai-store',
  'prismer-collections',
  'pdf-store',
  'citation-store',
] as const;

// IndexedDB database name
export const INDEXED_DB_NAME = 'pisa_reader_db';

// ============================================================================
// Types
// ============================================================================

export type UserStorageEvent = 
  | { type: 'login'; userId: string }
  | { type: 'logout' }
  | { type: 'switch'; fromUserId: string | null; toUserId: string };

export type UserStorageEventHandler = (event: UserStorageEvent) => void | Promise<void>;

// ============================================================================
// User Storage Manager
// ============================================================================

class UserStorageManager {
  private currentUserId: string | null = null;
  private eventHandlers: Set<UserStorageEventHandler> = new Set();
  private initialized = false;

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize manager
   * Restores current user state from localStorage
   */
  initialize(): void {
    if (this.initialized || typeof window === 'undefined') return;

    try {
      // Restore user state from auth store
      const authData = localStorage.getItem('pisa-auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        if (parsed.state?.user?.id) {
          this.currentUserId = parsed.state.user.id;
          console.log('[UserStorageManager] Restored user:', this.currentUserId);
        }
      }
    } catch (error) {
      console.error('[UserStorageManager] Failed to restore user state:', error);
    }

    this.initialized = true;
  }

  // ============================================================================
  // User State
  // ============================================================================

  /**
   * Get current user ID
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Check if logged in
   */
  isLoggedIn(): boolean {
    return this.currentUserId !== null;
  }

  /**
   * Get storage prefix
   */
  getStoragePrefix(): string {
    return this.currentUserId 
      ? `${USER_PREFIX}-${this.currentUserId}`
      : GUEST_PREFIX;
  }

  /**
   * Get user-specific storage key
   */
  getUserStorageKey(baseKey: string): string {
    const prefix = this.getStoragePrefix();
    return `${prefix}:${baseKey}`;
  }

  // ============================================================================
  // Login / Logout
  // ============================================================================

  /**
   * Handle user login
   */
  async onLogin(userId: string): Promise<void> {
    const previousUserId = this.currentUserId;
    
    console.log('[UserStorageManager] Login:', userId);

    // 1. Clear guest data (if previously a guest)
    if (!previousUserId) {
      await this.clearGuestData();
    }

    // 2. Update current user
    this.currentUserId = userId;

    // 3. Notify all listeners
    await this.emitEvent(
      previousUserId
        ? { type: 'switch', fromUserId: previousUserId, toUserId: userId }
        : { type: 'login', userId }
    );

    console.log('[UserStorageManager] Login complete');
  }

  /**
   * Handle user logout
   */
  async onLogout(): Promise<void> {
    console.log('[UserStorageManager] Logout');

    // 1. Clear current user's local data
    await this.clearCurrentUserData();

    // 2. Reset user state
    this.currentUserId = null;

    // 3. Notify all listeners
    await this.emitEvent({ type: 'logout' });

    console.log('[UserStorageManager] Logout complete');
  }

  // ============================================================================
  // Data Management
  // ============================================================================

  /**
   * Clear guest data
   */
  async clearGuestData(): Promise<void> {
    console.log('[UserStorageManager] Clearing guest data...');
    
    // Clear data with guest prefix
    this.clearPrefixedLocalStorage(GUEST_PREFIX);
    
    // Also clear legacy data without prefix (migration compatible)
    this.clearLegacyLocalStorage();
  }

  /**
   * Clear current user's local data
   */
  async clearCurrentUserData(): Promise<void> {
    console.log('[UserStorageManager] Clearing current user data...');
    
    if (this.currentUserId) {
      // Clear user-prefixed data
      this.clearPrefixedLocalStorage(`${USER_PREFIX}-${this.currentUserId}`);
    }
    
    // Clear all legacy format data without prefix
    this.clearLegacyLocalStorage();
    
    // Clear IndexedDB
    await this.clearIndexedDB();
  }

  /**
   * Clear localStorage data with a specific prefix
   */
  private clearPrefixedLocalStorage(prefix: string): void {
    if (typeof window === 'undefined') return;
    
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${prefix}:`)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log('[UserStorageManager] Removed:', key);
    });
  }

  /**
   * Clear legacy localStorage data (without user prefix)
   */
  private clearLegacyLocalStorage(): void {
    if (typeof window === 'undefined') return;
    
    USER_ISOLATED_STORAGE_KEYS.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log('[UserStorageManager] Removed legacy key:', key);
      }
    });
  }

  /**
   * Clear IndexedDB
   */
  private async clearIndexedDB(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    return new Promise((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(INDEXED_DB_NAME);
        
        request.onsuccess = () => {
          console.log('[UserStorageManager] IndexedDB deleted');
          resolve();
        };
        
        request.onerror = () => {
          console.error('[UserStorageManager] Failed to delete IndexedDB');
          resolve(); // Continue execution, do not block
        };
        
        request.onblocked = () => {
          console.warn('[UserStorageManager] IndexedDB deletion blocked');
          resolve(); // Continue execution
        };
      } catch (error) {
        console.error('[UserStorageManager] IndexedDB deletion error:', error);
        resolve();
      }
    });
  }

  // ============================================================================
  // Event System
  // ============================================================================

  /**
   * Subscribe to user storage events
   */
  subscribe(handler: UserStorageEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit event to all listeners
   */
  private async emitEvent(event: UserStorageEvent): Promise<void> {
    const handlers = Array.from(this.eventHandlers);
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('[UserStorageManager] Event handler error:', error);
      }
    }
  }

  // ============================================================================
  // Storage Helpers
  // ============================================================================

  /**
   * Check if guest data exists
   */
  hasGuestData(): boolean {
    if (typeof window === 'undefined') return false;
    
    // Check legacy format data
    for (const key of USER_ISOLATED_STORAGE_KEYS) {
      if (localStorage.getItem(key)) {
        return true;
      }
    }
    
    // Check new format guest data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${GUEST_PREFIX}:`)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Migrate legacy format data to user-prefixed format
   * Used for first-time upgrade
   */
  async migrateLegacyDataToUser(userId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    
    console.log('[UserStorageManager] Migrating legacy data to user:', userId);
    
    const prefix = `${USER_PREFIX}-${userId}`;
    
    for (const key of USER_ISOLATED_STORAGE_KEYS) {
      const data = localStorage.getItem(key);
      if (data) {
        // Move to new key
        localStorage.setItem(`${prefix}:${key}`, data);
        localStorage.removeItem(key);
        console.log(`[UserStorageManager] Migrated: ${key} -> ${prefix}:${key}`);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: UserStorageManager | null = null;

export function getUserStorageManager(): UserStorageManager {
  if (!instance) {
    instance = new UserStorageManager();
    instance.initialize();
  }
  return instance;
}

// ============================================================================
// Hooks
// ============================================================================

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Hook: Get the current user ID
 */
export function useCurrentStorageUserId(): string | null {
  const manager = getUserStorageManager();
  
  return useSyncExternalStore(
    (callback) => manager.subscribe(() => callback()),
    () => manager.getCurrentUserId(),
    () => null
  );
}

/**
 * Hook: Get user-specific storage key
 */
export function useUserStorageKey(baseKey: string): string {
  const userId = useCurrentStorageUserId();
  const manager = getUserStorageManager();
  
  return manager.getUserStorageKey(baseKey);
}

/**
 * Hook: Listen to user storage events
 */
export function useUserStorageEvents(handler: UserStorageEventHandler): void {
  const manager = getUserStorageManager();
  
  useEffect(() => {
    return manager.subscribe(handler);
  }, [handler]);
}

// ============================================================================
// Zustand Storage Creator
// ============================================================================

import { createJSONStorage, type PersistStorage } from 'zustand/middleware';

/**
 * Create user-isolated Zustand storage
 *
 * @param baseKey - Base storage key
 * @param requireAuth - Whether login is required for persistence (default true)
 */
export function createUserIsolatedStorage<T>(
  baseKey: string,
  requireAuth: boolean = true
): PersistStorage<T> {
  const manager = getUserStorageManager();
  
  // createJSONStorage returns undefined only when getStorage() returns undefined,
  // which won't happen here since we always provide a valid storage object
  return createJSONStorage<T>(() => ({
    getItem: (name: string): string | null => {
      if (typeof window === 'undefined') return null;
      
      // If login is required but user is not logged in, return null
      if (requireAuth && !manager.isLoggedIn()) {
        return null;
      }
      
      const key = manager.getUserStorageKey(baseKey);
      return localStorage.getItem(key);
    },
    
    setItem: (name: string, value: string): void => {
      if (typeof window === 'undefined') return;
      
      // If login is required but user is not logged in, skip saving
      if (requireAuth && !manager.isLoggedIn()) {
        console.log(`[Storage] Skip saving ${baseKey}: user not logged in`);
        return;
      }
      
      const key = manager.getUserStorageKey(baseKey);
      localStorage.setItem(key, value);
    },
    
    removeItem: (name: string): void => {
      if (typeof window === 'undefined') return;
      
      const key = manager.getUserStorageKey(baseKey);
      localStorage.removeItem(key);
    },
  })) as PersistStorage<T>;
}

// ============================================================================
// Workspace-Isolated Zustand Storage Creator
// ============================================================================

/**
 * Create workspace-isolated Zustand storage
 * Key format: `user-${userId}:${baseKey}:ws-${workspaceId}`
 *
 * workspaceId is mutable -- call setWorkspaceId() before rehydrate() to switch workspace.
 * Use with skipHydration: true so that initializeWorkspace() controls the hydration timing.
 *
 * @param baseKey - Base storage key
 * @param requireAuth - Whether login is required for persistence (default true)
 */
export function createWorkspaceIsolatedStorage<T>(
  baseKey: string,
  requireAuth: boolean = true
): { storage: PersistStorage<T>; setWorkspaceId: (id: string) => void } {
  const manager = getUserStorageManager();
  let currentWorkspaceId = 'default';

  const storage = createJSONStorage<T>(() => ({
    getItem: (name: string): string | null => {
      if (typeof window === 'undefined') return null;
      if (requireAuth && !manager.isLoggedIn()) return null;
      const key = `${manager.getUserStorageKey(baseKey)}:ws-${currentWorkspaceId}`;
      return localStorage.getItem(key);
    },

    setItem: (name: string, value: string): void => {
      if (typeof window === 'undefined') return;
      if (requireAuth && !manager.isLoggedIn()) return;
      const key = `${manager.getUserStorageKey(baseKey)}:ws-${currentWorkspaceId}`;
      localStorage.setItem(key, value);
    },

    removeItem: (name: string): void => {
      if (typeof window === 'undefined') return;
      const key = `${manager.getUserStorageKey(baseKey)}:ws-${currentWorkspaceId}`;
      localStorage.removeItem(key);
    },
  })) as PersistStorage<T>;

  return {
    storage,
    setWorkspaceId: (id: string) => { currentWorkspaceId = id; },
  };
}

export default UserStorageManager;
