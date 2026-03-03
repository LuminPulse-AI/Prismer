'use client';

/**
 * JupyterNotebook - Jupyter Notebook Main Component
 *
 * Phase 5 enhancements:
 * - Drag-and-drop cell reordering
 * - Cell type switching
 * - Package/Session/Artifacts sidebar
 * - AI conversation area optimization
 * - Undo/Redo support
 */

import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';

import { createEditorEventEmitter } from "@/lib/events";

const emitEvent = createEditorEventEmitter('jupyter-notebook');
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  Plus,
  Wifi,
  WifiOff,
  Circle,
  Loader2,
  Sparkles,
  Undo2,
  Redo2,
  Package,
  Layers,
  Archive,
  Database,
  Settings,
  PanelRightOpen,
  PanelRightClose,
  FolderOpen,
  ChevronDown,
  Power,
  PlusCircle,
  ArrowLeftRight,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotebookStore } from '../store';
import { JupyterService, createJupyterService } from '../services/JupyterService';
import { CodeCell, type CodeCellTheme } from './CodeCell';
import { QueryCell } from './QueryCell';
import { ConversationThread } from './ConversationThread';
import { CodeConfirmDialog } from './CodeConfirmDialog';
import { DraggableCellList } from './DraggableCellList';
import { PackageManager } from './PackageManager';
import { SessionManager } from './SessionManager';
import { ArtifactsPanel } from './ArtifactsPanel';
import { VariableInspector } from './VariableInspector';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useKeyboardShortcuts } from '../hooks';
import type { 
  KernelStatus, 
  CodeCell as CodeCellType, 
  MarkdownCell,
  AgentCell as AgentCellType,
  Cell,
} from '../types';
import type { CellAIAction } from './CellContextMenu';
import { useArtifacts } from '../store/artifactStore';
import { useArtifactCollector } from '../hooks/useArtifactCollector';
import { AssetBrowser, type AssetItem } from '@/components/shared/AssetBrowser';
import { componentEventBus } from '@/lib/events';

// ============================================================
// Type Definitions
// ============================================================

interface JupyterNotebookProps {
  serverUrl: string;
  token?: string;
  /** Direct WebSocket URL to Jupyter (bypasses HTTP proxy for kernel channels) */
  wsUrl?: string;
  agentApiEndpoint?: string;
  agentApiKey?: string;
  className?: string;
  /** Cell theme: default | slate | indigo, consistent with engineering color scheme */
  cellTheme?: CodeCellTheme;
}

type SidebarPanel = 'none' | 'variables' | 'packages' | 'sessions' | 'artifacts';

// ============================================================
// JupyterNotebook Component
// ============================================================

