/**
 * ExecutionManager - Execution Manager
 *
 * Responsibilities:
 * - Execution queue management
 * - Auto-retry mechanism
 * - Execution state tracking
 * - Timeout handling
 */

import { SafetyGuard } from './SafetyGuard';
import { JupyterService } from './JupyterService';
import { emit } from '../store/eventBus';
import type { Output, ExecutionState } from '../types';

// ============================================================
// Type Definitions
// ============================================================

export interface ExecutionTask {
  id: string;
  cellId: string;
  code: string;
  priority: number;
  createdAt: number;
  status: ExecutionTaskStatus;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  outputs: Output[];
  error?: string;
}

export type ExecutionTaskStatus = 
  | 'pending' 
  | 'running' 
  | 'success' 
  | 'error' 
  | 'timeout' 
  | 'cancelled'
  | 'retrying';

export interface ExecutionResult {
  taskId: string;
  cellId: string;
  success: boolean;
  outputs: Output[];
  executionCount: number;
  duration: number;
  retryCount: number;
  error?: string;
}

export interface ExecutionManagerConfig {
  maxConcurrent: number;
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
  autoRetryOnError: boolean;
}

export interface ExecutionManagerEvents {
  onTaskStart?: (task: ExecutionTask) => void;
  onTaskComplete?: (result: ExecutionResult) => void;
  onTaskError?: (task: ExecutionTask, error: Error) => void;
  onRetry?: (task: ExecutionTask, attempt: number) => void;
  onQueueChange?: (queue: ExecutionTask[]) => void;
}

// ============================================================
// ExecutionManager Class
// ============================================================

export class ExecutionManager {
  private config: ExecutionManagerConfig;
  private events: ExecutionManagerEvents;
  private jupyterService: JupyterService | null = null;
  private safetyGuard: SafetyGuard;
  
  private queue: ExecutionTask[] = [];
  private runningTasks: Map<string, ExecutionTask> = new Map();
  private isProcessing = false;

  constructor(
    config?: Partial<ExecutionManagerConfig>,
    events: ExecutionManagerEvents = {}
  ) {
    this.config = {
      maxConcurrent: 1,  // Jupyter kernel is single-threaded
      defaultTimeout: 60000,  // 60 seconds
      maxRetries: 3,
      retryDelay: 1000,
      autoRetryOnError: true,
      ...config,
    };
    this.events = events;
    this.safetyGuard = new SafetyGuard();
  }

  /**
   * Set Jupyter Service
   */
  setJupyterService(service: JupyterService): void {
    this.jupyterService = service;
  }

  /**
   * Set Safety Guard
   */
  setSafetyGuard(guard: SafetyGuard): void {
    this.safetyGuard = guard;
  }

  /**
   * Add execution task
   */
  enqueue(
    cellId: string,
    code: string,
    options?: {
      priority?: number;
      timeout?: number;
      maxRetries?: number;
    }
  ): string {
    const task: ExecutionTask = {
      id: crypto.randomUUID(),
      cellId,
      code,
      priority: options?.priority ?? 0,
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
      maxRetries: options?.maxRetries ?? this.config.maxRetries,
      timeout: options?.timeout ?? this.config.defaultTimeout,
      outputs: [],
    };

    // Insert into queue by priority
    const insertIndex = this.queue.findIndex(t => t.priority < task.priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }

    this.events.onQueueChange?.(this.queue);
    this.processQueue();

    return task.id;
  }

  /**
   * Cancel task
   */
  cancel(taskId: string): boolean {
    // Remove from queue
    const queueIndex = this.queue.findIndex(t => t.id === taskId);
    if (queueIndex !== -1) {
      this.queue[queueIndex].status = 'cancelled';
      this.queue.splice(queueIndex, 1);
      this.events.onQueueChange?.(this.queue);
      return true;
    }

    // Cancel running task
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      runningTask.status = 'cancelled';
      // Interrupt kernel execution
      this.jupyterService?.interruptKernel();
      return true;
    }

