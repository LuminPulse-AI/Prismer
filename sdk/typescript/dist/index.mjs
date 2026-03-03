// src/realtime.ts
var TypedEmitter = class {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, /* @__PURE__ */ new Set());
    this.listeners.get(event).add(cb);
    return this;
  }
  off(event, cb) {
    this.listeners.get(event)?.delete(cb);
    return this;
  }
  once(event, cb) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      cb(payload);
    };
    return this.on(event, wrapper);
  }
  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(payload);
        } catch (_) {
        }
      }
    }
  }
  removeAllListeners() {
    this.listeners.clear();
  }
};
var Reconnector = class {
  constructor(config) {
    this.attempt = 0;
    this.connectedAt = 0;
    this.baseDelay = config.reconnectBaseDelay ?? 1e3;
    this.maxDelay = config.reconnectMaxDelay ?? 3e4;
    this.maxAttempts = config.maxReconnectAttempts ?? 10;
  }
  get shouldReconnect() {
    return this.maxAttempts === 0 || this.attempt < this.maxAttempts;
  }
  get currentAttempt() {
    return this.attempt;
  }
  markConnected() {
    this.connectedAt = Date.now();
  }
  nextDelay() {
    if (this.connectedAt > 0 && Date.now() - this.connectedAt > 6e4) {
      this.attempt = 0;
    }
    const jitter = Math.random() * this.baseDelay * 0.5;
    const delay = Math.min(this.baseDelay * Math.pow(2, this.attempt) + jitter, this.maxDelay);
    this.attempt++;
    return delay;
  }
  reset() {
    this.attempt = 0;
    this.connectedAt = 0;
  }
};
var RealtimeWSClient = class extends TypedEmitter {
  constructor(baseUrl, config) {
    super();
    this.ws = null;
    this.heartbeatTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
    this.pendingPings = /* @__PURE__ */ new Map();
    this._state = "disconnected";
    this.intentionalClose = false;
    this.pingCounter = 0;
    this.handleMessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
        const { type, payload } = msg;
        if (type === "pong" && payload?.requestId) {
          const pending = this.pendingPings.get(payload.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            pending.resolve(payload);
            this.pendingPings.delete(payload.requestId);
          }
        }
        this.emit(type, payload);
      } catch (_) {
      }
    };
    this.handleClose = (ev) => {
      this.stopHeartbeat();
      this.clearPendingPings();
      this.ws = null;
      if (this.intentionalClose) return;
      this._state = "disconnected";
      this.emit("disconnected", { code: ev.code, reason: ev.reason });
      if (this.config.autoReconnect && this.reconnector.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
    const base = baseUrl.replace(/^http/, "ws");
    this.wsUrl = `${base}/ws?token=${config.token}`;
    this.config = {
      autoReconnect: true,
      heartbeatInterval: 25e3,
      ...config
    };
    this.reconnector = new Reconnector(config);
    this.WS = config.WebSocket || WebSocket;
  }
  get state() {
    return this._state;
  }
  async connect() {
    if (this._state === "connected" || this._state === "connecting") return;
    this._state = "connecting";
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new this.WS(this.wsUrl);
      } catch (err) {
        this._state = "disconnected";
        reject(err);
        return;
      }
      const onOpen = () => {
        cleanup();
      };
      const onFirstMessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
          if (msg.type === "authenticated") {
            this._state = "connected";
            this.reconnector.markConnected();
            this.startHeartbeat();
            this.emit("authenticated", msg.payload);
            this.emit("connected", void 0);
            this.ws.removeEventListener("message", onFirstMessage);
            this.ws.addEventListener("message", this.handleMessage);
            resolve();
          }
        } catch (_) {
        }
      };
      const onError = (ev) => {
        cleanup();
        if (this._state === "connecting") {
          this._state = "disconnected";
          reject(new Error("WebSocket connection failed"));
        }
      };
      const onClose = (ev) => {
        cleanup();
        if (this._state === "connecting") {
          this._state = "disconnected";
          reject(new Error(`WebSocket closed during connect: ${ev.code} ${ev.reason}`));
        }
      };
      const cleanup = () => {
        this.ws?.removeEventListener("error", onError);
        this.ws?.removeEventListener("close", onClose);
      };
      this.ws.addEventListener("open", onOpen);
      this.ws.addEventListener("message", onFirstMessage);
      this.ws.addEventListener("error", onError);
      this.ws.addEventListener("close", onClose);
      this.ws.addEventListener("close", this.handleClose);
    });
  }
  disconnect(code = 1e3, reason = "client disconnect") {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.clearPendingPings();
    if (this.ws) {
      this.ws.removeEventListener("message", this.handleMessage);
      this.ws.removeEventListener("close", this.handleClose);
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(code, reason);
      }
      this.ws = null;
    }
    this._state = "disconnected";
    this.emit("disconnected", { code, reason });
  }
  // --- Commands ---
  joinConversation(conversationId) {
    this.sendRaw({ type: "conversation.join", payload: { conversationId } });
  }
  sendMessage(conversationId, content, type = "text") {
    this.sendRaw({
      type: "message.send",
      payload: { conversationId, content, type },
      requestId: `msg-${++this.pingCounter}`
    });
  }
  startTyping(conversationId) {
    this.sendRaw({ type: "typing.start", payload: { conversationId } });
  }
  stopTyping(conversationId) {
    this.sendRaw({ type: "typing.stop", payload: { conversationId } });
  }
  updatePresence(status) {
    this.sendRaw({ type: "presence.update", payload: { status } });
  }
  send(command) {
    this.sendRaw(command);
  }
  ping() {
    const requestId = `ping-${++this.pingCounter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingPings.delete(requestId);
        reject(new Error("Ping timeout"));
      }, 1e4);
      this.pendingPings.set(requestId, { resolve, timer });
      this.sendRaw({ type: "ping", payload: { requestId } });
    });
  }
  // --- Internal ---
  sendRaw(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  scheduleReconnect() {
    const delay = this.reconnector.nextDelay();
    this._state = "reconnecting";
    this.emit("reconnecting", { attempt: this.reconnector.currentAttempt, delayMs: delay });
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (_) {
        if (this.config.autoReconnect && this.reconnector.shouldReconnect) {
          this.scheduleReconnect();
        } else {
          this._state = "disconnected";
        }
      }
    }, delay);
  }
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this._state !== "connected") return;
      const requestId = `hb-${++this.pingCounter}`;
      this.sendRaw({ type: "ping", payload: { requestId } });
      this.pongTimer = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.close(4e3, "heartbeat timeout");
        }
      }, 1e4);
      const onPong = (payload) => {
        if (this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
        this.off("pong", onPong);
      };
      this.on("pong", onPong);
    }, this.config.heartbeatInterval);
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  clearPendingPings() {
    for (const [, { timer }] of this.pendingPings) {
      clearTimeout(timer);
    }
    this.pendingPings.clear();
  }
};
var RealtimeSSEClient = class extends TypedEmitter {
  constructor(baseUrl, config) {
    super();
    this.abortController = null;
    this.reconnectTimer = null;
    this.heartbeatWatchdog = null;
    this.lastDataTime = 0;
    this._state = "disconnected";
    this.intentionalClose = false;
    this.sseUrl = `${baseUrl}/sse?token=${config.token}`;
    this.config = {
      autoReconnect: true,
      ...config
    };
    this.reconnector = new Reconnector(config);
    this.fetchFn = config.fetch || fetch;
  }
  get state() {
    return this._state;
  }
  async connect() {
    if (this._state === "connected" || this._state === "connecting") return;
    this._state = "connecting";
    this.intentionalClose = false;
    this.abortController = new AbortController();
    const response = await this.fetchFn(this.sseUrl, {
      headers: { "Accept": "text/event-stream" },
      signal: this.abortController.signal
    });
    if (!response.ok) {
      this._state = "disconnected";
      throw new Error(`SSE connection failed: ${response.status}`);
    }
    if (!response.body) {
      this._state = "disconnected";
      throw new Error("SSE response has no body");
    }
    this._state = "connected";
    this.reconnector.markConnected();
    this.lastDataTime = Date.now();
    this.startHeartbeatWatchdog();
    this.emit("connected", void 0);
    this.readStream(response.body);
  }
  disconnect() {
    this.intentionalClose = true;
    this.stopHeartbeatWatchdog();
    this.clearReconnectTimer();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._state = "disconnected";
    this.emit("disconnected", { code: 1e3, reason: "client disconnect" });
  }
  // --- Internal ---
  async readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          this.lastDataTime = Date.now();
          if (line.startsWith(":")) {
            continue;
          }
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const msg = JSON.parse(jsonStr);
              this.emit(msg.type, msg.payload);
            } catch (_) {
            }
          }
        }
      }
    } catch (err) {
      if (this.intentionalClose) return;
    } finally {
      reader.releaseLock();
    }
    if (this.intentionalClose) return;
    this._state = "disconnected";
    this.stopHeartbeatWatchdog();
    this.emit("disconnected", { code: 0, reason: "stream ended" });
    if (this.config.autoReconnect && this.reconnector.shouldReconnect) {
      this.scheduleReconnect();
    }
  }
  scheduleReconnect() {
    const delay = this.reconnector.nextDelay();
    this._state = "reconnecting";
    this.emit("reconnecting", { attempt: this.reconnector.currentAttempt, delayMs: delay });
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (_) {
        if (this.config.autoReconnect && this.reconnector.shouldReconnect) {
          this.scheduleReconnect();
        } else {
          this._state = "disconnected";
        }
      }
    }, delay);
  }
  startHeartbeatWatchdog() {
    this.stopHeartbeatWatchdog();
    this.heartbeatWatchdog = setInterval(() => {
      if (Date.now() - this.lastDataTime > 45e3) {
        this.stopHeartbeatWatchdog();
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
      }
    }, 15e3);
  }
  stopHeartbeatWatchdog() {
    if (this.heartbeatWatchdog) {
      clearInterval(this.heartbeatWatchdog);
      this.heartbeatWatchdog = null;
    }
  }
  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
};

// src/types.ts
var ENVIRONMENTS = {
  production: "https://prismer.cloud"
};

// src/index.ts
var AccountClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Register an agent or human identity */
  async register(options) {
    return this._r("POST", "/api/im/register", options);
  }
  /** Get own identity, stats, bindings, credits */
  async me() {
    return this._r("GET", "/api/im/me");
  }
  /** Refresh JWT token */
  async refreshToken() {
    return this._r("POST", "/api/im/token/refresh");
  }
};
var DirectClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Send a direct message to a user */
  async send(userId, content, options) {
    return this._r("POST", `/api/im/direct/${userId}/messages`, {
      content,
      type: options?.type ?? "text",
      metadata: options?.metadata,
      parentId: options?.parentId
    });
  }
  /** Get direct message history with a user */
  async getMessages(userId, options) {
    const query = {};
    if (options?.limit) query.limit = String(options.limit);
    if (options?.offset) query.offset = String(options.offset);
    return this._r("GET", `/api/im/direct/${userId}/messages`, void 0, query);
  }
};
var GroupsClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Create a group chat */
  async create(options) {
    return this._r("POST", "/api/im/groups", options);
  }
  /** List groups you belong to */
  async list() {
    return this._r("GET", "/api/im/groups");
  }
  /** Get group details */
  async get(groupId) {
    return this._r("GET", `/api/im/groups/${groupId}`);
  }
  /** Send a message to a group */
  async send(groupId, content, options) {
    return this._r("POST", `/api/im/groups/${groupId}/messages`, {
      content,
      type: options?.type ?? "text",
      metadata: options?.metadata,
      parentId: options?.parentId
    });
  }
  /** Get group message history */
  async getMessages(groupId, options) {
    const query = {};
    if (options?.limit) query.limit = String(options.limit);
    if (options?.offset) query.offset = String(options.offset);
    return this._r("GET", `/api/im/groups/${groupId}/messages`, void 0, query);
  }
  /** Add a member to a group (owner/admin only) */
  async addMember(groupId, userId) {
    return this._r("POST", `/api/im/groups/${groupId}/members`, { userId });
  }
  /** Remove a member from a group (owner/admin only) */
  async removeMember(groupId, userId) {
    return this._r("DELETE", `/api/im/groups/${groupId}/members/${userId}`);
  }
};
var ConversationsClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** List conversations */
  async list(options) {
    const query = {};
    if (options?.withUnread) query.withUnread = "true";
    if (options?.unreadOnly) query.unreadOnly = "true";
    return this._r("GET", "/api/im/conversations", void 0, query);
  }
  /** Get conversation details */
  async get(conversationId) {
    return this._r("GET", `/api/im/conversations/${conversationId}`);
  }
  /** Create a direct conversation */
  async createDirect(userId) {
    return this._r("POST", "/api/im/conversations/direct", { userId });
  }
  /** Mark a conversation as read */
  async markAsRead(conversationId) {
    return this._r("POST", `/api/im/conversations/${conversationId}/read`);
  }
};
var MessagesClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Send a message to a conversation */
  async send(conversationId, content, options) {
    return this._r("POST", `/api/im/messages/${conversationId}`, {
      content,
      type: options?.type ?? "text",
      metadata: options?.metadata,
      parentId: options?.parentId
    });
  }
  /** Get message history for a conversation */
  async getHistory(conversationId, options) {
    const query = {};
    if (options?.limit) query.limit = String(options.limit);
    if (options?.offset) query.offset = String(options.offset);
    return this._r("GET", `/api/im/messages/${conversationId}`, void 0, query);
  }
  /** Edit a message */
  async edit(conversationId, messageId, content) {
    return this._r("PATCH", `/api/im/messages/${conversationId}/${messageId}`, { content });
  }
  /** Delete a message */
  async delete(conversationId, messageId) {
    return this._r("DELETE", `/api/im/messages/${conversationId}/${messageId}`);
  }
};
var ContactsClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** List contacts (users you've communicated with) */
  async list() {
    return this._r("GET", "/api/im/contacts");
  }
  /** Discover agents by capability or type */
  async discover(options) {
    const query = {};
    if (options?.type) query.type = options.type;
    if (options?.capability) query.capability = options.capability;
    return this._r("GET", "/api/im/discover", void 0, query);
  }
};
var BindingsClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Create a social binding */
  async create(options) {
    return this._r("POST", "/api/im/bindings", options);
  }
  /** Verify a binding with 6-digit code */
  async verify(bindingId, code) {
    return this._r("POST", `/api/im/bindings/${bindingId}/verify`, { code });
  }
  /** List bindings */
  async list() {
    return this._r("GET", "/api/im/bindings");
  }
  /** Delete a binding */
  async delete(bindingId) {
    return this._r("DELETE", `/api/im/bindings/${bindingId}`);
  }
};
var CreditsClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Get credits balance */
  async get() {
    return this._r("GET", "/api/im/credits");
  }
  /** Get credit transaction history */
  async transactions(options) {
    const query = {};
    if (options?.limit) query.limit = String(options.limit);
    if (options?.offset) query.offset = String(options.offset);
    return this._r("GET", "/api/im/credits/transactions", void 0, query);
  }
};
var WorkspaceClient = class {
  constructor(_r) {
    this._r = _r;
  }
  /** Initialize a 1:1 workspace (1 user + 1 agent) */
  async init(options) {
    return this._r("POST", "/api/im/workspace/init", options);
  }
  /** Initialize a group workspace (multi-user + multi-agent) */
  async initGroup(options) {
    return this._r("POST", "/api/im/workspace/init-group", options);
  }
  /** Add an agent to a workspace */
  async addAgent(workspaceId, agentId) {
    return this._r("POST", `/api/im/workspace/${workspaceId}/agents`, { agentId });
  }
  /** List agents in a workspace */
  async listAgents(workspaceId) {
    return this._r("GET", `/api/im/workspace/${workspaceId}/agents`);
  }
  /** @mention autocomplete */
  async mentionAutocomplete(conversationId, query) {
    const q = { conversationId };
    if (query) q.q = query;
    return this._r("GET", "/api/im/workspace/mentions/autocomplete", void 0, q);
  }
};
var IMRealtimeClient = class {
  constructor(_wsBase) {
    this._wsBase = _wsBase;
  }
  /** Get the WebSocket URL */
  wsUrl(token) {
    const base = this._wsBase.replace(/^http/, "ws");
    return token ? `${base}/ws?token=${token}` : `${base}/ws`;
  }
  /** Get the SSE URL */
  sseUrl(token) {
    return token ? `${this._wsBase}/sse?token=${token}` : `${this._wsBase}/sse`;
  }
  /** Create a WebSocket client. Call .connect() to establish connection. */
  connectWS(config) {
    return new RealtimeWSClient(this._wsBase, config);
  }
  /** Create an SSE client. Call .connect() to establish connection. */
  connectSSE(config) {
    return new RealtimeSSEClient(this._wsBase, config);
  }
};
var IMClient = class {
  constructor(request, wsBase) {
    this.account = new AccountClient(request);
    this.direct = new DirectClient(request);
    this.groups = new GroupsClient(request);
    this.conversations = new ConversationsClient(request);
    this.messages = new MessagesClient(request);
    this.contacts = new ContactsClient(request);
    this.bindings = new BindingsClient(request);
    this.credits = new CreditsClient(request);
    this.workspace = new WorkspaceClient(request);
    this.realtime = new IMRealtimeClient(wsBase);
  }
  /** IM health check */
  async health() {
    return this.account["_r"]("GET", "/api/im/health");
  }
};
var PrismerClient = class {
  constructor(config = {}) {
    if (config.apiKey && !config.apiKey.startsWith("sk-prismer-") && !config.apiKey.startsWith("eyJ")) {
      console.warn('Warning: API key should start with "sk-prismer-" (or "eyJ" for IM JWT)');
    }
    this.apiKey = config.apiKey || "";
    const envUrl = ENVIRONMENTS[config.environment || "production"];
    this.baseUrl = (config.baseUrl || envUrl).replace(/\/$/, "");
    this.timeout = config.timeout || 3e4;
    this.fetchFn = config.fetch || fetch;
    this.imAgent = config.imAgent;
    this.im = new IMClient(
      (method, path, body, query) => this._request(method, path, body, query),
      this.baseUrl
    );
  }
  /**
   * Set or update the auth token (API key or IM JWT).
   * Useful after anonymous registration to set the returned JWT.
   */
  setToken(token) {
    this.apiKey = token;
  }
  // --------------------------------------------------------------------------
  // Internal request helper
  // --------------------------------------------------------------------------
  async _request(method, path, body, query) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      let url = `${this.baseUrl}${path}`;
      if (query && Object.keys(query).length > 0) {
        url += "?" + new URLSearchParams(query).toString();
      }
      const headers = {};
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }
      if (this.imAgent) {
        headers["X-IM-Agent"] = this.imAgent;
      }
      const init = { method, headers, signal: controller.signal };
      if (body !== void 0) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      const response = await this.fetchFn(url, init);
      const data = await response.json();
      if (!response.ok) {
        const err = data.error || { code: "HTTP_ERROR", message: `Request failed with status ${response.status}` };
        return { ...data, success: false, ok: false, error: err };
      }
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, ok: false, error: { code: "TIMEOUT", message: "Request timed out" } };
      }
      return {
        success: false,
        ok: false,
        error: { code: "NETWORK_ERROR", message: error instanceof Error ? error.message : "Unknown error" }
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
  // --------------------------------------------------------------------------
  // Context API
  // --------------------------------------------------------------------------
  /** Load content from URL(s) or search query */
  async load(input, options = {}) {
    return this._request("POST", "/api/context/load", {
      input,
      inputType: options.inputType,
      processUncached: options.processUncached,
      search: options.search,
      processing: options.processing,
      return: options.return,
      ranking: options.ranking
    });
  }
  /** Save content to Prismer cache */
  async save(options) {
    return this._request("POST", "/api/context/save", options);
  }
  /** Batch save multiple items (max 50) */
  async saveBatch(items) {
    return this.save({ items });
  }
  // --------------------------------------------------------------------------
  // Parse API
  // --------------------------------------------------------------------------
  /** Parse a document (PDF, image) into structured content */
  async parse(options) {
    return this._request("POST", "/api/parse", options);
  }
  /** Convenience: parse a PDF by URL */
  async parsePdf(url, mode = "fast") {
    return this.parse({ url, mode });
  }
  /** Check status of an async parse task */
  async parseStatus(taskId) {
    return this._request("GET", `/api/parse/status/${taskId}`);
  }
  /** Get result of a completed async parse task */
  async parseResult(taskId) {
    return this._request("GET", `/api/parse/result/${taskId}`);
  }
  // --------------------------------------------------------------------------
  // Convenience
  // --------------------------------------------------------------------------
  /** Search for content (convenience wrapper around load with query mode) */
  async search(query, options) {
    return this.load(query, {
      inputType: "query",
      search: options?.topK ? { topK: options.topK } : void 0,
      return: options?.returnTopK || options?.format ? { topK: options?.returnTopK, format: options?.format } : void 0,
      ranking: options?.ranking ? { preset: options.ranking } : void 0
    });
  }
};
var index_default = PrismerClient;
function createClient(config) {
  return new PrismerClient(config);
}
export {
  AccountClient,
  BindingsClient,
  ContactsClient,
  ConversationsClient,
  CreditsClient,
  DirectClient,
  ENVIRONMENTS,
  GroupsClient,
  IMClient,
  IMRealtimeClient,
  MessagesClient,
  PrismerClient,
  RealtimeSSEClient,
  RealtimeWSClient,
  WorkspaceClient,
  createClient,
  index_default as default
};
