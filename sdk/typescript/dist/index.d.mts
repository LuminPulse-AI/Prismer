/**
 * Prismer Cloud Real-Time Client — WebSocket & SSE transports.
 *
 * @example
 * ```typescript
 * const ws = client.im.connectWS({ token: jwtToken });
 * await ws.connect();
 *
 * ws.on('message.new', (msg) => console.log(msg.content));
 * ws.joinConversation('conv-123');
 * ws.sendMessage('conv-123', 'Hello!');
 *
 * // SSE (server-push only, auto-joins all conversations)
 * const sse = client.im.connectSSE({ token: jwtToken });
 * await sse.connect();
 * sse.on('message.new', (msg) => console.log(msg.content));
 * ```
 */
interface AuthenticatedPayload {
    userId: string;
    username: string;
}
interface MessageNewPayload {
    id: string;
    conversationId: string;
    content: string;
    type: string;
    senderId: string;
    routing?: {
        mode: string;
        targets: Array<{
            userId: string;
            username?: string;
        }>;
    };
    metadata?: Record<string, any>;
    createdAt: string;
}
interface TypingIndicatorPayload {
    conversationId: string;
    userId: string;
    isTyping: boolean;
}
interface PresenceChangedPayload {
    userId: string;
    status: string;
}
interface PongPayload {
    requestId: string;
}
interface ErrorPayload {
    message: string;
}
interface DisconnectedPayload {
    code: number;
    reason: string;
}
interface ReconnectingPayload {
    attempt: number;
    delayMs: number;
}
interface RealtimeEventMap {
    'authenticated': AuthenticatedPayload;
    'message.new': MessageNewPayload;
    'typing.indicator': TypingIndicatorPayload;
    'presence.changed': PresenceChangedPayload;
    'pong': PongPayload;
    'error': ErrorPayload;
    'connected': undefined;
    'disconnected': DisconnectedPayload;
    'reconnecting': ReconnectingPayload;
}
type RealtimeEventType = keyof RealtimeEventMap;
interface RealtimeCommand {
    type: string;
    payload: unknown;
    requestId?: string;
}
interface RealtimeConfig {
    /** JWT token for authentication */
    token: string;
    /** Auto-reconnect on disconnect (default: true) */
    autoReconnect?: boolean;
    /** Max reconnection attempts (default: 10, 0 = unlimited) */
    maxReconnectAttempts?: number;
    /** Base delay for exponential backoff in ms (default: 1000) */
    reconnectBaseDelay?: number;
    /** Max delay cap in ms (default: 30000) */
    reconnectMaxDelay?: number;
    /** Heartbeat interval in ms (default: 25000) */
    heartbeatInterval?: number;
    /** Custom WebSocket constructor (for Node <21 or test mocks) */
    WebSocket?: new (url: string) => WebSocket;
    /** Custom fetch implementation (for SSE streaming) */
    fetch?: typeof fetch;
}
type RealtimeState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type Listener<T> = (payload: T) => void;
declare class TypedEmitter {
    private listeners;
    on<E extends RealtimeEventType>(event: E, cb: Listener<RealtimeEventMap[E]>): this;
    off<E extends RealtimeEventType>(event: E, cb: Listener<RealtimeEventMap[E]>): this;
    once<E extends RealtimeEventType>(event: E, cb: Listener<RealtimeEventMap[E]>): this;
    protected emit<E extends RealtimeEventType>(event: E, payload: RealtimeEventMap[E]): void;
    protected removeAllListeners(): void;
}
declare class RealtimeWSClient extends TypedEmitter {
    private ws;
    private reconnector;
    private heartbeatTimer;
    private pongTimer;
    private reconnectTimer;
    private pendingPings;
    private _state;
    private intentionalClose;
    private readonly wsUrl;
    private readonly config;
    private readonly WS;
    private pingCounter;
    get state(): RealtimeState;
    constructor(baseUrl: string, config: RealtimeConfig);
    connect(): Promise<void>;
    disconnect(code?: number, reason?: string): void;
    joinConversation(conversationId: string): void;
    sendMessage(conversationId: string, content: string, type?: string): void;
    startTyping(conversationId: string): void;
    stopTyping(conversationId: string): void;
    updatePresence(status: string): void;
    send(command: RealtimeCommand): void;
    ping(): Promise<PongPayload>;
    private sendRaw;
    private handleMessage;
    private handleClose;
    private scheduleReconnect;
    private startHeartbeat;
    private stopHeartbeat;
    private clearReconnectTimer;
    private clearPendingPings;
}
declare class RealtimeSSEClient extends TypedEmitter {
    private abortController;
    private reconnector;
    private reconnectTimer;
    private heartbeatWatchdog;
    private lastDataTime;
    private _state;
    private intentionalClose;
    private readonly sseUrl;
    private readonly config;
    private readonly fetchFn;
    get state(): RealtimeState;
    constructor(baseUrl: string, config: RealtimeConfig);
    connect(): Promise<void>;
    disconnect(): void;
    private readStream;
    private scheduleReconnect;
    private startHeartbeatWatchdog;
    private stopHeartbeatWatchdog;
    private clearReconnectTimer;
}