    return false;
  }

  /**
   * Cancel all tasks
   */
  cancelAll(): void {
    this.queue.forEach(t => t.status = 'cancelled');
    this.queue = [];
    this.runningTasks.forEach(t => t.status = 'cancelled');
    this.jupyterService?.interruptKernel();
    this.events.onQueueChange?.([]);
  }

  /**
   * Process queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;
    if (this.runningTasks.size >= this.config.maxConcurrent) return;
    if (!this.jupyterService) return;

    this.isProcessing = true;

    try {
      while (
        this.queue.length > 0 && 
        this.runningTasks.size < this.config.maxConcurrent
      ) {
        const task = this.queue.shift();
        if (!task) break;

        // Safety check
        const safetyCheck = this.safetyGuard.checkCode(task.code);
        if (safetyCheck.blocked) {
          task.status = 'error';
          task.error = `Blocked: ${safetyCheck.reason}`;
          this.events.onTaskError?.(task, new Error(task.error));
          continue;
        }

        // Execution limit check
        const canExecute = this.safetyGuard.canExecute();
        if (!canExecute.allowed) {
          task.status = 'error';
          task.error = canExecute.reason;
          this.events.onTaskError?.(task, new Error(task.error!));
          continue;
        }

        await this.executeTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: ExecutionTask): Promise<void> {
    task.status = 'running';
    this.runningTasks.set(task.id, task);
    this.events.onTaskStart?.(task);

    const recordId = this.safetyGuard.recordExecutionStart(task.cellId, task.code);
    const startTime = Date.now();

    try {
      const result = await this.executeWithTimeout(task);
      
      const duration = Date.now() - startTime;
      this.safetyGuard.recordExecutionEnd(recordId, result.success, result.error);

      if (result.success) {
        task.status = 'success';
        task.outputs = result.outputs;
        
        this.events.onTaskComplete?.({
          taskId: task.id,
          cellId: task.cellId,
          success: true,
          outputs: result.outputs,
          executionCount: result.executionCount,
          duration,
          retryCount: task.retryCount,
        });

        emit('cell:executed', {
          cellId: task.cellId,
          success: true,
          executionCount: result.executionCount,
        });
      } else {
        // Check if retry is possible
        if (this.shouldRetry(task, result.error)) {
          await this.retryTask(task);
        } else {
          task.status = 'error';
          task.error = result.error;
          
          this.events.onTaskComplete?.({
            taskId: task.id,
            cellId: task.cellId,
            success: false,
            outputs: result.outputs,
            executionCount: result.executionCount,
            duration,
            retryCount: task.retryCount,
            error: result.error,
          });

          emit('cell:executed', {
            cellId: task.cellId,
            success: false,
            executionCount: result.executionCount,
          });
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.safetyGuard.recordExecutionEnd(recordId, false, errorMessage);

      if (this.shouldRetry(task, errorMessage)) {
        await this.retryTask(task);
      } else {
        task.status = 'error';
        task.error = errorMessage;
        this.events.onTaskError?.(task, error as Error);
      }
    } finally {
      this.runningTasks.delete(task.id);
      this.processQueue();
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(task: ExecutionTask): Promise<{
    success: boolean;
    outputs: Output[];
    executionCount: number;
    error?: string;
  }> {
    return new Promise((resolve) => {
      if (!this.jupyterService) {
        resolve({
          success: false,
          outputs: [],
          executionCount: 0,
          error: 'Jupyter service not connected',
        });
        return;
      }

      const outputs: Output[] = [];
      let timeoutId: NodeJS.Timeout | undefined;

      const handle = this.jupyterService.execute(task.cellId, task.code);

      // Collect outputs
      handle.onOutput((output) => {
        outputs.push(output);
        task.outputs = outputs;
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        handle.cancel();
        task.status = 'timeout';
        resolve({
          success: false,
          outputs,
          executionCount: 0,
          error: `Execution timeout after ${task.timeout}ms`,
        });
      }, task.timeout);

      // Wait for completion
      handle.done
        .then((result) => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve({
            success: result.status === 'ok',
            outputs,
            executionCount: result.execution_count,
            error: result.status === 'error' 
              ? `${result.ename}: ${result.evalue}` 
              : undefined,
          });
        })
        .catch((error) => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve({
            success: false,
            outputs,
            executionCount: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
    });
  }

  /**
   * Determine whether to retry
   */
  private shouldRetry(task: ExecutionTask, error?: string): boolean {
    if (!this.config.autoRetryOnError) return false;
    if (task.retryCount >= task.maxRetries) return false;
    if (task.status === 'cancelled') return false;
    if (task.status === 'timeout') return false;

    // Some errors should not be retried
    const nonRetryableErrors = [
      'SyntaxError',
      'IndentationError',
      'NameError',
      'ImportError',
      'ModuleNotFoundError',
    ];

    if (error) {
      for (const errorType of nonRetryableErrors) {
        if (error.includes(errorType)) {
          return false;
        }
      }
    }

    // Check safety limits
    const canRetry = this.safetyGuard.canRetry(task.cellId);
    return canRetry.allowed;
  }

  /**
   * Retry task
   */
  private async retryTask(task: ExecutionTask): Promise<void> {
    task.retryCount++;
    task.status = 'retrying';
    task.outputs = [];
    
    this.events.onRetry?.(task, task.retryCount);

    // Retry after delay
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));

    // Re-add to front of queue
    this.queue.unshift(task);
    this.events.onQueueChange?.(this.queue);
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    pending: number;
    running: number;
    total: number;
    tasks: ExecutionTask[];
  } {
    return {
      pending: this.queue.length,
      running: this.runningTasks.size,
      total: this.queue.length + this.runningTasks.size,
      tasks: [...this.queue, ...this.runningTasks.values()],
    };
  }

  /**
   * Get task status
   */
  getTask(taskId: string): ExecutionTask | undefined {
    return this.queue.find(t => t.id === taskId) || this.runningTasks.get(taskId);
  }
}

/**
 * Create an ExecutionManager instance
 */
export function createExecutionManager(
  config?: Partial<ExecutionManagerConfig>,
  events?: ExecutionManagerEvents
): ExecutionManager {
  return new ExecutionManager(config, events);
}

export default ExecutionManager;
