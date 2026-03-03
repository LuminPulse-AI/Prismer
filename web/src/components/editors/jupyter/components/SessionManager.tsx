'use client';

/**
 * SessionManager - Jupyter Session Management Component
 *
 * Features:
 * - List all sessions
 * - Create/switch/delete sessions
 * - Display kernel status
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import {
  Layers,
  RefreshCw,
  Plus,
  Trash2,
  Circle,
  Loader2,
  Server,
  Activity,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  X,
  Check,
} from 'lucide-react';
import type { KernelStatus } from '../types';

// ============================================================
// Type Definitions
// ============================================================

export interface JupyterSession {
  id: string;
  name: string;
  path: string;
  type: 'notebook' | 'console';
  kernel: {
    id: string;
    name: string;
    last_activity: string;
    execution_state: string;
    connections: number;
  } | null;
}

interface SessionManagerProps {
  serverUrl: string;
  token?: string;
  currentSessionId: string | null;
  currentKernelId: string | null;
  onSessionSelect: (session: JupyterSession) => void;
  onSessionCreate: (name: string, kernelName: string) => void;
  onSessionDelete: (sessionId: string) => void;
  className?: string;
}

// ============================================================
// SessionManager Component
// ============================================================

export const SessionManager = memo(function SessionManager({
  serverUrl,
  token,
  currentSessionId,
  currentKernelId,
  onSessionSelect,
  onSessionCreate,
  onSessionDelete,
  className = '',
}: SessionManagerProps) {
  const [sessions, setSessions] = useState<JupyterSession[]>([]);
  const [kernels, setKernels] = useState<Array<{ id: string; name: string; execution_state: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Build request headers
  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }
    return headers;
  }, [token]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${serverUrl}/api/sessions`, {
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }

      const data = await response.json();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sessions');
    } finally {
      setIsLoading(false);
    }
  }, [serverUrl, getHeaders]);

  // Fetch kernels
  const fetchKernels = useCallback(async () => {
    try {
      const response = await fetch(`${serverUrl}/api/kernels`, {
        headers: getHeaders(),
      });

      if (!response.ok) return;

      const data = await response.json();
      setKernels(data);
    } catch {
      // Ignore kernel fetch errors
    }
  }, [serverUrl, getHeaders]);

  // Initial load
  useEffect(() => {
    fetchSessions();
    fetchKernels();
    
    // Periodic refresh
    const interval = setInterval(() => {
      fetchSessions();
      fetchKernels();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [fetchSessions, fetchKernels]);

  // Create session
  const createSession = useCallback(async () => {
    if (!newSessionName.trim()) return;

    setIsCreating(true);
    try {
      const response = await fetch(`${serverUrl}/api/sessions`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newSessionName,
          path: newSessionName,
          type: 'notebook',
          kernel: { name: 'python3' },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      await fetchSessions();
      setShowCreateDialog(false);
      setNewSessionName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  }, [serverUrl, getHeaders, newSessionName, fetchSessions]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;

    try {
      const response = await fetch(`${serverUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to delete session: ${response.status}`);
      }

      await fetchSessions();
      onSessionDelete(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  }, [serverUrl, getHeaders, fetchSessions, onSessionDelete]);

  // Get status color
  const getStatusColor = (state: string) => {
    switch (state) {
      case 'idle':
        return 'text-green-500';
      case 'busy':
        return 'text-yellow-500';
      case 'starting':
        return 'text-blue-500';
      default:
        return 'text-slate-500';
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-slate-500" />
          <span className="text-sm font-medium text-slate-800">Sessions</span>
          <span className="text-xs text-slate-500">({sessions.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="p-1 hover:bg-slate-100 rounded text-green-600 hover:text-green-700"
            title="New session"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => {
              fetchSessions();
              fetchKernels();
            }}
            disabled={isLoading}
            className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle size={12} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Session List */}
      <div className="flex-1 overflow-auto">
        {isLoading && sessions.length === 0 && (
          <div className="p-4 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        )}

        {!isLoading && sessions.length === 0 && (
          <div className="p-4 text-center text-slate-500 text-sm">
            No active sessions
          </div>
        )}

        {sessions.length > 0 && (
          <div className="divide-y divide-slate-200">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={currentSessionId === session.id || currentKernelId === session.kernel?.id}
                isSelected={selectedSessionId === session.id}
                onSelect={() => setSelectedSessionId(
                  selectedSessionId === session.id ? null : session.id
                )}
                onConnect={() => onSessionSelect(session)}
                onDelete={() => deleteSession(session.id)}
                getStatusColor={getStatusColor}
              />
            ))}
          </div>
        )}

        {/* Kernels Section */}
        {kernels.length > 0 && (
          <div className="border-t border-slate-200 mt-2">
            <div className="px-3 py-2 text-xs text-slate-500 font-medium">
              Running Kernels ({kernels.length})
            </div>
            <div className="divide-y divide-slate-200">
              {kernels.map((kernel) => (
                <div
                  key={kernel.id}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50"
                >
                  <Circle
                    size={8}
                    className={`fill-current ${getStatusColor(kernel.execution_state)}`}
                  />
                  <span className="text-sm text-slate-700 flex-1 truncate">
                    {kernel.name}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {kernel.id.slice(0, 8)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-80">
            <h3 className="text-slate-900 font-medium mb-3">New Session</h3>
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Session name"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSessionName.trim()) {
                  createSession();
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewSessionName('');
                }}
                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={createSession}
                disabled={!newSessionName.trim() || isCreating}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50 flex items-center gap-1"
              >
                {isCreating && <Loader2 size={12} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ============================================================
// SessionItem Component
// ============================================================

interface SessionItemProps {
  session: JupyterSession;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onConnect: () => void;
  onDelete: () => void;
  getStatusColor: (state: string) => string;
}

const SessionItem = memo(function SessionItem({
  session,
  isActive,
  isSelected,
  onSelect,
  onConnect,
  onDelete,
  getStatusColor,
}: SessionItemProps) {
  const kernel = session.kernel;
  
  return (
    <div className={`${isActive ? 'bg-blue-50' : isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
        onClick={onSelect}
      >
        <button className="p-0.5">
          {isSelected ? (
            <ChevronDown size={12} className="text-slate-500" />
          ) : (
            <ChevronRight size={12} className="text-slate-500" />
          )}
        </button>
        
        {kernel && (
          <Circle
            size={8}
            className={`fill-current ${getStatusColor(kernel.execution_state)}`}
          />
        )}
        
        <Server size={14} className="text-purple-600" />
        <span className="text-sm text-slate-700 flex-1 truncate">{session.name}</span>
        
        {isActive && (
          <span className="text-xs text-blue-600 flex items-center gap-1">
            <Check size={10} />
            Active
          </span>
        )}
      </div>

      {isSelected && (
        <div className="px-3 pb-2 pl-10 space-y-1">
          <div className="text-xs">
            <span className="text-slate-500">Path: </span>
            <span className="text-slate-600 font-mono">{session.path}</span>
          </div>
          
          <div className="text-xs">
            <span className="text-slate-500">Type: </span>
            <span className="text-slate-600">{session.type}</span>
          </div>
          
          {kernel && (
            <>
              <div className="text-xs">
                <span className="text-slate-500">Kernel: </span>
                <span className="text-slate-600">{kernel.name}</span>
              </div>
              <div className="text-xs">
                <span className="text-slate-500">State: </span>
                <span className={getStatusColor(kernel.execution_state)}>
                  {kernel.execution_state}
                </span>
              </div>
              <div className="text-xs flex items-center gap-1">
                <Clock size={10} className="text-slate-500" />
                <span className="text-slate-600">
                  {new Date(kernel.last_activity).toLocaleTimeString()}
                </span>
              </div>
            </>
          )}
          
          <div className="flex items-center gap-2 mt-2">
            {!isActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect();
                }}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
              >
                <Activity size={10} />
                Connect
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-600 rounded"
            >
              <Trash2 size={10} />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default SessionManager;