/**
 * Prismer Cloud SDK — Type definitions
 */
type Environment = 'production';
declare const ENVIRONMENTS: Record<Environment, string>;
interface PrismerConfig {
    /** API Key (starts with sk-prismer-) or IM JWT token. Optional for anonymous IM registration. */
    apiKey?: string;
    /** Environment preset (default: 'production'). Sets the base URL automatically. */
    environment?: Environment;
    /** Base URL override. Takes priority over `environment` if both are set. */
    baseUrl?: string;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
    /** Custom fetch implementation */
    fetch?: typeof fetch;
    /** Default X-IM-Agent header for IM requests (select which agent identity to use) */
    imAgent?: string;
}
interface LoadOptions {
    inputType?: 'auto' | 'url' | 'urls' | 'query';
    processUncached?: boolean;
    search?: {
        topK?: number;
    };
    processing?: {
        strategy?: 'auto' | 'fast' | 'quality';
        maxConcurrent?: number;
    };
    return?: {
        format?: 'hqcc' | 'raw' | 'both';
        topK?: number;
    };
    ranking?: {
        preset?: 'cache_first' | 'relevance_first' | 'balanced';
        custom?: {
            cacheHit?: number;
            relevance?: number;
            freshness?: number;
            quality?: number;
        };
    };
}
interface RankingFactors {
    cache: number;
    relevance: number;
    freshness: number;
    quality: number;
}
interface LoadResultItem {
    rank?: number;
    url: string;
    title?: string;
    hqcc?: string | null;
    raw?: string;
    cached: boolean;
    cachedAt?: string;
    processed?: boolean;
    found?: boolean;
    error?: string;
    ranking?: {
        score: number;
        factors: RankingFactors;
    };
    meta?: Record<string, any>;
}
interface SingleUrlCost {
    credits: number;
    cached: boolean;
}
interface BatchUrlCost {
    credits: number;
    cached: number;
}
interface QueryCost {
    searchCredits: number;
    compressionCredits: number;
    totalCredits: number;
    savedByCache: number;
}
interface BatchSummary {
    total: number;
    found: number;
    notFound: number;
    cached: number;
    processed: number;
}
interface QuerySummary {
    query: string;
    searched: number;
    cacheHits: number;
    compressed: number;
    returned: number;
}
interface LoadResult {
    success: boolean;
    requestId?: string;
    mode?: 'single_url' | 'batch_urls' | 'query';
    result?: LoadResultItem;
    results?: LoadResultItem[];
    summary?: BatchSummary | QuerySummary;
    cost?: SingleUrlCost | BatchUrlCost | QueryCost;
    processingTime?: number;
    error?: {
        code: string;
        message: string;
    };
}
interface SaveOptions {
    url: string;
    hqcc: string;
    raw?: string;
    meta?: Record<string, any>;
}
interface SaveBatchOptions {
    items: SaveOptions[];
}
interface SaveResult {
    success: boolean;
    status?: string;
    url?: string;
    results?: Array<{
        url: string;
        status: string;
    }>;
    summary?: {
        total: number;
        created: number;
        exists: number;
    };
    error?: {
        code: string;
        message: string;
    };
}
interface ParseOptions {
    url?: string;
    base64?: string;
    filename?: string;
    mode?: 'fast' | 'hires' | 'auto';
    output?: 'markdown' | 'json';
    image_mode?: 'embedded' | 's3';
    wait?: boolean;
}
interface ParseDocumentImage {
    page: number;
    url: string;
    caption?: string;
}
interface ParseDocument {
    markdown?: string;
    text?: string;
    pageCount: number;
    metadata?: {
        title?: string;
        author?: string;
        [key: string]: any;
    };
    images?: ParseDocumentImage[];
    estimatedTime?: number;
}
interface ParseUsage {
    inputPages: number;
    inputImages: number;
    outputChars: number;
    outputTokens: number;
}
interface ParseCostBreakdown {
    pages: number;
    images: number;
}
interface ParseCost {
    credits: number;
    breakdown?: ParseCostBreakdown;
}
interface ParseResult {
    success: boolean;
    requestId?: string;
    mode?: string;
    async?: boolean;
    document?: ParseDocument;
    usage?: ParseUsage;
    cost?: ParseCost;
    taskId?: string;
    status?: string;
    endpoints?: {
        status: string;
        result: string;
        stream: string;
    };
    processingTime?: number;
    error?: {
        code: string;
        message: string;
    };
}
interface IMRegisterOptions {
    type: 'agent' | 'human';
    username: string;
    displayName: string;
    agentType?: 'assistant' | 'specialist' | 'orchestrator' | 'tool' | 'bot';
    capabilities?: string[];
    description?: string;
    endpoint?: string;
}
interface IMRegisterData {
    imUserId: string;
    username: string;
    displayName: string;
    role: string;
    token: string;
    expiresIn: string;
    capabilities?: string[];
    isNew: boolean;
}
interface IMUser {
    id: string;
    username: string;
    displayName: string;
    role: string;
    agentType?: string;
}
interface IMAgentCard {
    agentType: string;
    capabilities: string[];
    description?: string;
    status: string;
}
interface IMMeData {
    user: IMUser;
    agentCard?: IMAgentCard;
    stats: {
        conversationCount: number;
        directCount?: number;
        groupCount?: number;
        contactCount: number;
        messagesSent: number;
        unreadCount: number;
    };
    bindings: Array<{
        platform: string;
        status: string;
        externalName?: string;
    }>;
    credits: {
        balance: number;
        totalSpent: number;
    };
}
interface IMTokenData {
    token: string;
    expiresIn: string;
}
interface IMMessage {
    id: string;
    conversationId?: string;
    content: string;
    type: string;
    senderId: string;
    parentId?: string | null;
    status?: string;
    createdAt: string;
    updatedAt?: string;
    metadata?: Record<string, any> | string;
}
interface IMRouting {
    mode: string;
    targets: Array<{
        userId: string;
        username?: string;
    }>;
}
interface IMMessageData {
    conversationId: string;
    message: IMMessage;
    routing?: IMRouting;
}
interface IMGroupMember {
    userId: string;
    username: string;
    displayName?: string;
    role: string;
}
interface IMGroupData {
    groupId: string;
    title: string;
    description?: string;
    members: IMGroupMember[];
}
interface IMContact {
    username: string;
    displayName: string;
    role: string;
    lastMessageAt?: string;
    unreadCount: number;
    conversationId: string;
}
interface IMDiscoverAgent {
    username: string;
    displayName: string;
    agentType?: string;
    capabilities?: string[];
    status: string;
}
interface IMBindingData {
    bindingId: string;
    platform: string;
    status: string;
    verificationCode: string;
}
interface IMBinding {
    bindingId: string;
    platform: string;
    status: string;
    externalName?: string;
}
interface IMCreditsData {
    balance: number;
    totalEarned: number;
    totalSpent: number;
}
interface IMTransaction {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string;
    createdAt: string;
}
interface IMConversation {
    id: string;
    type: string;
    title?: string;
    lastMessage?: IMMessage;
    unreadCount?: number;
    members?: IMGroupMember[];
    createdAt: string;
    updatedAt?: string;
}
interface IMWorkspaceData {
    workspaceId?: string;
    conversationId: string;
    user?: {
        imUserId: string;
        token: string;
    };
    agent?: any;
}
interface IMWorkspaceInitOptions {
    workspaceId: string;
    userId: string;
    userDisplayName: string;
}
interface IMWorkspaceInitGroupOptions {
    workspaceId: string;
    title: string;
    users: Array<{
        userId: string;
        displayName: string;
    }>;
}
interface IMAutocompleteResult {
    userId: string;
    username: string;
    displayName: string;
    role: string;
}
interface IMCreateGroupOptions {
    title: string;
    description?: string;
    members?: string[];
    metadata?: Record<string, any>;
}
interface IMCreateBindingOptions {
    platform: 'telegram' | 'discord' | 'slack' | 'wechat' | 'x' | 'line';
    botToken: string;
    chatId?: string;
    channelId?: string;
}
interface IMSendOptions {
    type?: 'text' | 'markdown' | 'code' | 'image' | 'file' | 'tool_call' | 'tool_result' | 'system_event' | 'thinking';
    metadata?: Record<string, any>;
    parentId?: string;
}
interface IMPaginationOptions {
    limit?: number;
    offset?: number;
}
interface IMConversationsOptions {
    withUnread?: boolean;
    unreadOnly?: boolean;
}
interface IMDiscoverOptions {
    type?: string;
    capability?: string;
}
/** Generic IM API response wrapper */
interface IMResult<T = any> {
    ok: boolean;
    data?: T;
    meta?: {
        total?: number;
        pageSize?: number;
    };
    error?: {
        code: string;
        message: string;
    };
}
/** Internal request function type */
type RequestFn = <T>(method: string, path: string, body?: unknown, query?: Record<string, string>) => Promise<T>;

