/**
 * Action Executor
 * 
 * Awaitable action executor - executes actions and waits for completion events.
 * Supports timeout, retry, and validation.
 */

import type { ComponentType } from '../types';
import { componentEventBus, type ComponentEventType, type ComponentEvent } from './componentEventBus';
import { useWorkspaceStore } from '../stores/workspaceStore';

// ============================================================
// Action Types
// ============================================================

export type ActionType =
  | 'switch_component'    // Switch to a component
  | 'load_document'       // Load a document (PDF)
  | 'load_code'           // Load code into playground
  | 'execute_code'        // Execute code in terminal
  | 'run_cell'            // Run Jupyter cell
  | 'add_cell'            // Add Jupyter cell
  | 'add_and_run_cell'    // Add and immediately run Jupyter cell
  | 'update_content'      // Update content in editor
  | 'compile_latex'       // Compile LaTeX document
  | 'send_chat'           // Send chat message to AI
  | 'load_data'           // Load data into grid
  | 'wait';               // Just wait for an event

export interface AwaitableAction {
  id: string;
  type: ActionType;
  target: ComponentType;
  params: Record<string, unknown>;
  
  // What event signals completion
  completionEvent: {
    type: ComponentEventType;
    action?: string;
    validate?: (event: ComponentEvent) => boolean;
  };
  
  // Options
  timeout?: number;        // Default 30000ms
  retries?: number;        // Default 0
  retryDelay?: number;     // Default 1000ms
}

export interface ActionResult {
  success: boolean;
  event?: ComponentEvent;
  error?: Error;
  duration: number;
}

// ============================================================
// Action Executor Implementation
// ============================================================

class ActionExecutorImpl {
  /**
   * Execute a single action and wait for completion
   */
  async execute(action: AwaitableAction): Promise<ActionResult> {
    const startTime = Date.now();
    const timeout = action.timeout ?? 30000;
    
    let lastError: Error | undefined;
    const maxRetries = action.retries ?? 0;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // IMPORTANT: Set up completion listener BEFORE dispatching action
        // This prevents race conditions where the event is emitted before we're listening
        const completionPromise = this.waitForCompletion(action, timeout);
        
        // Small delay to ensure listener is registered
        await new Promise(r => setTimeout(r, 50));
        
        // Dispatch action to component
        await this.dispatchAction(action);
        
        // Wait for completion event (listener was set up before dispatch)
        const event = await completionPromise;
        
        return {
          success: true,
          event,
          duration: Date.now() - startTime,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        
        if (attempt < maxRetries) {
          console.log(`[ActionExecutor] Retry ${attempt + 1}/${maxRetries} for ${action.type}`);
          await new Promise(r => setTimeout(r, action.retryDelay ?? 1000));
        }
      }
    }
    
