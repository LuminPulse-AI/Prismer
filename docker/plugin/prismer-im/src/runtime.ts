/**
 * Prismer IM Channel Plugin - Runtime (SDK v1.7)
 *
 * Refactored to use @prismer/sdk for IM operations.
 * Replaces custom WebSocket with SDK's realtime.connectWS().
 */

import { PrismerClient } from '@prismer/sdk';
import type {
  PrismerIMAccountConfig,
  ResolvedPrismerIMAccount,
  IMMessage,
  SendMessageResponse,
  UIDirective,
  SkillEvent,
  ChannelStatusSnapshot,
} from './types.js';

// ============================================================
// Logger Interface (from OpenClaw api.logger)
// ============================================================

interface PluginLogger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Console-based fallback logger
const consoleLogger: PluginLogger = {
  info: (...args: unknown[]) => console.log('[prismer-im]', ...args),
  debug: (...args: unknown[]) => console.debug('[prismer-im]', ...args),
  warn: (...args: unknown[]) => console.warn('[prismer-im]', ...args),
  error: (...args: unknown[]) => console.error('[prismer-im]', ...args),
};

// ============================================================
// SDK WebSocket Client Type (from @prismer/sdk)
// ============================================================

interface RealtimeWSClient {
  state: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
  connect(): Promise<void>;
  disconnect(): void;
  joinConversation(conversationId: string): void;
  sendMessage(conversationId: string, content: string): void;
  startTyping(conversationId: string): void;
  stopTyping(conversationId: string): void;
  updatePresence(status: 'online' | 'away' | 'busy' | 'offline'): void;
  ping(): Promise<unknown>;
  on(event: string, handler: (data: unknown) => void): void;
  off(event: string, handler: (data: unknown) => void): void;
}

// ============================================================
// Runtime State
// ============================================================

interface RuntimeState {
  accounts: Map<string, ResolvedPrismerIMAccount>;
  clients: Map<string, PrismerClient>;
  wsConnections: Map<string, RealtimeWSClient>;
  messageHandlers: Map<string, (msg: IMMessage) => void>;
  stats: Map<string, {
    messagesSent: number;
    messagesReceived: number;
    directivesSent: number;
    skillEventsSent: number;
  }>;
}

let _logger: PluginLogger = consoleLogger;
const _state: RuntimeState = {
  accounts: new Map(),
  clients: new Map(),
  wsConnections: new Map(),
  messageHandlers: new Map(),
  stats: new Map(),
};

// ============================================================
// OpenClaw Dispatcher Injection
// ============================================================

type OpenClawDispatchFn = (params: {
  ctx: Record<string, unknown>;
  deliver: (payload: { text?: string; mediaUrl?: string }) => Promise<void>;
  onError: (err: unknown) => void;
}) => Promise<void>;

let _openClawDispatcher: OpenClawDispatchFn | null = null;

/**
 * Set the OpenClaw dispatch function
 */
export function setOpenClawDispatcher(dispatcher: OpenClawDispatchFn): void {
  _openClawDispatcher = dispatcher;
  _logger.info('OpenClaw dispatcher injected');
}

/**
 * Get the OpenClaw dispatch function
 */
export function getOpenClawDispatcher(): OpenClawDispatchFn | null {
  return _openClawDispatcher;
}

// ============================================================
// Runtime Management
// ============================================================

/**
 * Set the OpenClaw logger instance
 */
export function setPrismerIMLogger(logger: PluginLogger): void {
  _logger = logger;
  _logger.info('Runtime initialized (SDK v1.7)');
}

/**
 * Get the logger instance
 */
export function getLogger(): PluginLogger {
  return _logger;
}

// Legacy compatibility
export function setPrismerIMRuntime(_runtime: unknown): void {
  console.log('[prismer-im] setPrismerIMRuntime called (logger set separately)');
}

export function getPrismerIMRuntime(): { log: PluginLogger } {
  return { log: _logger };
}

// ============================================================
// Account Management
// ============================================================

/**
 * Initialize an account and establish connections using SDK
 */
