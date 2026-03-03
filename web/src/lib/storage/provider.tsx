"use client";

/**
 * Storage Provider
 * 
 * Provides a React Context for the storage adapter
 * Enables access to storage services throughout the component tree
 *
 * Defaults to IndexedDB for persistent storage
 */

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import type { StorageAdapter } from './types';
import { MockStorageAdapter } from './mockAdapter';
import { IndexedDBAdapter } from './indexedDBAdapter';

// ============================================================
// Context
// ============================================================

const StorageContext = createContext<StorageAdapter | null>(null);

// ============================================================
// Provider
// ============================================================

type AdapterType = 'indexeddb' | 'mock';

interface StorageProviderProps {
  children: React.ReactNode;
  /** Custom storage adapter (for testing or switching implementations) */
  adapter?: StorageAdapter;
  /** Adapter type, defaults to 'indexeddb' */
  adapterType?: AdapterType;
}

/**
 * Storage Provider Component
 * 
 * Wraps application components and provides storage service access
 * Defaults to IndexedDBAdapter for persistence
 */
export const StorageProvider: React.FC<StorageProviderProps> = ({
  children,
  adapter,
  adapterType = 'indexeddb',
}) => {
  // Use provided adapter or create based on type
  const storageAdapter = useMemo(() => {
    if (adapter) return adapter;
    
    // Use Mock on server side
    if (typeof window === 'undefined') {
      return new MockStorageAdapter();
    }
    
    // Select adapter based on type
    switch (adapterType) {
      case 'indexeddb':
        return new IndexedDBAdapter();
      case 'mock':
      default:
        return new MockStorageAdapter();
    }
  }, [adapter, adapterType]);
  
  return (
    <StorageContext.Provider value={storageAdapter}>
      {children}
    </StorageContext.Provider>
  );
};

// ============================================================
// Hooks
// ============================================================

/**
 * Get storage adapter
 *
 * @throws Error if used outside of StorageProvider
 */
export function useStorage(): StorageAdapter {
  const adapter = useContext(StorageContext);
  
  if (!adapter) {
    throw new Error('useStorage must be used within a StorageProvider');
  }
  
  return adapter;
}

/**
 * Safely get storage adapter
 *
 * @returns Storage adapter or null
 */
export function useStorageSafe(): StorageAdapter | null {
  return useContext(StorageContext);
}