    return {
      success: false,
      error: lastError,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute multiple actions in sequence
   */
  async executeSequence(actions: AwaitableAction[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    
    for (const action of actions) {
      const result = await this.execute(action);
      results.push(result);
      
      // Stop on failure
      if (!result.success) {
        console.error(`[ActionExecutor] Sequence stopped at ${action.id}:`, result.error);
        break;
      }
    }
    
    return results;
  }

  /**
   * Execute multiple actions in parallel
   */
  async executeParallel(actions: AwaitableAction[]): Promise<ActionResult[]> {
    return Promise.all(actions.map(action => this.execute(action)));
  }

  /**
   * Dispatch action to the appropriate component
   */
  private async dispatchAction(action: AwaitableAction): Promise<void> {
    const store = useWorkspaceStore.getState();
    
    switch (action.type) {
      case 'switch_component':
        store.setActiveComponent(action.target);
        // Component will emit 'ready' when mounted
        break;
        
      case 'load_document':
        store.setActiveComponent(action.target);
        store.updateComponentState('pdf-reader', {
          documentId: action.params.documentId as string,
          currentPage: 1,
        });
        // PDF Reader will emit 'contentLoaded' when document loads
        break;
        
      case 'load_code':
        store.setActiveComponent('code-playground');
        // Determine mode based on file extension or explicit param
        const activeFile = action.params.activeFile as string;
        const isPython = activeFile?.endsWith('.py');
        const codeMode: 'frontend' | 'script' = (action.params.mode as string) === 'frontend' ? 'frontend' : (isPython ? 'script' : 'frontend');
        store.updateComponentState('code-playground', {
          mode: codeMode,
          template: action.params.template as string ?? (isPython ? 'python' : 'react'),
          selectedFile: activeFile,
        });
        // Emit command to Code Playground via custom event
        window.dispatchEvent(new CustomEvent('demo:loadCode', {
          detail: {
            files: action.params.files,
            activeFile: action.params.activeFile,
          },
        }));
        break;
        
      case 'execute_code':
        // Emit command to Code Playground
        window.dispatchEvent(new CustomEvent('demo:executeCode', {
          detail: {
            command: action.params.command,
          },
        }));
        break;
        
      case 'add_cell':
        store.setActiveComponent('jupyter-notebook');
        window.dispatchEvent(new CustomEvent('demo:addCell', {
          detail: {
            type: action.params.type ?? 'code',
            source: action.params.source,
          },
        }));
        break;
        
      case 'run_cell':
        window.dispatchEvent(new CustomEvent('demo:runCell', {
          detail: {
            cellIndex: action.params.cellIndex,
          },
        }));
        break;
        
      case 'add_and_run_cell':
        // Combined action: add cell and immediately run it
        console.log('[ActionExecutor] Dispatching add_and_run_cell event');
        window.dispatchEvent(new CustomEvent('demo:addAndRunCell', {
          detail: {
            type: action.params.type ?? 'code',
            source: action.params.source,
          },
        }));
        break;
        
      case 'update_content':
        store.setActiveComponent(action.target);
        if (action.target === 'latex-editor') {
          window.dispatchEvent(new CustomEvent('demo:updateLatex', {
            detail: {
              file: action.params.file,
              content: action.params.content,
            },
          }));
        } else if (action.target === 'ai-editor') {
          store.updateComponentState('ai-editor', {
            content: action.params.content as string,
          });
        }
        break;
        
      case 'compile_latex':
        window.dispatchEvent(new CustomEvent('demo:compileLatex', {
          detail: {},
        }));
        break;
        
      case 'send_chat':
        window.dispatchEvent(new CustomEvent('demo:sendChat', {
          detail: {
            component: action.target,
            message: action.params.message,
          },
        }));
        break;
        
      case 'load_data':
        store.setActiveComponent('ag-grid');
        window.dispatchEvent(new CustomEvent('demo:loadData', {
          detail: {
            data: action.params.data,
            columns: action.params.columns,
          },
        }));
        break;
        
      case 'wait':
        // No dispatch needed, just wait for the event
        break;
        
      default:
        console.warn(`[ActionExecutor] Unknown action type: ${action.type}`);
    }
  }

  /**
   * Wait for completion event from component
   */
  private async waitForCompletion(
    action: AwaitableAction,
    timeout: number
  ): Promise<ComponentEvent> {
    const { completionEvent } = action;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error(
          `Timeout waiting for ${action.target}:${completionEvent.type}` +
          (completionEvent.action ? `:${completionEvent.action}` : '')
        ));
      }, timeout);

      const unsubscribe = componentEventBus.on(
        action.target,
        completionEvent.type,
        (event) => {
          // Check action match if specified
          if (completionEvent.action && event.payload?.action !== completionEvent.action) {
            return;
          }
          
          // Run custom validation if specified
          if (completionEvent.validate && !completionEvent.validate(event)) {
            return;
          }

          clearTimeout(timeoutId);
          unsubscribe();
          resolve(event);
        }
      );
    });
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const actionExecutor = new ActionExecutorImpl();

// ============================================================
// Helper Functions
// ============================================================

/**
 * Create a switch_component action
 */
export function createSwitchAction(
  id: string,
  target: ComponentType,
  timeout = 5000
): AwaitableAction {
  return {
    id,
    type: 'switch_component',
    target,
    params: {},
    completionEvent: { type: 'ready' },
    timeout,
  };
}

/**
 * Create a load_document action for PDF Reader
 */
export function createLoadDocumentAction(
  id: string,
  documentId: string,
  timeout = 30000
): AwaitableAction {
  return {
    id,
    type: 'load_document',
    target: 'pdf-reader',
    params: { documentId },
    completionEvent: { type: 'contentLoaded' },
    timeout,
  };
}

/**
 * Create an execute_code action
 */
export function createExecuteCodeAction(
  id: string,
  command: string,
  timeout = 120000
): AwaitableAction {
  return {
    id,
    type: 'execute_code',
    target: 'code-playground',
    params: { command },
    completionEvent: {
      type: 'actionComplete',
      action: 'execute_code',
    },
    timeout,
  };
}

/**
 * Create a run_cell action for Jupyter
 */
export function createRunCellAction(
  id: string,
  cellIndex: number,
  timeout = 60000
): AwaitableAction {
  return {
    id,
    type: 'run_cell',
    target: 'jupyter-notebook',
    params: { cellIndex },
    completionEvent: {
      type: 'actionComplete',
      action: 'execute_cell',
    },
    timeout,
  };
}

/**
 * Create a compile_latex action
 */
export function createCompileLatexAction(
  id: string,
  timeout = 30000
): AwaitableAction {
  return {
    id,
    type: 'compile_latex',
    target: 'latex-editor',
    params: {},
    completionEvent: {
      type: 'actionComplete',
      action: 'compile',
    },
    timeout,
  };
}

/**
 * Create a send_chat action for AI interaction
 */
export function createSendChatAction(
  id: string,
  target: ComponentType,
  message: string,
  timeout = 60000
): AwaitableAction {
  return {
    id,
    type: 'send_chat',
    target,
    params: { message },
    completionEvent: {
      type: 'actionComplete',
      action: 'ai_chat',
    },
    timeout,
  };
}