export async function initializeAccount(
  accountId: string,
  config: PrismerIMAccountConfig
): Promise<ResolvedPrismerIMAccount> {
  _logger.info(`Initializing account: ${accountId} (using SDK v1.7)`);

  const account: ResolvedPrismerIMAccount = {
    ...config,
    accountId,
    enabled: true,
    status: 'connecting',
  };

  _state.accounts.set(accountId, account);
  _state.stats.set(accountId, {
    messagesSent: 0,
    messagesReceived: 0,
    directivesSent: 0,
    skillEventsSent: 0,
  });

  try {
    // Create SDK client
    const client = new PrismerClient({
      baseUrl: config.imServerUrl,
    });

    // Set the agent token
    client.setToken(config.agentToken);
    _state.clients.set(accountId, client);

    // Connect via SDK's realtime WebSocket
    const ws = client.im.realtime.connectWS({
      token: config.agentToken,
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectBaseDelay: 1000,
      reconnectMaxDelay: 30000,
      heartbeatInterval: 25000,
    });

    // Set up event handlers
    setupWSEventHandlers(accountId, ws);

    // Connect
    await ws.connect();
    _state.wsConnections.set(accountId, ws);

    // Join the workspace conversation
    if (config.conversationId) {
      ws.joinConversation(config.conversationId);
    }

    account.status = 'connected';
    _logger.info(`Account ${accountId} connected via SDK`);
  } catch (error) {
    account.status = 'error';
    account.lastError = error instanceof Error ? error.message : String(error);
    _logger.error(`Failed to connect account ${accountId}:`, error);
  }

  return account;
}

/**
 * Set up WebSocket event handlers
 */
function setupWSEventHandlers(accountId: string, ws: RealtimeWSClient): void {
  const stats = _state.stats.get(accountId);

  // Handle incoming messages
  ws.on('message.new', (data: unknown) => {
    const msg = data as {
      id: string;
      conversationId: string;
      senderId: string;
      content: string;
      type: string;
      metadata?: Record<string, unknown>;
      createdAt: string;
      sender?: { id: string; displayName?: string };
    };

    _logger.debug(`New message received: ${msg.id}`);
    if (stats) stats.messagesReceived++;

    // Convert to IMMessage format
    const imMessage: IMMessage = {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      content: msg.content,
      type: msg.type as IMMessage['type'],
      metadata: msg.metadata,
      createdAt: msg.createdAt,
      sender: msg.sender ? {
        id: msg.sender.id,
        displayName: msg.sender.displayName,
      } : undefined,
    };

    // Notify handler
    const handler = _state.messageHandlers.get(accountId);
    if (handler) {
      handler(imMessage);
    }
  });

  // Handle connection events
  ws.on('connected', () => {
    _logger.info(`WebSocket connected for ${accountId}`);
    const account = _state.accounts.get(accountId);
    if (account) {
      account.status = 'connected';
    }
  });

  ws.on('disconnected', (data: unknown) => {
    const reason = data as { code?: number; reason?: string };
    _logger.info(`WebSocket disconnected for ${accountId}: ${reason.reason || 'unknown'}`);
    const account = _state.accounts.get(accountId);
    if (account) {
      account.status = 'disconnected';
    }
  });

  ws.on('reconnecting', (data: unknown) => {
    const info = data as { attempt?: number; delayMs?: number };
    _logger.info(`WebSocket reconnecting for ${accountId} (attempt ${info.attempt})`);
  });

  ws.on('error', (data: unknown) => {
    const error = data as { message?: string };
    _logger.error(`WebSocket error for ${accountId}:`, error.message || error);
  });

  // Handle typing indicators
  ws.on('typing.indicator', (data: unknown) => {
    _logger.debug(`Typing indicator:`, data);
  });

  // Handle presence changes
  ws.on('presence.changed', (data: unknown) => {
    _logger.debug(`Presence changed:`, data);
  });
}

/**
 * Disconnect and cleanup an account
 */
export async function disconnectAccount(accountId: string): Promise<void> {
  _logger.info(`Disconnecting account: ${accountId}`);

  const ws = _state.wsConnections.get(accountId);
  if (ws) {
    ws.disconnect();
    _state.wsConnections.delete(accountId);
  }

  _state.clients.delete(accountId);

  const account = _state.accounts.get(accountId);
  if (account) {
    account.status = 'disconnected';
  }
}

/**
 * Get account by ID
 */
export function getAccount(accountId: string): ResolvedPrismerIMAccount | undefined {
  return _state.accounts.get(accountId);
}

// ============================================================
// Message Sending (via SDK)
// ============================================================

/**
 * Send a message using SDK's IM API
 */
