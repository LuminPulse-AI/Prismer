/**
 * JupyterService - Jupyter Kernel Connection and Code Execution Service
 *
 * Communicates with a remote Jupyter Server via @jupyterlab/services.
 */

import {
  KernelManager,
  ServerConnection,
  KernelMessage,
  Kernel,
} from '@jupyterlab/services';
import type { 
  KernelStatus, 
  Output, 
  StreamOutput, 
  ExecuteResultOutput, 
  DisplayDataOutput, 
  ErrorOutput,
  ExecutionHandle,
  ExecuteReply,
} from '../types';

export interface JupyterServiceConfig {
  baseUrl: string;
  token?: string;
  wsUrl?: string;
}

export interface JupyterServiceEvents {
  onKernelStatus?: (status: KernelStatus) => void;
  onOutput?: (cellId: string, output: Output) => void;
}

/**
 * JupyterService class
 * Encapsulates all communication with Jupyter Server.
 */
export class JupyterService {
  private serverSettings: ServerConnection.ISettings | null = null;
  private kernelManager: KernelManager | null = null;
  private kernel: Kernel.IKernelConnection | null = null;
  private config: JupyterServiceConfig;
  private events: JupyterServiceEvents;
  private executionCount = 0;

  constructor(config: JupyterServiceConfig, events: JupyterServiceEvents = {}) {
    this.config = config;
    this.events = events;
  }

  /**
   * Connect to Jupyter Server
   */
  async connect(): Promise<void> {
    const token = this.config.token || '';

    // Ensure baseUrl is properly formatted
    let baseUrl = this.config.baseUrl;
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    
    // Build wsUrl, ensure token is included
    let wsUrl = this.config.wsUrl || baseUrl.replace(/^http/, 'ws');
    if (!wsUrl.endsWith('/')) {
      wsUrl += '/';
    }

    console.log('[JupyterService] Connecting with settings:', {
      baseUrl,
      wsUrl,
      hasToken: !!token,
    });

    // Create server connection settings
    this.serverSettings = ServerConnection.makeSettings({
      baseUrl,
      wsUrl,
      token,
      appendToken: true, // Ensure token is added to all requests
    });

    // Create kernel manager
    this.kernelManager = new KernelManager({
      serverSettings: this.serverSettings,
    });

    // Wait for kernel manager to be ready
    await this.kernelManager.ready;
    
    console.log('[JupyterService] Connected to Jupyter Server');
  }

  /**
   * Release local connection (without killing the kernel).
   * Called on tab switch or component unmount; kernel continues running on server.
   */
  async disconnect(): Promise<void> {
    if (this.kernel) {
      try { this.kernel.dispose(); } catch { /* ignore */ }
      this.kernel = null;
    }
    this.kernelManager = null;
    this.serverSettings = null;
    console.log('[JupyterService] Local connection disposed (kernel still alive on server)');
  }

  /**
   * Reconnect to an existing kernel (used when switching back to tab)
   */
  async connectToKernel(kernelId: string, name = 'python3'): Promise<string> {
    if (!this.kernelManager) {
      throw new Error('Not connected to Jupyter Server');
    }

    if (this.kernel) {
      try { this.kernel.dispose(); } catch { /* ignore */ }
    }

    this.kernel = this.kernelManager.connectTo({ model: { id: kernelId, name } });

    this.kernel.statusChanged.connect((_, status) => {
      this.events.onKernelStatus?.(this.mapKernelStatus(status));
    });

    // Wait for connection to be ready
    await (this.kernel as any).ready;

    console.log(`[JupyterService] Reconnected to kernel: ${this.kernel.id}, status: ${this.kernel.status}`);
    return this.kernel.id;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.kernelManager !== null;
  }

  /**
   * Check if kernel is alive
   */
  isKernelAlive(): boolean {
    return this.kernel !== null && this.kernel.status !== 'dead';
  }