/**
 * Prismer Cloud SDK for TypeScript/JavaScript
 *
 * @example
 * ```typescript
 * import { PrismerClient } from '@prismer/sdk';
 *
 * const client = new PrismerClient({ apiKey: 'sk-prismer-...' });
 *
 * // Context API
 * const result = await client.load('https://example.com');
 *
 * // Parse API
 * const pdf = await client.parsePdf('https://arxiv.org/pdf/2401.00001.pdf');
 *
 * // IM API (sub-module pattern)
 * const reg = await client.im.account.register({ type: 'agent', username: 'my-agent', displayName: 'My Agent' });
 * await client.im.direct.send('user-123', 'Hello!');
 * const groups = await client.im.groups.list();
 * const convos = await client.im.conversations.list();
 * ```
 */

/** Account management: register, identity, token refresh */
declare class AccountClient {
    private _r;
    constructor(_r: RequestFn);
    /** Register an agent or human identity */
    register(options: IMRegisterOptions): Promise<IMResult<IMRegisterData>>;
    /** Get own identity, stats, bindings, credits */
    me(): Promise<IMResult<IMMeData>>;
    /** Refresh JWT token */
    refreshToken(): Promise<IMResult<IMTokenData>>;
}
/** Direct messaging between two users */
declare class DirectClient {
    private _r;
    constructor(_r: RequestFn);
    /** Send a direct message to a user */
    send(userId: string, content: string, options?: IMSendOptions): Promise<IMResult<IMMessageData>>;
    /** Get direct message history with a user */
    getMessages(userId: string, options?: IMPaginationOptions): Promise<IMResult<IMMessage[]>>;
}
/** Group chat management and messaging */
declare class GroupsClient {
    private _r;
    constructor(_r: RequestFn);
    /** Create a group chat */
    create(options: IMCreateGroupOptions): Promise<IMResult<IMGroupData>>;
    /** List groups you belong to */
    list(): Promise<IMResult<IMGroupData[]>>;
    /** Get group details */
    get(groupId: string): Promise<IMResult<IMGroupData>>;
    /** Send a message to a group */
    send(groupId: string, content: string, options?: IMSendOptions): Promise<IMResult<IMMessageData>>;
    /** Get group message history */
    getMessages(groupId: string, options?: IMPaginationOptions): Promise<IMResult<IMMessage[]>>;
    /** Add a member to a group (owner/admin only) */
    addMember(groupId: string, userId: string): Promise<IMResult<void>>;
    /** Remove a member from a group (owner/admin only) */
    removeMember(groupId: string, userId: string): Promise<IMResult<void>>;
}
/** Conversation management */
declare class ConversationsClient {
    private _r;
    constructor(_r: RequestFn);
    /** List conversations */
    list(options?: IMConversationsOptions): Promise<IMResult<IMConversation[]>>;
    /** Get conversation details */
    get(conversationId: string): Promise<IMResult<IMConversation>>;
    /** Create a direct conversation */
    createDirect(userId: string): Promise<IMResult<IMConversation>>;
    /** Mark a conversation as read */
    markAsRead(conversationId: string): Promise<IMResult<void>>;
}
/** Low-level message operations (by conversation ID) */
declare class MessagesClient {
    private _r;
    constructor(_r: RequestFn);
    /** Send a message to a conversation */
    send(conversationId: string, content: string, options?: IMSendOptions): Promise<IMResult<IMMessageData>>;
    /** Get message history for a conversation */
    getHistory(conversationId: string, options?: IMPaginationOptions): Promise<IMResult<IMMessage[]>>;
    /** Edit a message */
    edit(conversationId: string, messageId: string, content: string): Promise<IMResult<void>>;
    /** Delete a message */
    delete(conversationId: string, messageId: string): Promise<IMResult<void>>;
}
/** Contacts and agent discovery */
declare class ContactsClient {
    private _r;
    constructor(_r: RequestFn);
    /** List contacts (users you've communicated with) */
    list(): Promise<IMResult<IMContact[]>>;
    /** Discover agents by capability or type */
    discover(options?: IMDiscoverOptions): Promise<IMResult<IMDiscoverAgent[]>>;
}
/** Social bindings (Telegram, Discord, Slack, etc.) */
declare class BindingsClient {
    private _r;
    constructor(_r: RequestFn);
    /** Create a social binding */
    create(options: IMCreateBindingOptions): Promise<IMResult<IMBindingData>>;
    /** Verify a binding with 6-digit code */
    verify(bindingId: string, code: string): Promise<IMResult<void>>;
    /** List bindings */
    list(): Promise<IMResult<IMBinding[]>>;
    /** Delete a binding */
    delete(bindingId: string): Promise<IMResult<void>>;
}
/** Credits balance and transaction history */
declare class CreditsClient {
    private _r;
    constructor(_r: RequestFn);
    /** Get credits balance */
    get(): Promise<IMResult<IMCreditsData>>;
    /** Get credit transaction history */
    transactions(options?: IMPaginationOptions): Promise<IMResult<IMTransaction[]>>;
}
/** Workspace management (advanced collaborative environments) */
declare class WorkspaceClient {
    private _r;
    constructor(_r: RequestFn);
    /** Initialize a 1:1 workspace (1 user + 1 agent) */
    init(options: IMWorkspaceInitOptions): Promise<IMResult<IMWorkspaceData>>;
    /** Initialize a group workspace (multi-user + multi-agent) */
    initGroup(options: IMWorkspaceInitGroupOptions): Promise<IMResult<IMWorkspaceData>>;
    /** Add an agent to a workspace */
    addAgent(workspaceId: string, agentId: string): Promise<IMResult<void>>;
    /** List agents in a workspace */
    listAgents(workspaceId: string): Promise<IMResult<any[]>>;
    /** @mention autocomplete */
    mentionAutocomplete(conversationId: string, query?: string): Promise<IMResult<IMAutocompleteResult[]>>;
}
/** Real-time connection factory (WebSocket & SSE) */
declare class IMRealtimeClient {
    private _wsBase;
    constructor(_wsBase: string);
    /** Get the WebSocket URL */
    wsUrl(token?: string): string;
    /** Get the SSE URL */
    sseUrl(token?: string): string;
    /** Create a WebSocket client. Call .connect() to establish connection. */
    connectWS(config: RealtimeConfig): RealtimeWSClient;
    /** Create an SSE client. Call .connect() to establish connection. */
    connectSSE(config: RealtimeConfig): RealtimeSSEClient;
}
declare class IMClient {
    readonly account: AccountClient;
    readonly direct: DirectClient;
    readonly groups: GroupsClient;
    readonly conversations: ConversationsClient;
    readonly messages: MessagesClient;
    readonly contacts: ContactsClient;
    readonly bindings: BindingsClient;
    readonly credits: CreditsClient;
    readonly workspace: WorkspaceClient;
    readonly realtime: IMRealtimeClient;
    constructor(request: RequestFn, wsBase: string);
    /** IM health check */
    health(): Promise<IMResult<void>>;
}
declare class PrismerClient {
    private apiKey;
    private readonly baseUrl;
    private readonly timeout;
    private readonly fetchFn;
    private readonly imAgent?;
    /** IM API sub-client */
    readonly im: IMClient;
    constructor(config?: PrismerConfig);
    /**
     * Set or update the auth token (API key or IM JWT).
     * Useful after anonymous registration to set the returned JWT.
     */
    setToken(token: string): void;
    private _request;
    /** Load content from URL(s) or search query */
    load(input: string | string[], options?: LoadOptions): Promise<LoadResult>;
    /** Save content to Prismer cache */
    save(options: SaveOptions | SaveBatchOptions): Promise<SaveResult>;
    /** Batch save multiple items (max 50) */
    saveBatch(items: SaveOptions[]): Promise<SaveResult>;
    /** Parse a document (PDF, image) into structured content */
    parse(options: ParseOptions): Promise<ParseResult>;
    /** Convenience: parse a PDF by URL */
    parsePdf(url: string, mode?: 'fast' | 'hires' | 'auto'): Promise<ParseResult>;
    /** Check status of an async parse task */
    parseStatus(taskId: string): Promise<ParseResult>;
    /** Get result of a completed async parse task */
    parseResult(taskId: string): Promise<ParseResult>;
    /** Search for content (convenience wrapper around load with query mode) */
    search(query: string, options?: {
        topK?: number;
        returnTopK?: number;
        format?: 'hqcc' | 'raw' | 'both';
        ranking?: 'cache_first' | 'relevance_first' | 'balanced';
    }): Promise<LoadResult>;
}

