/**
 * Prismer IM Channel Plugin - Channel Implementation
 *
 * @description
 * Implements the OpenClaw ChannelPlugin interface for Prismer.AI IM Server.
 * Handles Chat messages, UIDirectives, and Skill Events through a single channel.
 */
import type { PrismerIMAccountConfig, ResolvedPrismerIMAccount, IMMessage, ChannelStatusSnapshot } from './types';
import { sendDirective, sendSkillEvent } from './runtime';
interface ChannelMeta {
    id: string;
    label: string;
    selectionLabel: string;
    docsPath: string;
    blurb: string;
    aliases: string[];
}
interface ChannelCapabilities {
    chatTypes: ('direct' | 'group')[];
    polls: boolean;
    reactions: boolean;
    media: boolean;
    threads: boolean;
    reply: boolean;
    unsend: boolean;
    edit: boolean;
    effects: boolean;
    groupManagement: boolean;
}
interface SendContext {
    account: unknown;
    target: string;
    text: string;
    replyToId?: string;
}
interface SendResult {
    ok: boolean;
    messageId?: string;
    error?: string;
}
interface GatewayStartContext {
    cfg: unknown;
    accountId: string;
    account: unknown;
    runtime: unknown;
    abortSignal?: AbortSignal;
    log?: {
        info?: (msg: string) => void;
        warn?: (msg: string) => void;
        error?: (msg: string) => void;
        debug?: (msg: string) => void;
    };
    getStatus: () => unknown;
    setStatus: (status: unknown) => void;
}
interface ChannelGateway {
    startAccount: (ctx: GatewayStartContext) => Promise<void>;
    stopAccount?: (ctx: GatewayStartContext) => Promise<void>;
}
interface ChannelPlugin<TAccount> {
    id: string;
    meta: ChannelMeta;
    capabilities: ChannelCapabilities;
    config: {
        listAccountIds: (cfg: unknown) => string[];
        resolveAccount: (cfg: unknown, accountId?: string) => TAccount;
        setAccountEnabled: (accountId: string, enabled: boolean) => Promise<void>;
        deleteAccount: (accountId: string) => Promise<void>;
        isEnabled?: (account: TAccount, cfg?: unknown) => boolean;
        isConfigured?: (account: TAccount, cfg?: unknown) => Promise<boolean> | boolean;
        disabledReason?: (account?: TAccount, cfg?: unknown) => string;
        unconfiguredReason?: (account?: TAccount, cfg?: unknown) => string;
    };
    outbound: {
        deliveryMode: 'direct' | 'queued';
        sendText: (ctx: SendContext) => Promise<SendResult>;
    };
    heartbeat: {
        ready: () => boolean;
        snapshot: () => ChannelStatusSnapshot | null;
    };
    gateway?: ChannelGateway;
    prismer?: {
        sendDirective: typeof sendDirective;
        sendSkillEvent: typeof sendSkillEvent;
    };
}
/**
 * Prismer IM Channel Plugin
 *
 * @description
 * Implements OpenClaw ChannelPlugin for Prismer.AI Workspace communication.
 *
 * Features:
 * - Chat message send/receive (text, markdown, code)
 * - UIDirective sending (control Workspace components)
 * - Skill Event reporting (progress, artifacts)
 * - WebSocket real-time connection
 * - @mention routing support
 */
export declare const prismerIMPlugin: ChannelPlugin<ResolvedPrismerIMAccount>;
/**
 * Register handler for incoming messages
 *
 * @description
 * Allows OpenClaw agent to receive messages from IM Server.
 * The handler will be called for each new message.
 *
 * @example
 * ```typescript
 * registerMessageHandler('default', (msg) => {
 *   console.log('Received:', msg.content);
 *   // Route to agent for processing
 * });
 * ```
 */
export declare function registerMessageHandler(accountId: string, handler: (msg: IMMessage) => void): () => void;
/**
 * Initialize channel on startup
 */
export declare function initializeChannel(accountId: string, config: PrismerIMAccountConfig): Promise<ResolvedPrismerIMAccount>;
export {};
//# sourceMappingURL=channel.d.ts.map