  /**
   * Get available kernel types
   */
  async getKernelSpecs(): Promise<Array<{ name: string; displayName: string; language: string }>> {
    if (!this.kernelManager || !this.serverSettings) {
      throw new Error('Not connected to Jupyter Server');
    }

    // Fetch kernel specs directly from REST API
    try {
      const response = await ServerConnection.makeRequest(
        `${this.serverSettings.baseUrl}api/kernelspecs`,
        {},
        this.serverSettings
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch kernel specs: ${response.status}`);
      }
      
      const data = await response.json() as {
        default: string;
        kernelspecs: Record<string, { 
          name: string; 
          spec: { display_name: string; language: string } 
        }>;
      };
      
      return Object.entries(data.kernelspecs).map(([name, info]) => ({
        name,
        displayName: info.spec?.display_name || name,
        language: info.spec?.language || 'unknown',
      }));
    } catch (error) {
      console.error('Failed to get kernel specs:', error);
      return [{ name: 'python3', displayName: 'Python 3', language: 'python' }];
    }
  }

  /**
   * Start a new kernel
   */
  async startKernel(name = 'python3'): Promise<string> {
    if (!this.kernelManager) {
      throw new Error('Not connected to Jupyter Server');
    }

    // Release old connection (without killing kernel)
    if (this.kernel) {
      try { this.kernel.dispose(); } catch { /* ignore */ }
    }

    // Start new kernel
    this.kernel = await this.kernelManager.startNew({ name });
    
    // Subscribe to status changes
    this.kernel.statusChanged.connect((_, status) => {
      this.events.onKernelStatus?.(this.mapKernelStatus(status));
    });

    console.log(`[JupyterService] Kernel started: ${this.kernel.id}`);
    return this.kernel.id;
  }

  /**
   * Shutdown current kernel
   */
  async shutdownKernel(): Promise<void> {
    if (this.kernel) {
      await this.kernel.shutdown();
      this.kernel = null;
      console.log('[JupyterService] Kernel shutdown');
    }
  }

  /**
   * Interrupt current execution
   */
  async interruptKernel(): Promise<void> {
    if (this.kernel) {
      await this.kernel.interrupt();
      console.log('[JupyterService] Kernel interrupted');
    }
  }

  /**
   * Restart kernel
   */
  async restartKernel(): Promise<void> {
    if (this.kernel) {
      await this.kernel.restart();
      console.log('[JupyterService] Kernel restarted');
    }
  }

  /**
   * Get current kernel status
   */
  getKernelStatus(): KernelStatus {
    if (!this.kernel) return 'disconnected';
    return this.mapKernelStatus(this.kernel.status);
  }

  /**
   * Get current kernel ID
   */
  getKernelId(): string | null {
    return this.kernel?.id || null;
  }

  /**
   * Get current kernel display name (e.g. Python 3)
   */
  getKernelName(): string | null {
    if (!this.kernel) return null;
    const name = (this.kernel as { name?: string }).name ?? this.kernel.id;
    return name || null;
  }

  /**
   * List all running kernels on the server (for switching/CRUD)
   */
  async listRunningKernels(): Promise<Array<{ id: string; name: string }>> {
    if (!this.serverSettings) return [];
    try {
      const response = await ServerConnection.makeRequest(
        `${this.serverSettings.baseUrl}api/kernels`,
        {},
        this.serverSettings
      );
      if (!response.ok) return [];
      const data = (await response.json()) as Array<{ id: string; name: string }>;
      return Array.isArray(data) ? data.map((k) => ({ id: k.id, name: k.name || 'python3' })) : [];
    } catch {
      return [];
    }
  }

  /**
   * Execute code
   */
  execute(cellId: string, code: string): ExecutionHandle {
    if (!this.kernel) {
      throw new Error('No kernel connected');
    }

    const outputs: Output[] = [];
    let resolveComplete: (result: ExecuteReply) => void;
    let rejectComplete: (error: Error) => void;

    const donePromise = new Promise<ExecuteReply>((resolve, reject) => {
      resolveComplete = resolve;
      rejectComplete = reject;
    });

    // Send execution request
    const future = this.kernel.requestExecute({
      code,
      silent: false,
      store_history: true,
      allow_stdin: false,
      stop_on_error: true,
    });

    const msgId = future.msg.header.msg_id;

    // Handle IOPub messages (outputs)
    future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
      const output = this.parseIOPubMessage(msg);
      if (output) {
        outputs.push(output);
        this.events.onOutput?.(cellId, output);
      }
    };

    // Handle execution reply
    future.onReply = (msg: KernelMessage.IExecuteReplyMsg) => {
      const content = msg.content;
      this.executionCount = content.execution_count || this.executionCount + 1;

      const result: ExecuteReply = {
        status: content.status as 'ok' | 'error' | 'aborted',
        execution_count: this.executionCount,
      };

      if (content.status === 'error') {
        result.ename = content.ename;
        result.evalue = content.evalue;
        result.traceback = content.traceback;
      }

      resolveComplete(result);
    };

    // 处理错误
    future.onStdin = () => {
      // 不支持交互式输入
      console.warn('[JupyterService] Stdin request ignored');
    };

    // 创建执行句柄
    const handle: ExecutionHandle = {
      id: msgId,
      cellId,
      onOutput: (callback) => {
        const originalOnOutput = this.events.onOutput;
        this.events.onOutput = (id, output) => {
          if (id === cellId) callback(output);
          originalOnOutput?.(id, output);
        };
      },
      onComplete: (callback) => {
        donePromise.then(callback);
      },
      onError: (callback) => {
        donePromise.then((result) => {
          if (result.status === 'error') {
            callback({
              type: 'error',
              ename: result.ename || 'Error',
              evalue: result.evalue || 'Unknown error',
              traceback: result.traceback || [],
            });
          }
        });
      },
      cancel: () => {
        future.dispose();
        rejectComplete(new Error('Execution cancelled'));
      },
      done: donePromise,
    };

    return handle;
  }

  /**
   * 解析 IOPub 消息为 Output
   */
  private parseIOPubMessage(msg: KernelMessage.IIOPubMessage): Output | null {
    const msgType = msg.header.msg_type;
    const content = msg.content as Record<string, unknown>;

    switch (msgType) {
      case 'stream': {
        return {
          type: 'stream',
          name: content.name as 'stdout' | 'stderr',
          text: content.text as string,
        } satisfies StreamOutput;
      }

      case 'execute_result': {
        return {
          type: 'execute_result',
          executionCount: content.execution_count as number,
          data: content.data as Record<string, unknown>,
          metadata: content.metadata as Record<string, unknown>,
        } satisfies ExecuteResultOutput;
      }

      case 'display_data': {
        return {
          type: 'display_data',
          data: content.data as Record<string, unknown>,
          metadata: content.metadata as Record<string, unknown>,
        } satisfies DisplayDataOutput;
      }

      case 'error': {
        return {
          type: 'error',
          ename: content.ename as string,
          evalue: content.evalue as string,
          traceback: content.traceback as string[],
        } satisfies ErrorOutput;
      }

      case 'status':
      case 'execute_input':
        // 这些消息不作为输出处理
        return null;

      default:
        console.log(`[JupyterService] Unknown message type: ${msgType}`);
        return null;
    }
  }

  /**
   * 映射 Kernel 状态
   */
  private mapKernelStatus(status: Kernel.Status): KernelStatus {
    switch (status) {
      case 'idle':
        return 'idle';
      case 'busy':
        return 'busy';
      case 'starting':
        return 'starting';
      case 'restarting':
        return 'restarting';
      case 'dead':
        return 'dead';
      case 'unknown':
      default:
        return 'disconnected';
    }
  }
}

/**
 * 创建 JupyterService 实例的工厂函数
 */
export function createJupyterService(
  config: JupyterServiceConfig,
  events?: JupyterServiceEvents
): JupyterService {
  return new JupyterService(config, events);
}