export function JupyterNotebook({
  serverUrl,
  token,
  wsUrl,
  agentApiEndpoint,
  agentApiKey,
  className = '',
  cellTheme = 'default',
}: JupyterNotebookProps) {
  const serviceRef = useRef<JupyterService | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAgent, setShowAgent] = useState(false); // TODO: Jupyter AI Assistant not ready — set true when re-enabling
  const [agentLoading, setAgentLoading] = useState(false);
  const [sidebarPanel, setSidebarPanel] = useState<SidebarPanel>('none');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);
  
  // Use Artifact Store
  const artifacts = useArtifacts();
  
  // Enable Artifact collector
  useArtifactCollector({ enabled: true });
  
  // Code confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    code: string;
    originalCode?: string;
    warnings?: string[];
    description?: string;
  }>({ isOpen: false, code: '' });

  // Agent responses
  const [agentResponses, setAgentResponses] = useState<AgentCellType[]>([]);

  // Store selectors
  const cells = useNotebookStore((state) => state.cells);
  const activeCellId = useNotebookStore((state) => state.activeCellId);
  const selectedCellIds = useNotebookStore((state) => state.selectedCellIds);
  const kernelStatus = useNotebookStore((state) => state.kernelStatus);
  const kernelId = useNotebookStore((state) => state.kernelId);
  const currentExecutingCellId = useNotebookStore((state) => state.currentExecutingCellId);
  const agentMode = useNotebookStore((state) => state.agentMode);
  const conversationHistory = useNotebookStore((state) => state.conversationHistory);
  const contextCellId = useNotebookStore((state) => state.contextCellId);

  // Store actions
  const addCodeCell = useNotebookStore((state) => state.addCodeCell);
  const addMarkdownCell = useNotebookStore((state) => state.addMarkdownCell);
  const setCellSource = useNotebookStore((state) => state.setCellSource);
  const deleteCell = useNotebookStore((state) => state.deleteCell);
  const setActiveCell = useNotebookStore((state) => state.setActiveCell);
  const selectCell = useNotebookStore((state) => state.selectCell);
  const setKernelId = useNotebookStore((state) => state.setKernelId);
  const setKernelStatus = useNotebookStore((state) => state.setKernelStatus);
  const startExecution = useNotebookStore((state) => state.startExecution);
  const completeExecution = useNotebookStore((state) => state.completeExecution);
  const appendCellOutput = useNotebookStore((state) => state.appendCellOutput);
  const clearAllOutputs = useNotebookStore((state) => state.clearAllOutputs);
  const addConversation = useNotebookStore((state) => state.addConversation);
  const setAgentMode = useNotebookStore((state) => state.setAgentMode);
  const setContextCellId = useNotebookStore((state) => state.setContextCellId);
  
  // Cell management actions
  const moveCellUp = useNotebookStore((state) => state.moveCellUp);
  const moveCellDown = useNotebookStore((state) => state.moveCellDown);
  const reorderCells = useNotebookStore((state) => state.reorderCells);
  const copyCell = useNotebookStore((state) => state.copyCell);
  const cutCell = useNotebookStore((state) => state.cutCell);
  const pasteCell = useNotebookStore((state) => state.pasteCell);
  const duplicateCell = useNotebookStore((state) => state.duplicateCell);
  const changeCellType = useNotebookStore((state) => state.changeCellType);
  const undo = useNotebookStore((state) => state.undo);
  const redo = useNotebookStore((state) => state.redo);
  const canUndo = useNotebookStore((state) => state.canUndo);
  const canRedo = useNotebookStore((state) => state.canRedo);
  
  // Agent edit actions
  const proposeEdit = useNotebookStore((state) => state.proposeEdit);
  const confirmEdit = useNotebookStore((state) => state.confirmEdit);
  const rejectEdit = useNotebookStore((state) => state.rejectEdit);
  const getPendingEdit = useNotebookStore((state) => state.getPendingEdit);

  // ============================================================
  // Auto Connection Management — fully managed, no user intervention needed
  // ============================================================

  // Connect to Jupyter Server (internal method, called automatically by the component)
  const connect = useCallback(async () => {
    if (!serviceRef.current) return;

    setIsConnecting(true);
    setError(null);

    try {
      await serviceRef.current.connect();

      // Check if there is a previous kernelId in store (e.g. tab switch back)
      const existingKernelId = useNotebookStore.getState().kernelId;
      if (existingKernelId) {
        try {
          console.log('[Jupyter] Reconnecting to existing kernel:', existingKernelId);
          await serviceRef.current.connectToKernel(existingKernelId);
          setKernelStatus('idle');
          console.log('[Jupyter] Reconnected to kernel:', existingKernelId);
          return;
        } catch (err) {
          console.warn('[Jupyter] Failed to reconnect to kernel, starting new one:', err);
          // Old kernel may have timed out, start a new one
        }
      }

      // No existing kernel or reconnection failed -> start a new kernel
      const newKernelId = await serviceRef.current.startKernel('python3');
      setKernelId(newKernelId);
      setKernelStatus('idle');
      console.log('[Jupyter] Connected with new kernel:', newKernelId);
    } catch (err) {
      console.error('[Jupyter] Failed to connect:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';

      if (errorMessage.includes('503') || errorMessage.includes('not running')) {
        setError('Container not running — start the agent to use Jupyter');
      } else if (errorMessage.includes('502') || errorMessage.includes('unavailable')) {
        setError('Jupyter service is starting up — try again in a few seconds');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        setError('Cannot reach Jupyter server — check that the container is running');
      } else {
        setError(errorMessage);
      }
      setKernelStatus('disconnected');
    } finally {
      setIsConnecting(false);
    }
  }, [setKernelId, setKernelStatus]);

  // Initialize service + auto connect
  useEffect(() => {
    const service = createJupyterService(
      { baseUrl: serverUrl, token, wsUrl },
      {
        onKernelStatus: (status) => {
          setKernelStatus(status);
          // Auto-reconnect: attempt to reconnect when kernel is dead
          if (status === 'dead') {
            console.warn('[Jupyter] Kernel dead, scheduling auto-reconnect...');
            setTimeout(() => {
              const svc = serviceRef.current;
              if (svc) {
                setKernelStatus('disconnected');
                // Clear old kernelId to force starting a new kernel
                useNotebookStore.getState().setKernelId(null);
                connect();
              }
            }, 1000);
          }
        },
        onOutput: (cellId, output) => {
          appendCellOutput(cellId, output);
        },
      }
    );
    serviceRef.current = service;
    emitEvent({ type: 'ready' });

    // Auto connect
    connect();

    return () => {
      // Component unmount: release local connection only, do not kill kernel
      service.disconnect();
    };
  }, [serverUrl, token, wsUrl, setKernelStatus, appendCellOutput, connect]);

  // Open asset from AssetBrowser
  const handleAssetSelect = useCallback((asset: AssetItem) => {
    componentEventBus.emit({
      component: 'jupyter-notebook',
      type: 'assetOpen',
      payload: { result: { assetId: asset.id, assetType: asset.type, title: asset.title } },
      timestamp: Date.now(),
    });
  }, []);

  // Cmd+O keyboard shortcut for asset browser
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        setShowAssetBrowser(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Execute Cell
  const executeCell = useCallback(async (cellId: string) => {
    const service = serviceRef.current;
    // Get fresh state from store to avoid stale closure
    const store = useNotebookStore.getState();
    const currentKernelStatus = store.kernelStatus;
    const currentCells = store.cells;
    
    console.log('[Jupyter] executeCell called for:', cellId, 'kernelStatus:', currentKernelStatus);
    
    if (!service) {
      console.log('[Jupyter] executeCell: No service available');
      return;
    }
    if (currentKernelStatus !== 'idle') {
      console.log('[Jupyter] executeCell: Kernel not idle, status:', currentKernelStatus);
      return;
    }

    const cell = currentCells.find((c) => c.id === cellId);
    if (!cell || cell.type !== 'code') {
      console.log('[Jupyter] executeCell: Cell not found or not code cell');
      return;
    }

    const codeCell = cell as CodeCellType;
    if (!codeCell.source.trim()) {
      console.log('[Jupyter] executeCell: Cell source is empty');
      return;
    }

    console.log('[Jupyter] executeCell: Starting execution...');
    startExecution(cellId);

    try {
      const handle = service.execute(cellId, codeCell.source);
      const result = await handle.done;
      
      console.log('[Jupyter] executeCell: Execution completed, status:', result.status);
      
      completeExecution(
        cellId, 
        result.status === 'ok', 
        result.execution_count
      );
      
      // Emit event for demo flow
      emitEvent({
        type: 'actionComplete',
        payload: {
          action: 'execute_cell',
          result: {
            cellId,
            cellIndex: currentCells.findIndex(c => c.id === cellId),
            success: result.status === 'ok',
            executionCount: result.execution_count,
            hasOutput: true,
          },
        },
      });
    } catch (err) {
      console.error('[Jupyter] Execution error:', err);
      completeExecution(cellId, false, 0);

      // Emit failure event
      emitEvent({
        type: 'actionFailed',
        payload: {
          action: 'execute_cell',
          error: err instanceof Error ? err : new Error(String(err)),
        },
      });
    }
  }, [startExecution, completeExecution]);

  // Listen for demo commands (must be after executeCell and connect are defined)
  useEffect(() => {
    const handleAddCell = (e: CustomEvent<{ type: 'code' | 'markdown'; source: string }>) => {
      const { type, source } = e.detail;
      if (type === 'code') {
        addCodeCell(source, activeCellId || undefined, 'user');
      } else {
        addMarkdownCell(source);
      }
      
      // Emit content loaded event
      emitEvent({
        type: 'contentLoaded',
        payload: { action: 'add_cell', result: { type, cellCount: cells.length + 1 } },
      });
    };

    const handleRunCell = (e: Event) => {
      const customEvent = e as CustomEvent<{ cellIndex: number }>;
      const { cellIndex } = customEvent.detail;
      const cell = cells[cellIndex];
      if (cell) {
        // Ensure we're connected first
        if (kernelStatus === 'disconnected') {
          connect().then(() => {
            // Small delay to ensure connection is established
            setTimeout(() => {
              executeCell(cell.id);
            }, 500);
          });
        } else {
          executeCell(cell.id);
        }
      }
    };

    // Combined add and run action - adds cell and immediately executes it
    // Using refs to avoid stale closure issues
    const handleAddAndRunCell = async (e: CustomEvent<{ type: 'code' | 'markdown'; source: string }>) => {
      const { type, source } = e.detail;
      if (type === 'code') {
        console.log('[Jupyter] handleAddAndRunCell triggered with source length:', source.length);
        
        // Add the cell
        const store = useNotebookStore.getState();
        const newCellId = store.addCodeCell(source, store.activeCellId || undefined, 'agent');
        console.log('[Jupyter] Cell added with ID:', newCellId);
        
        // Wait for cell to be added to state
        await new Promise(r => setTimeout(r, 500));
        
        // Check if we need to connect
        let currentStatus = useNotebookStore.getState().kernelStatus;
        console.log('[Jupyter] Initial kernel status:', currentStatus);
        
        if (currentStatus === 'disconnected') {
          console.log('[Jupyter] Kernel disconnected, attempting to connect...');
          try {
            await connect();
            console.log('[Jupyter] Connect called, waiting for kernel to be ready...');
            // Wait longer for connection to establish
            await new Promise(r => setTimeout(r, 2000));
          } catch (err) {
            console.error('[Jupyter] Failed to connect:', err);
            emitEvent({
              type: 'actionFailed',
              payload: { action: 'execute_cell', error: err instanceof Error ? err : new Error(String(err)) },
            });
            return;
          }
        }
        
        // Wait for kernel to become idle (with retries)
        const waitForIdle = async (maxWait = 15000): Promise<boolean> => {
          const start = Date.now();
          let attempts = 0;
          while (Date.now() - start < maxWait) {
            const status = useNotebookStore.getState().kernelStatus;
            attempts++;
            if (attempts % 4 === 0) {
              console.log('[Jupyter] Waiting for kernel idle... status:', status, 'elapsed:', Date.now() - start, 'ms');
            }
            if (status === 'idle') {
              console.log('[Jupyter] Kernel is now idle after', Date.now() - start, 'ms');
              return true;
            }
            if (status === 'disconnected') {
              console.log('[Jupyter] Kernel disconnected during wait');
              return false;
            }
            await new Promise(r => setTimeout(r, 250));
          }
          console.log('[Jupyter] Timeout waiting for kernel idle after', maxWait, 'ms');
          return false;
        };
        
        const isReady = await waitForIdle();
        if (isReady) {
          console.log('[Jupyter] Executing cell:', newCellId);
          // Call executeCell directly through the current closure
          executeCell(newCellId);
        } else {
          console.error('[Jupyter] Kernel not ready, skipping execution. Final status:', useNotebookStore.getState().kernelStatus);
          // Still emit success for demo to continue, but note the cell wasn't executed
          emitEvent({
            type: 'actionComplete',
            payload: { action: 'execute_cell', result: { cellId: newCellId, skipped: true, reason: 'kernel_not_ready' } },
          });
        }
      }
    };

    // ============================================================
    // Agent Directive Handlers (from Agent Server via WebSocket)
    // ============================================================
    
    // Handle UPDATE_NOTEBOOK directive from Agent Server
    const handleAgentUpdateNotebook = async (e: CustomEvent<{ 
      cells?: Array<{ type: 'code' | 'markdown'; source: string; outputs?: unknown[] }>;
      execute?: boolean;
    }>) => {
      const { cells: newCells, execute } = e.detail;
      console.log('[Jupyter] Agent UPDATE_NOTEBOOK:', newCells?.length, 'cells, execute:', execute);
      
      if (!newCells || newCells.length === 0) return;
      
      for (const cellData of newCells) {
        if (cellData.type === 'code') {
          // If execute is true, use the same logic as handleAddAndRunCell
          if (execute) {
            // Reuse handleAddAndRunCell logic
            const syntheticEvent = new CustomEvent('internal:addAndRunCell', {
              detail: { type: 'code' as const, source: cellData.source }
            });
            await handleAddAndRunCell(syntheticEvent);
          } else {
            // Just add the cell without executing
            addCodeCell(cellData.source, activeCellId || undefined, 'agent');
          }
        } else {
          addMarkdownCell(cellData.source);
        }
      }
    };
    
    // Handle EXECUTE_CELL directive (execute existing cell)
    const handleAgentExecuteCell = (e: CustomEvent<{ cellId?: string; cellIndex?: number }>) => {
      const { cellId, cellIndex } = e.detail;
      console.log('[Jupyter] Agent EXECUTE_CELL:', { cellId, cellIndex });
      
      let targetCell: Cell | undefined;
      if (cellId) {
        targetCell = cells.find(c => c.id === cellId);
      } else if (typeof cellIndex === 'number') {
        targetCell = cells[cellIndex];
      }
      
      if (targetCell && targetCell.type === 'code') {
        if (kernelStatus === 'disconnected') {
          connect().then(() => {
            setTimeout(() => executeCell(targetCell!.id), 500);
          });
        } else {
          executeCell(targetCell.id);
        }
      }
    };

    window.addEventListener('demo:addCell', handleAddCell as EventListener);
    window.addEventListener('demo:runCell', handleRunCell);
    window.addEventListener('demo:addAndRunCell', handleAddAndRunCell as unknown as EventListener);
    
    // Agent directive listeners
    window.addEventListener('agent:directive:UPDATE_NOTEBOOK', handleAgentUpdateNotebook as unknown as EventListener);
    window.addEventListener('agent:directive:EXECUTE_CELL', handleAgentExecuteCell as unknown as EventListener);

    return () => {
      window.removeEventListener('demo:addCell', handleAddCell as EventListener);
      window.removeEventListener('demo:runCell', handleRunCell);
      window.removeEventListener('demo:addAndRunCell', handleAddAndRunCell as unknown as EventListener);
      
      // Remove agent directive listeners
      window.removeEventListener('agent:directive:UPDATE_NOTEBOOK', handleAgentUpdateNotebook as unknown as EventListener);
      window.removeEventListener('agent:directive:EXECUTE_CELL', handleAgentExecuteCell as unknown as EventListener);
    };
  }, [cells, activeCellId, kernelStatus, addCodeCell, addMarkdownCell, executeCell, connect]);

  // Execute code (from Agent or confirmation dialog)
  const executeCode = useCallback(async (code: string) => {
    const cellId = addCodeCell(code, activeCellId || undefined, 'agent');
    setTimeout(() => executeCell(cellId), 100);
  }, [addCodeCell, activeCellId, executeCell]);

  // Insert code (without executing)
  const insertCode = useCallback((code: string) => {
    addCodeCell(code, activeCellId || undefined, 'agent');
    setConfirmDialog({ isOpen: false, code: '' });
  }, [addCodeCell, activeCellId]);

  // Execute all Cells
  const executeAllCells = useCallback(async () => {
    for (const cell of cells) {
      if (cell.type === 'code') {
        await executeCell(cell.id);
      }
    }
  }, [cells, executeCell]);

  // Interrupt execution
  const interruptExecution = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.interruptKernel();
    }
  }, []);

  // Restart Kernel
  const restartKernel = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.restartKernel();
      clearAllOutputs();
    }
  }, [clearAllOutputs]);

  // Handle Cell AI action
  const handleCellAIAction = useCallback((cellId: string, action: CellAIAction) => {
    const cell = cells.find(c => c.id === cellId);
    if (!cell || cell.type !== 'code') return;

    const codeCell = cell as CodeCellType;
    setContextCellId(cellId);

    const prompts: Record<CellAIAction, string> = {
      explain: `Please explain what this code does:\n\`\`\`python\n${codeCell.source}\n\`\`\``,
      fix: `This code may have issues, please help me fix it:\n\`\`\`python\n${codeCell.source}\n\`\`\``,
      optimize: `Please optimize the performance of this code:\n\`\`\`python\n${codeCell.source}\n\`\`\``,
      document: `Please add documentation and comments to this code:\n\`\`\`python\n${codeCell.source}\n\`\`\``,
      ask: '', // User provides their own input
    };

    if (action === 'ask') {
      // Only set context, let the user type their question
      return;
    }

    handleAgentQuery(prompts[action]);
  }, [cells, setContextCellId]);

  // Handle Agent query
  const handleAgentQuery = useCallback(async (query: string) => {
    if (!agentApiEndpoint) {
      // Mock Agent response (for demo purposes)
      setAgentLoading(true);
      addConversation('user', query, contextCellId || undefined);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockResponse: AgentCellType = {
        id: crypto.randomUUID(),
        type: 'agent',
        content: `I understand you want to: "${query}"\n\nHere's a suggested approach:`,
        actions: [
          {
            type: 'create_cell',
            code: `# Generated code for: ${query}\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\n# Your code here\nprint("Hello from AI!")`,
            description: 'Sample code to get started',
          },
        ],
        status: 'complete',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };
      
      setAgentResponses(prev => [...prev, mockResponse]);
      addConversation('assistant', mockResponse.content, contextCellId || undefined);
      setAgentLoading(false);
      setContextCellId(null);
      return;
    }

    // Actual API call...
    setAgentLoading(true);
    addConversation('user', query, contextCellId || undefined);

    try {
      const response = await fetch(agentApiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(agentApiKey && { 'Authorization': `Bearer ${agentApiKey}` }),
        },
        body: JSON.stringify({
          query,
          contextCellId,
          context: {
            cells: cells.map(c => ({
              id: c.id,
              type: c.type,
              source: c.type === 'code' ? (c as CodeCellType).source : '',
            })),
            kernelStatus,
          },
          history: conversationHistory.slice(-10),
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      const agentResponse: AgentCellType = {
        id: crypto.randomUUID(),
        type: 'agent',
        content: data.content || data.message || 'Response received',
        actions: data.actions || [],
        thinking: data.thinking,
        status: 'complete',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };

      setAgentResponses(prev => [...prev, agentResponse]);
      addConversation('assistant', agentResponse.content, contextCellId || undefined);
    } catch (err) {
      console.error('Agent error:', err);
      setError(err instanceof Error ? err.message : 'Agent request failed');
    } finally {
      setAgentLoading(false);
      setContextCellId(null);
    }
  }, [agentApiEndpoint, agentApiKey, cells, kernelStatus, conversationHistory, addConversation, contextCellId, setContextCellId]);

  // Handle Agent Action - execute code
  const handleAgentExecuteCode = useCallback((code: string) => {
    if (agentMode === 'interactive') {
      setConfirmDialog({
        isOpen: true,
        code,
        description: 'AI Assistant wants to run this code',
      });
    } else {
      executeCode(code);
    }
  }, [agentMode, executeCode]);

  // Handle confirmation dialog confirm
  const handleConfirmExecute = useCallback((code: string) => {
    setConfirmDialog({ isOpen: false, code: '' });
    executeCode(code);
  }, [executeCode]);

  // Note: Initial cells are now added by demo flow via demo:addAndRunCell event
  // No default "Hello World" cell needed

  // Keyboard shortcuts
  const { shortcuts } = useKeyboardShortcuts({
    runCell: () => activeCellId && executeCell(activeCellId),
    runCellAndAdvance: () => {
      if (activeCellId) {
        executeCell(activeCellId);
        const index = cells.findIndex(c => c.id === activeCellId);
        if (index < cells.length - 1) {
          setActiveCell(cells[index + 1].id);
        } else {
          addCodeCell('', activeCellId);
        }
      }
    },
    addCellBelow: () => addCodeCell('', activeCellId || undefined),
    addCellAbove: () => {
      const index = cells.findIndex(c => c.id === activeCellId);
      const afterId = index > 0 ? cells[index - 1].id : undefined;
      addCodeCell('', afterId);
    },
    deleteCell: () => activeCellId && deleteCell(activeCellId),
    selectPrevCell: () => {
      const index = cells.findIndex(c => c.id === activeCellId);
      if (index > 0) setActiveCell(cells[index - 1].id);
    },
    selectNextCell: () => {
      const index = cells.findIndex(c => c.id === activeCellId);
      if (index < cells.length - 1) setActiveCell(cells[index + 1].id);
    },
    undo: () => canUndo() && undo(),
    redo: () => canRedo() && redo(),
    showKeyboardShortcuts: () => setShowShortcuts(true),
  }, { enabled: true });

  // Render status indicator
  const renderStatusIndicator = () => {
    switch (kernelStatus) {
      case 'idle':
        return <Circle size={10} className="text-green-500 fill-green-500" />;
      case 'busy':
        return <Circle size={10} className="text-yellow-500 fill-yellow-500" />;
      case 'starting':
      case 'restarting':
        return <Loader2 size={12} className="text-blue-500 animate-spin" />;
      case 'dead':
        return <Circle size={10} className="text-red-500 fill-red-500" />;
      default:
        return <Circle size={10} className="text-stone-500" />;
    }
  };

  // Render Cell
  const renderCell = useCallback((cell: Cell, index: number) => {
    if (cell.type !== 'code') return null;
    
    const codeCell = cell as CodeCellType;
    const pendingEdit = getPendingEdit(cell.id);
    
    return (
      <CodeCell
        cell={codeCell}
        isActive={activeCellId === cell.id}
        isFirst={index === 0}
        isLast={index === cells.length - 1}
        kernelStatus={kernelStatus}
        theme={cellTheme}
        pendingEdit={pendingEdit}
        onExecute={() => executeCell(cell.id)}
        onSourceChange={(source) => setCellSource(cell.id, source)}
        onDelete={() => deleteCell(cell.id)}
        onFocus={() => setActiveCell(cell.id)}
        onMoveUp={() => moveCellUp(cell.id)}
        onMoveDown={() => moveCellDown(cell.id)}
        onCopy={() => copyCell(cell.id)}
        onCut={() => cutCell(cell.id)}
        onPaste={() => pasteCell(cell.id)}
        onDuplicate={() => duplicateCell(cell.id)}
        onChangeType={(type) => changeCellType(cell.id, type)}
        onAIAction={(action) => handleCellAIAction(cell.id, action)}
        onConfirmEdit={() => confirmEdit(cell.id)}
        onRejectEdit={() => rejectEdit(cell.id)}
      />
    );
  }, [
    activeCellId, cells.length, kernelStatus, cellTheme, getPendingEdit,
    executeCell, setCellSource, deleteCell, setActiveCell,
    moveCellUp, moveCellDown, copyCell, cutCell, pasteCell,
    duplicateCell, changeCellType, handleCellAIAction,
    confirmEdit, rejectEdit,
  ]);

  // Toggle sidebar
  const toggleSidebar = (panel: SidebarPanel) => {
    setSidebarPanel(current => current === panel ? 'none' : panel);
  };

  // Kernel CRUD: list running kernels (fetched when dropdown opens)
  const [runningKernels, setRunningKernels] = useState<Array<{ id: string; name: string }>>([]);
  const onKernelDropdownOpen = useCallback((open: boolean) => {
    if (open && serviceRef.current) {
      serviceRef.current.listRunningKernels().then(setRunningKernels);
    }
  }, []);

  const handleNewKernel = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      await svc.disconnect();
      setKernelId(null);
      setKernelStatus('disconnected');
      await connect();
    } catch (e) {
      console.error('[Jupyter] New kernel failed:', e);
    }
  }, [connect, setKernelId, setKernelStatus]);

  const handleSwitchKernel = useCallback(async (targetId: string) => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      await svc.connectToKernel(targetId);
      setKernelId(targetId);
      setKernelStatus('idle');
    } catch (e) {
      console.error('[Jupyter] Switch kernel failed:', e);
    }
  }, [setKernelId, setKernelStatus]);

  const handleShutdownKernel = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    try {
      await svc.shutdownKernel();
      setKernelId(null);
      setKernelStatus('disconnected');
    } catch (e) {
      console.error('[Jupyter] Shutdown kernel failed:', e);
    }
  }, [setKernelId, setKernelStatus]);

  const kernelDisplayName = (() => {
    const name = serviceRef.current?.getKernelName();
    return (name === 'python3' ? 'Python 3' : name) || 'Python 3';
  })();

  return (
    <div className={`flex flex-col h-full bg-white text-stone-800 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between h-10 px-3 py-2 bg-white border-b border-stone-200">
        <div className="flex items-center gap-2">
          {/* Unified Kernel status + CRUD dropdown */}
          <DropdownMenu onOpenChange={onKernelDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-stone-100 border border-transparent hover:border-stone-200 transition-colors"
                title="Kernel connection and status"
              >
                {isConnecting ? (
                  <Loader2 size={12} className="animate-spin text-indigo-600" />
                ) : kernelStatus === 'disconnected' || kernelStatus === 'dead' ? (
                  <WifiOff size={12} className="text-stone-400" />
                ) : (
                  renderStatusIndicator()
                )}
                <span className={
                  isConnecting ? 'text-indigo-600' :
                  kernelStatus === 'disconnected' || kernelStatus === 'dead' ? 'text-stone-400' :
                  'text-stone-700'
                }>
                  {isConnecting ? 'Connecting...' :
                   kernelStatus === 'dead' ? 'Reconnecting...' :
                   kernelStatus === 'disconnected' ? 'Offline' : `${kernelDisplayName}${kernelStatus !== 'idle' ? ` · ${kernelStatus}` : ''}`}
                </span>
                <ChevronDown size={12} className="text-stone-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem
                onClick={restartKernel}
                disabled={kernelStatus === 'disconnected'}
              >
                <RotateCcw size={14} />
                Restart kernel
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleShutdownKernel}
                disabled={kernelStatus === 'disconnected'}
                variant="destructive"
              >
                <Power size={14} />
                Shutdown kernel
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleNewKernel}>
                <PlusCircle size={14} />
                New kernel (Python 3)
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={kernelStatus === 'disconnected'}>
                  <ArrowLeftRight size={14} />
                  Switch kernel
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {runningKernels.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-stone-500">No running kernels</div>
                  ) : (
                    runningKernels.map((k) => (
                      <DropdownMenuItem
                        key={k.id}
                        onClick={() => handleSwitchKernel(k.id)}
                      >
                        <span className="w-4 flex items-center justify-center">
                          {k.id === kernelId ? <Circle size={10} className="text-green-500 fill-green-500" /> : null}
                        </span>
                        <span className="truncate">{k.name || k.id}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="w-px h-5 bg-stone-200" />

          {/* Execution controls */}
          <button
            onClick={executeAllCells}
            disabled={kernelStatus !== 'idle'}
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-stone-200/60 rounded text-sm disabled:opacity-50"
            title="Run All"
          >
            <Play size={14} />
            Run All
          </button>

          {currentExecutingCellId && (
            <button
              onClick={interruptExecution}
              className="flex items-center gap-1 px-2 py-1.5 hover:bg-stone-200/60 rounded text-sm text-yellow-400"
              title="Interrupt"
            >
              <Square size={14} />
              Stop
            </button>
          )}

          <button
            onClick={restartKernel}
            disabled={kernelStatus === 'disconnected'}
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-stone-200/60 rounded text-sm disabled:opacity-50"
            title="Restart Kernel"
          >
            <RotateCcw size={14} />
          </button>

          <button
            onClick={clearAllOutputs}
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-stone-200/60 rounded text-sm"
            title="Clear All Outputs"
          >
            <Trash2 size={14} />
          </button>

          <div className="w-px h-6 bg-stone-200" />

          {/* Undo/Redo */}
          <button
            onClick={undo}
            disabled={!canUndo()}
            className="p-1.5 hover:bg-stone-200/60 rounded disabled:opacity-30"
            title="Undo (⌘Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className="p-1.5 hover:bg-stone-200/60 rounded disabled:opacity-30"
            title="Redo (⌘⇧Z)"
          >
            <Redo2 size={14} />
          </button>

          <div className="w-px h-6 bg-stone-200" />

          {/* Open Asset */}
          <button
            onClick={() => setShowAssetBrowser(true)}
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-stone-200/60 rounded text-sm text-cyan-400"
            title="Open Asset (⌘O)"
          >
            <FolderOpen size={14} />
          </button>

          <div className="w-px h-6 bg-stone-200" />

          {/* TODO: Jupyter AI Assistant not ready — uncomment to re-enable
          <button
            onClick={() => setShowAgent(!showAgent)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-sm transition-colors ${
              showAgent
                ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                : 'hover:bg-stone-200/60 text-stone-500'
            }`}
            title="Toggle AI Assistant"
          >
            <Sparkles size={14} />
            AI
          </button>

          <button
            onClick={() => setAgentMode(agentMode === 'interactive' ? 'autonomous' : 'interactive')}
            className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors ${
              agentMode === 'autonomous'
                ? 'bg-amber-100 text-amber-600'
                : 'bg-stone-100 text-stone-500'
            }`}
            title={`Mode: ${agentMode}`}
          >
            {agentMode === 'interactive' ? 'Interactive' : 'Auto'}
          </button>
          */}
        </div>

        {/* Right toolbar */}
        <div className="flex items-center gap-2">
          {/* Sidebar toggles */}
          <div className="flex items-center bg-stone-100 rounded-lg p-0.5 overflow-hidden">
            <button
              onClick={() => toggleSidebar('variables')}
              className={`p-1.5 ${sidebarPanel === 'variables' ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:text-stone-800'}`}
              title="Variables"
            >
              <Database size={14} />
            </button>
            <button
              onClick={() => toggleSidebar('packages')}
              className={`p-1.5 ${sidebarPanel === 'packages' ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:text-stone-800'}`}
              title="Packages"
            >
              <Package size={14} />
            </button>
            <button
              onClick={() => toggleSidebar('sessions')}
              className={`p-1.5 ${sidebarPanel === 'sessions' ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:text-stone-800'}`}
              title="Sessions"
            >
              <Layers size={14} />
            </button>
            <button
              onClick={() => toggleSidebar('artifacts')}
              className={`p-1.5 ${sidebarPanel === 'artifacts' ? 'bg-indigo-600 text-white' : 'text-stone-600 hover:text-stone-800'}`}
              title="Artifacts"
            >
              <Archive size={14} />
            </button>
          </div>

        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-4 py-3 bg-red-50 text-red-600 border border-red-200 text-sm">
          <div className="flex items-start justify-between gap-4">
            <pre className="whitespace-pre-wrap font-mono text-xs flex-1">{error}</pre>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-600 shrink-0">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Left: cells column + AI Assistant at bottom */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* Cell List — scrollable */}
          <div className="flex-1 overflow-auto p-4 min-h-0">
            <DraggableCellList
              cells={cells.filter(c => c.type === 'code')}
              activeCellId={activeCellId}
              selectedCellIds={selectedCellIds}
              kernelStatus={kernelStatus}
              onReorder={reorderCells}
              onSelectCell={selectCell}
              renderCell={renderCell}
            />

            {/* Add Cell Button */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => addCodeCell('', activeCellId || undefined)}
                className="flex-1 py-2 border border-dashed border-stone-300 rounded-lg text-stone-500 hover:text-stone-700 hover:border-stone-400 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus size={16} />
                Code
              </button>
              <button
                onClick={() => addMarkdownCell('', activeCellId || undefined)}
                className="flex-1 py-2 border border-dashed border-stone-300 rounded-lg text-stone-500 hover:text-stone-700 hover:border-stone-400 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus size={16} />
                Markdown
              </button>
            </div>
          </div>

          {/* TODO: Jupyter AI Assistant not ready — uncomment to re-enable when development is complete
          {showAgent && (
            <div className="flex-shrink-0 border-t border-stone-200 p-4 bg-white flex flex-col min-h-0">
              <div className="text-sm text-stone-600 mb-2 flex items-center gap-2 flex-shrink-0">
                <Sparkles size={14} className="text-indigo-600" />
                AI Assistant
                {contextCellId && (
                  <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">
                    Context: Cell {contextCellId.slice(0, 6)}...
                  </span>
                )}
              </div>
              <ConversationThread
                messages={conversationHistory}
                agentResponses={agentResponses}
                onExecuteCode={handleAgentExecuteCode}
                onInsertCode={insertCode}
                onGoToCell={(cellId) => {
                  setActiveCell(cellId);
                }}
                className="flex-1 min-h-0 overflow-auto max-h-[280px]"
              />
              <div className="flex-shrink-0 mt-2">
                <QueryCell
                  onSubmit={handleAgentQuery}
                  isLoading={agentLoading}
                  disabled={kernelStatus === 'disconnected'}
                  placeholder={
                    contextCellId
                      ? `Ask about Cell ${contextCellId.slice(0, 6)}...`
                      : kernelStatus === 'disconnected'
                      ? 'Connect to Jupyter first...'
                      : 'Ask AI to help with your code...'
                  }
                />
              </div>
            </div>
          )}
          */}
        </div>

        {/* Sidebar — floating panel */}
        {sidebarPanel !== 'none' && (
          <div className="absolute right-3 top-3 bottom-3 w-80 bg-white border border-stone-200 rounded-xl shadow-lg flex flex-col overflow-hidden z-10">
            {sidebarPanel === 'variables' && (
              <VariableInspector
                jupyterService={serviceRef.current}
                isConnected={kernelStatus !== 'disconnected'}
              />
            )}
            {sidebarPanel === 'packages' && (
              <PackageManager
                jupyterService={serviceRef.current}
                isConnected={kernelStatus !== 'disconnected'}
              />
            )}
            {sidebarPanel === 'sessions' && (
              <SessionManager
                serverUrl={serverUrl}
                token={token}
                currentSessionId={null}
                currentKernelId={kernelId}
                onSessionSelect={(session) => {
                  console.log('Select session:', session);
                }}
                onSessionCreate={(name) => {
                  console.log('Create session:', name);
                }}
                onSessionDelete={(id) => {
                  console.log('Delete session:', id);
                }}
              />
            )}
            {sidebarPanel === 'artifacts' && (
              <ArtifactsPanel
                onGoToCell={(cellId) => {
                  setActiveCell(cellId);
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Code Confirm Dialog */}
      <CodeConfirmDialog
        isOpen={confirmDialog.isOpen}
        code={confirmDialog.code}
        originalCode={confirmDialog.originalCode}
        warnings={confirmDialog.warnings}
        description={confirmDialog.description}
        onConfirm={handleConfirmExecute}
        onCancel={() => setConfirmDialog({ isOpen: false, code: '' })}
        onInsert={insertCode}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcuts}
      />

      {/* Asset Browser */}
      <AssetBrowser
        isOpen={showAssetBrowser}
        onClose={() => setShowAssetBrowser(false)}
        onSelect={handleAssetSelect}
        title="Open Asset"
      />
    </div>
  );
}

export default JupyterNotebook;