export async function sendMessage(
  accountId: string,
  options: {
    content: string;
    type?: 'text' | 'markdown' | 'code' | 'system_event';
    metadata?: Record<string, unknown>;
    targetUserId?: string;
  }
): Promise<SendMessageResponse> {
  const account = _state.accounts.get(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const client = _state.clients.get(accountId);
  if (!client) {
    throw new Error(`SDK client not initialized for: ${accountId}`);
  }

  const stats = _state.stats.get(accountId);

  _logger.debug(`Sending message via SDK`);

  try {
    let result;

    if (options.targetUserId) {
      // Direct message
      result = await client.im.direct.send(options.targetUserId, options.content, {
        type: options.type || 'text',
        metadata: options.metadata,
      });
    } else if (account.conversationId) {
      // Send to conversation
      result = await client.im.messages.send(account.conversationId, options.content, {
        type: options.type || 'text',
        metadata: options.metadata,
      });
    } else {
      throw new Error('No target or conversationId specified');
    }

    if (!result.ok) {
      throw new Error(result.error?.message || 'Failed to send message');
    }

    if (stats) stats.messagesSent++;
    account.lastHeartbeat = new Date();

    // Construct response in expected format
    const responseMsg: IMMessage = {
      id: (result.data as { id?: string })?.id || `msg-${Date.now()}`,
      conversationId: account.conversationId,
      senderId: 'self',
      content: options.content,
      type: options.type || 'text',
      createdAt: new Date().toISOString(),
    };

    return {
      conversationId: account.conversationId,
      message: responseMsg,
    };
  } catch (error) {
    _logger.error(`Failed to send message:`, error);
    throw error;
  }
}

/**
 * Send a UIDirective to Workspace
 */
export async function sendDirective(
  accountId: string,
  directive: UIDirective
): Promise<SendMessageResponse> {
  const stats = _state.stats.get(accountId);

  _logger.info(`Sending UIDirective: ${directive.type}`);

  const result = await sendMessage(accountId, {
    content: `[UI: ${directive.type}]`,
    type: 'system_event',
    metadata: {
      prismer: {
        type: 'ui_directive',
        directive: {
          ...directive,
          timestamp: directive.timestamp || Date.now(),
        },
      },
    },
  });

  if (stats) stats.directivesSent++;

  return result;
}

/**
 * Send a Skill Event to Workspace
 */
export async function sendSkillEvent(
  accountId: string,
  event: SkillEvent
): Promise<SendMessageResponse> {
  const stats = _state.stats.get(accountId);

  _logger.info(`Sending SkillEvent: ${event.skillName} (${event.phase})`);

  const result = await sendMessage(accountId, {
    content: event.message || `[Skill: ${event.skillName} - ${event.phase}]`,
    type: 'system_event',
    metadata: {
      prismer: {
        type: 'skill_event',
        skillEvent: event,
      },
    },
  });

  if (stats) stats.skillEventsSent++;

  return result;
}

// ============================================================
// Message Handling
// ============================================================

/**
 * Register a message handler for incoming messages
 */
export function onMessage(
  accountId: string,
  handler: (msg: IMMessage) => void
): () => void {
  _state.messageHandlers.set(accountId, handler);

  return () => {
    _state.messageHandlers.delete(accountId);
  };
}

// ============================================================
// Status
// ============================================================

/**
 * Get channel status snapshot
 */
export function getStatusSnapshot(accountId: string): ChannelStatusSnapshot | null {
  const account = _state.accounts.get(accountId);
  if (!account) return null;

  const ws = _state.wsConnections.get(accountId);
  const stats = _state.stats.get(accountId) || {
    messagesSent: 0,
    messagesReceived: 0,
    directivesSent: 0,
    skillEventsSent: 0,
  };

  return {
    accountId,
    status: account.status === 'connected' ? 'online' : 'offline',
    imServerConnected: account.status === 'connected',
    wsConnected: ws?.state === 'connected',
    lastHeartbeat: account.lastHeartbeat,
    error: account.lastError,
    stats,
  };
}

/**
 * Check if channel is ready
 */
export function isReady(accountId: string): boolean {
  const account = _state.accounts.get(accountId);
  const ws = _state.wsConnections.get(accountId);

  return (
    account?.status === 'connected' &&
    ws?.state === 'connected'
  );
}

// ============================================================
// Gateway Monitor (for autonomous message handling)
// ============================================================

interface MonitorOptions {
  accountId: string;
  config: ResolvedPrismerIMAccount;
  abortSignal?: AbortSignal;
  log?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
    debug?: (msg: string) => void;
  };
  setStatus?: (status: Partial<ChannelStatusSnapshot>) => void;
}

