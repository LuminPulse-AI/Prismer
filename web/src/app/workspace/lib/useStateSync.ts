'use client';

/**
 * useStateSync Hook
 * 
 * Hook for synchronizing state across multiple clients.
 * Supports sharing mock data changes between iOS simulator and macOS desktop.
 *
 * Usage:
 * 1. Start the sync server: npx tsx scripts/sync-server.ts
 * 2. Use in a component: const { isConnected, syncState } = useStateSync();
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useWorkspaceStore } from '../stores';

// Sync server configuration
const SYNC_SERVER_URL = process.env.NEXT_PUBLIC_SYNC_SERVER_URL || 'ws://localhost:3456';

// Message types
interface SyncMessage {
  type: string;
  payload?: unknown;
  timestamp: number;
  source?: string;
}

export function useStateSync(enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId] = useState(() => `client-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`);
  
  // Store actions
  const addMessage = useWorkspaceStore((s) => s.addMessage);
  const setParticipants = useWorkspaceStore((s) => s.setParticipants);
  const setTasks = useWorkspaceStore((s) => s.setTasks);
  const updateTask = useWorkspaceStore((s) => s.updateTask);
  const markInteractionComplete = useWorkspaceStore((s) => s.markInteractionComplete);
  const reset = useWorkspaceStore((s) => s.reset);
  
  // Send message to server
  const sendMessage = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload, clientId }));
    }
  }, [clientId]);
  
  // Handle messages from server
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: SyncMessage = JSON.parse(event.data);
      
      // Ignore messages sent by self
      if (message.source === clientId) return;
      
      console.log(`[StateSync] Received: ${message.type}`, message.payload);
      
      switch (message.type) {
        case 'FULL_STATE':
          // Receive full state
          const state = message.payload as {
            messages: any[];
            tasks: any[];
            participants: any[];
            completedInteractions: string[];
          };
          
          if (state.participants?.length) {
            setParticipants(state.participants);
          }
          if (state.tasks?.length) {
            setTasks(state.tasks);
          }
          // Messages are handled separately to preserve order
          state.messages?.forEach((msg) => {
            // Check if message already exists to avoid duplicates
            const store = useWorkspaceStore.getState();
            if (!store.messages.find(m => m.id === msg.id)) {
              addMessage(msg);
            }
          });
          state.completedInteractions?.forEach((id) => {
            markInteractionComplete(id);
          });
          break;
          
        case 'STATE_UPDATE':
          // Incremental state update
          const updates = message.payload as Record<string, unknown>;
          if (updates.participants) {
            setParticipants(updates.participants as any[]);
          }
          if (updates.tasks) {
            setTasks(updates.tasks as any[]);
          }
          break;
          
        case 'ADD_MESSAGE':
          // Add new message
          const newMsg = message.payload as any;
          const currentStore = useWorkspaceStore.getState();
          if (!currentStore.messages.find(m => m.id === newMsg.id)) {
            addMessage(newMsg);
          }
          break;
          
        case 'UPDATE_TASK':
          // Update task
          const taskUpdate = message.payload as { id: string; [key: string]: any };
          updateTask(taskUpdate.id, taskUpdate);
          break;
          
        case 'INTERACTION':
          // Interaction event - mark complete and notify demo controller
          const interaction = message.payload as { componentId: string; actionId?: string };
          markInteractionComplete(interaction.componentId);
          // Trigger demo controller advancement (if there is a pending interaction)
          if (interaction.actionId) {
            import('./demoFlowController').then(({ demoFlowController }) => {
              demoFlowController.handleInteraction(interaction.componentId, interaction.actionId!);
            });
          }
          break;
          
        case 'RESET':
          // Reset state
          reset();
          break;
      }
    } catch (err) {
      console.error('[StateSync] Error handling message:', err);
    }
  }, [clientId, addMessage, setParticipants, setTasks, updateTask, markInteractionComplete, reset]);
  
  // Connect to sync server
  const connect = useCallback(() => {
    if (!enabled) return;
    
    try {
      console.log(`[StateSync] Connecting to ${SYNC_SERVER_URL}...`);
      const ws = new WebSocket(SYNC_SERVER_URL);
      
      ws.onopen = () => {
        console.log('[StateSync] Connected!');
        setIsConnected(true);
        wsRef.current = ws;
      };
      
      ws.onmessage = handleMessage;
      
      ws.onclose = () => {
        console.log('[StateSync] Disconnected');
        setIsConnected(false);
        wsRef.current = null;
        
        // Attempt to reconnect
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[StateSync] Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };

      ws.onerror = (err) => {
        console.error('[StateSync] WebSocket error:', err);
      };

    } catch (err) {
      console.error('[StateSync] Connection error:', err);

      // Attempt to reconnect
      if (enabled) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }
  }, [enabled, handleMessage]);
  
  // Initialize connection
  useEffect(() => {
    if (enabled) {
      connect();
    }
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [enabled, connect]);
  
  // Expose sync methods
  const syncMessage = useCallback((message: any) => {
    sendMessage('ADD_MESSAGE', message);
  }, [sendMessage]);
  
  const syncTask = useCallback((task: { id: string; [key: string]: any }) => {
    sendMessage('UPDATE_TASK', task);
  }, [sendMessage]);
  
  const syncInteraction = useCallback((componentId: string, actionId: string) => {
    sendMessage('INTERACTION', { componentId, actionId });
  }, [sendMessage]);
  
  const syncFullState = useCallback((state: any) => {
    sendMessage('STATE_UPDATE', state);
  }, [sendMessage]);
  
  const requestFullState = useCallback(() => {
    sendMessage('REQUEST_FULL_STATE');
  }, [sendMessage]);
  
  const resetSync = useCallback(() => {
    sendMessage('RESET');
  }, [sendMessage]);
  
  return {
    isConnected,
    clientId,
    syncMessage,
    syncTask,
    syncInteraction,
    syncFullState,
    requestFullState,
    resetSync,
  };
}

export default useStateSync;
