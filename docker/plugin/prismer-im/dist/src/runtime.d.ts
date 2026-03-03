/**
 * Prismer IM Channel Plugin - Runtime (SDK v1.7)
 *
 * Refactored to use @prismer/sdk for IM operations.
 * Replaces custom WebSocket with SDK's realtime.connectWS().
 */
import type { PrismerIMAccountConfig, ResolvedPrismerIMAccount, IMMessage, SendMessageResponse, UIDirective, SkillEvent, ChannelStatusSnapshot } from './types.js';
interface PluginLogger {
    info: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
}
type OpenClawDispatchFn = (params: {
    ctx: Record<string, unknown>;
    deliver: (payload: {
        text?: string;
        mediaUrl?: string;
    }) => Promise<void>;
    onError: (err: unknown) => void;
}) => Promise<void>;
/**
 * Set the OpenClaw dispatch function
 */
export declare function setOpenClawDispatcher(dispatcher: OpenClawDispatchFn): void;
/**
 * Get the OpenClaw dispatch function
 */
export declare function getOpenClawDispatcher(): OpenClawDispatchFn | null;
/**
 * Set the OpenClaw logger instance
 */
export declare function setPrismerIMLogger(logger: PluginLogger): void;
/**
 * Get the logger instance
 */
export declare function getLogger(): PluginLogger;
export declare function setPrismerIMRuntime(_runtime: unknown): void;
export declare function getPrismerIMRuntime(): {
    log: PluginLogger;
};
/**
 * Initialize an account and establish connections using SDK
 */
export declare function initializeAccount(accountId: string, config: PrismerIMAccountConfig): Promise<ResolvedPrismerIMAccount>;
/**
 * Disconnect and cleanup an account
 */
export declare function disconnectAccount(accountId: string): Promise<void>;
/**
 * Get account by ID
 */
export declare function getAccount(accountId: string): ResolvedPrismerIMAccount | undefined;
/**
 * Send a message using SDK's IM API
 */
export declare function sendMessage(accountId: string, options: {
    content: string;
    type?: 'text' | 'markdown' | 'code' | 'system_event';
    metadata?: Record<string, unknown>;
    targetUserId?: string;
}): Promise<SendMessageResponse>;
/**
 * Send a UIDirective to Workspace
 */
export declare function sendDirective(accountId: string, directive: UIDirective): Promise<SendMessageResponse>;
/**
 * Send a Skill Event to Workspace
 */
export declare function sendSkillEvent(accountId: string, event: SkillEvent): Promise<SendMessageResponse>;
/**
 * Register a message handler for incoming messages
 */
export declare function onMessage(accountId: string, handler: (msg: IMMessage) => void): () => void;
/**
 * Get channel status snapshot
 */
export declare function getStatusSnapshot(accountId: string): ChannelStatusSnapshot | null;
/**
 * Check if channel is ready
 */
export declare function isReady(accountId: string): boolean;
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
export declare function monitorPrismerIM(options: MonitorOptions): Promise<void>;
export {};
//# sourceMappingURL=runtime.d.ts.map