/**
 * Monitor Prismer IM channel for incoming messages
 */
export async function monitorPrismerIM(options: MonitorOptions): Promise<void> {
  const { accountId, config, abortSignal, log, setStatus } = options;

  log?.info?.(`Starting Prismer IM monitor for account: ${accountId} (SDK v1.7)`);

  // Initialize the account if not already connected
  let account = _state.accounts.get(accountId);
  if (!account || account.status !== 'connected') {
    account = await initializeAccount(accountId, config);
  }

  // Update status
  setStatus?.({
    status: account.status === 'connected' ? 'online' : 'offline',
    imServerConnected: account.status === 'connected',
  });

  // Register message handler for routing to agent
  const unsubscribe = onMessage(accountId, async (msg: IMMessage) => {
    log?.debug?.(`Received message: ${msg.id}`);

    try {
      await routeMessageToAgent(accountId, msg, log);
    } catch (error) {
      log?.error?.(`Failed to process message: ${error}`);
    }
  });

  // Wait for abort signal or connection close
  await new Promise<void>((resolve) => {
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        log?.info?.('Abort signal received, stopping monitor');
        resolve();
      }, { once: true });
    }

    // Monitor WebSocket state
    const ws = _state.wsConnections.get(accountId);
    if (ws) {
      const checkConnection = setInterval(() => {
        if (ws.state === 'disconnected') {
          clearInterval(checkConnection);
          log?.info?.('WebSocket disconnected, stopping monitor');
          resolve();
        }
      }, 5000);

      abortSignal?.addEventListener('abort', () => clearInterval(checkConnection));
    }
  });

  // Cleanup
  unsubscribe();
  setStatus?.({
    status: 'offline',
    imServerConnected: false,
  });

  log?.info?.(`Prismer IM monitor stopped for account: ${accountId}`);
}

/**
 * Route an incoming message to the OpenClaw agent
 */
async function routeMessageToAgent(
  accountId: string,
  msg: IMMessage,
  log?: MonitorOptions['log']
): Promise<void> {
  const account = _state.accounts.get(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  log?.debug?.(`Routing message to agent: ${msg.content?.substring(0, 50)}...`);

  // Skip messages from the agent itself (echo prevention)
  if (msg.sender?.id === account.conversationId) {
    log?.debug?.('Skipping self-message (echo prevention)');
    return;
  }

  // Skip system messages
  if (msg.type === 'system_event') {
    log?.debug?.('Skipping system message');
    return;
  }

  // Build the MsgContext for OpenClaw
  const msgContext = buildMsgContext(accountId, msg);

  // Get the OpenClaw dispatch function
  const dispatcher = getOpenClawDispatcher();

  if (dispatcher) {
    try {
      await dispatcher({
        ctx: msgContext,
        deliver: async (payload: { text?: string; mediaUrl?: string }) => {
          if (payload.text) {
            await sendMessage(accountId, {
              content: payload.text,
              type: 'text',
            });
            log?.info?.(`Sent reply: ${payload.text.substring(0, 50)}...`);
          }
        },
        onError: (err: unknown) => {
          log?.error?.(`Reply dispatch error: ${err}`);
        },
      });
    } catch (dispatchError) {
      log?.error?.(`Dispatch error: ${dispatchError}`);
    }
  } else {
    log?.debug?.('OpenClaw dispatcher not available - message will be processed via gateway');
  }
}

/**
 * Build MsgContext from IMMessage
 */
function buildMsgContext(accountId: string, msg: IMMessage): Record<string, unknown> {
  const account = _state.accounts.get(accountId);

  return {
    Body: msg.content,
    RawBody: msg.content,
    From: msg.sender?.id ?? 'unknown',
    To: account?.conversationId ?? accountId,
    SessionKey: `prismer-im:${accountId}:${msg.conversationId || msg.sender?.id}`,
    AccountId: accountId,
    MessageSid: msg.id,
    ChatType: 'direct',
    Provider: 'prismer-im',
    Surface: 'prismer-im',
    OriginatingChannel: 'prismer-im',
    SenderName: msg.sender?.displayName,
    SenderId: msg.sender?.id,
    Timestamp: msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now(),
  };
}