declare function createClient(config: PrismerConfig): PrismerClient;

export { AccountClient, type AuthenticatedPayload, type BatchSummary, type BatchUrlCost, BindingsClient, ContactsClient, ConversationsClient, CreditsClient, DirectClient, type DisconnectedPayload, ENVIRONMENTS, type Environment, type ErrorPayload, GroupsClient, type IMAgentCard, type IMAutocompleteResult, type IMBinding, type IMBindingData, IMClient, type IMContact, type IMConversation, type IMConversationsOptions, type IMCreateBindingOptions, type IMCreateGroupOptions, type IMCreditsData, type IMDiscoverAgent, type IMDiscoverOptions, type IMGroupData, type IMGroupMember, type IMMeData, type IMMessage, type IMMessageData, type IMPaginationOptions, IMRealtimeClient, type IMRegisterData, type IMRegisterOptions, type IMResult, type IMRouting, type IMSendOptions, type IMTokenData, type IMTransaction, type IMUser, type IMWorkspaceData, type IMWorkspaceInitGroupOptions, type IMWorkspaceInitOptions, type LoadOptions, type LoadResult, type LoadResultItem, type MessageNewPayload, MessagesClient, type ParseCost, type ParseCostBreakdown, type ParseDocument, type ParseDocumentImage, type ParseOptions, type ParseResult, type ParseUsage, type PongPayload, type PresenceChangedPayload, PrismerClient, type PrismerConfig, type QueryCost, type QuerySummary, type RankingFactors, type RealtimeCommand, type RealtimeConfig, type RealtimeEventMap, type RealtimeEventType, RealtimeSSEClient, type RealtimeState, RealtimeWSClient, type ReconnectingPayload, type RequestFn, type SaveBatchOptions, type SaveOptions, type SaveResult, type SingleUrlCost, type TypingIndicatorPayload, WorkspaceClient, createClient, PrismerClient as default };
