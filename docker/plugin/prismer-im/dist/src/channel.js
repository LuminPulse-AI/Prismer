/**
 * Prismer IM Channel Plugin - Channel Implementation
 *
 * @description
 * Implements the OpenClaw ChannelPlugin interface for Prismer.AI IM Server.
 * Handles Chat messages, UIDirectives, and Skill Events through a single channel.
 */
import { initializeAccount, disconnectAccount, getAccount, sendMessage, sendDirective, sendSkillEvent, onMessage, getStatusSnapshot, isReady, getPrismerIMRuntime, monitorPrismerIM, } from './runtime';
// ============================================================
// Channel Plugin Implementation
// ============================================================
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
export const prismerIMPlugin = {
    id: 'prismer-im',
    meta: {
        id: 'prismer-im',
        label: 'Prismer IM',
        selectionLabel: 'Prismer IM (Workspace)',
        docsPath: '/channels/prismer-im',
        blurb: 'Connect to Prismer.AI Workspace via IM Server',
        aliases: ['prismer', 'workspace'],
    },
    capabilities: {
        chatTypes: ['direct', 'group'],
        polls: false,
        reactions: false,
        media: true,
        threads: true,
        reply: true,
        unsend: false,
        edit: true,
        effects: false,
        groupManagement: false,
    },
    // ─── Config Adapter ───────────────────────────────────────
    config: {
        /**
         * List all configured account IDs
         */
        listAccountIds: (cfg) => {
            const config = cfg;
            return Object.keys(config.channels?.['prismer-im']?.accounts ?? {});
        },
        /**
         * Resolve account configuration
         */
        resolveAccount: (cfg, accountId) => {
            const config = cfg;
            const accounts = config.channels?.['prismer-im']?.accounts ?? {};
            const id = accountId ?? 'default';
            const accountConfig = accounts[id];
            if (!accountConfig) {
                // Return a disconnected placeholder
                return {
                    accountId: id,
                    imServerUrl: '',
                    conversationId: '',
                    agentToken: '',
                    enabled: false,
                    status: 'disconnected',
                };
            }
            // Check if already initialized in runtime
            const existing = getAccount(id);
            if (existing) {
                return existing;
            }
            // Initialize new account
            return {
                ...accountConfig,
                accountId: id,
                enabled: true,
                status: 'disconnected',
            };
        },
        /**
         * Enable or disable an account
         */
        setAccountEnabled: async (accountId, enabled) => {
            const runtime = getPrismerIMRuntime();
            if (enabled) {
                const account = getAccount(accountId);
                if (account && account.status === 'disconnected') {
                    runtime.log.info(`[prismer-im] Enabling account: ${accountId}`);
                    await initializeAccount(accountId, account);
                }
            }
            else {
                runtime.log.info(`[prismer-im] Disabling account: ${accountId}`);
                await disconnectAccount(accountId);
            }
        },
        /**
         * Delete an account
         */
        deleteAccount: async (accountId) => {
            const runtime = getPrismerIMRuntime();
            runtime.log.info(`[prismer-im] Deleting account: ${accountId}`);
            await disconnectAccount(accountId);
            // Note: Actual config deletion should be handled by OpenClaw config system
        },
        /**
         * Check if account is enabled
         */
        isEnabled: (account) => {
            return account.enabled !== false;
        },
        /**
         * Check if account is configured (has required credentials)
         */
        isConfigured: async (account) => {
            return Boolean(account.imServerUrl?.trim() &&
                account.agentToken?.trim() &&
                account.conversationId?.trim());
        },
        /**
         * Get reason for disabled state
         */
        disabledReason: () => 'disabled',
        /**
         * Get reason for unconfigured state
         */
        unconfiguredReason: () => 'not configured (missing imServerUrl, agentToken, or conversationId)',
    },
    // ─── Outbound Adapter ─────────────────────────────────────
    outbound: {
        deliveryMode: 'direct',
        /**
         * Send a text message
         */
        sendText: async (ctx) => {
            const runtime = getPrismerIMRuntime();
            const account = ctx.account;
            try {
                runtime.log.debug(`[prismer-im] Sending text to ${ctx.target}`);
                // Chunk long messages (4000 chars like WhatsApp)
                const chunks = chunkText(ctx.text, 4000);
                for (const chunk of chunks) {
                    await sendMessage(account.accountId, {
                        content: chunk,
                        type: 'text',
                        targetUserId: ctx.target,
                    });
                }
                return { ok: true };
            }
            catch (error) {
                runtime.log.error(`[prismer-im] Failed to send text:`, error);
                return {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        },
    },
    // ─── Heartbeat ────────────────────────────────────────────
    heartbeat: {
        /**
         * Check if channel is ready
         */
        ready: () => {
            const accountIds = prismerIMPlugin.config.listAccountIds({});
            return accountIds.some((id) => isReady(id));
        },
        /**
         * Get status snapshot
         */
        snapshot: () => {
            const accountIds = prismerIMPlugin.config.listAccountIds({});
            if (accountIds.length === 0)
                return null;
            return getStatusSnapshot(accountIds[0]);
        },
    },
    // ─── Gateway Lifecycle ──────────────────────────────────────
    gateway: {
        /**
         * Start monitoring for incoming messages (called by OpenClaw)
         *
         * This is the key function that enables autonomous message handling.
         * OpenClaw calls this when starting the channel, and it runs until
         * the abortSignal is triggered.
         */
        startAccount: async (ctx) => {
            const account = ctx.account;
            ctx.log?.info?.(`[${account.accountId}] starting Prismer IM provider`);
            // Start the monitoring loop
            return monitorPrismerIM({
                accountId: account.accountId,
                config: account,
                abortSignal: ctx.abortSignal,
                log: ctx.log,
                setStatus: (status) => ctx.setStatus({ accountId: account.accountId, ...status }),
            });
        },
        /**
         * Stop the channel (optional - cleanup is handled by abortSignal)
         */
        stopAccount: async (ctx) => {
            const account = ctx.account;
            ctx.log?.info?.(`[${account.accountId}] stopping Prismer IM provider`);
            await disconnectAccount(account.accountId);
        },
    },
    // ─── Prismer Extensions ───────────────────────────────────
    prismer: {
        /**
         * Send a UIDirective to Workspace
         *
         * @example
         * ```typescript
         * await prismerIMPlugin.prismer.sendDirective('default', {
         *   type: 'SWITCH_COMPONENT',
         *   payload: { component: 'jupyter-notebook' }
         * });
         * ```
         */
        sendDirective,
        /**
         * Send a Skill Event to Workspace
         *
         * @example
         * ```typescript
         * await prismerIMPlugin.prismer.sendSkillEvent('default', {
         *   skillName: 'latex_compile',
         *   phase: 'complete',
         *   artifacts: [{ type: 'pdf', path: '/output/paper.pdf' }]
         * });
         * ```
         */
        sendSkillEvent,
    },
};
// ============================================================
// Utilities
// ============================================================
/**
 * Chunk text into smaller pieces
 */
function chunkText(text, maxLength) {
    if (text.length <= maxLength) {
        return [text];
    }
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        // Try to break at newline
        let breakPoint = remaining.lastIndexOf('\n', maxLength);
        if (breakPoint === -1 || breakPoint < maxLength / 2) {
            // Try to break at space
            breakPoint = remaining.lastIndexOf(' ', maxLength);
        }
        if (breakPoint === -1 || breakPoint < maxLength / 2) {
            // Force break at maxLength
            breakPoint = maxLength;
        }
        chunks.push(remaining.slice(0, breakPoint));
        remaining = remaining.slice(breakPoint).trimStart();
    }
    return chunks;
}
// ============================================================
// Message Handler Registration
// ============================================================
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
export function registerMessageHandler(accountId, handler) {
    return onMessage(accountId, handler);
}
/**
 * Initialize channel on startup
 */
export async function initializeChannel(accountId, config) {
    return initializeAccount(accountId, config);
}
