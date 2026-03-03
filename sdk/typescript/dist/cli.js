#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/cli.ts
var import_commander = require("commander");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var os = __toESM(require("os"));
var TOML = __toESM(require("@iarna/toml"));

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
      (method, path2, body, query) => this._request(method, path2, body, query),
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
  async _request(method, path2, body, query) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      let url = `${this.baseUrl}${path2}`;
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

// src/cli.ts
var cliVersion = "1.3.3";
try {
  const pkgPath = path.join(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  cliVersion = pkg.version || cliVersion;
} catch {
}
var CONFIG_DIR = path.join(os.homedir(), ".prismer");
var CONFIG_PATH = path.join(CONFIG_DIR, "config.toml");
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return TOML.parse(raw);
}
function writeConfig(config) {
  ensureConfigDir();
  const content = TOML.stringify(config);
  fs.writeFileSync(CONFIG_PATH, content, "utf-8");
}
function setNestedValue(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (current[key] === void 0 || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}
function getIMClient() {
  const cfg = readConfig();
  const token = cfg?.auth?.im_token;
  if (!token) {
    console.error('No IM token. Run "prismer register" first.');
    process.exit(1);
  }
  const env = cfg?.default?.environment || "production";
  const baseUrl = cfg?.default?.base_url || "";
  return new PrismerClient({ apiKey: token, environment: env, ...baseUrl ? { baseUrl } : {} });
}
function getAPIClient() {
  const cfg = readConfig();
  const apiKey = cfg?.default?.api_key;
  if (!apiKey) {
    console.error('No API key. Run "prismer init <api-key>" first.');
    process.exit(1);
  }
  const env = cfg?.default?.environment || "production";
  const baseUrl = cfg?.default?.base_url || "";
  return new PrismerClient({ apiKey, environment: env, ...baseUrl ? { baseUrl } : {} });
}
var program = new import_commander.Command();
program.name("prismer").description("Prismer Cloud SDK CLI").version(cliVersion);
program.command("init <api-key>").description("Store API key in ~/.prismer/config.toml").action((apiKey) => {
  const config = readConfig();
  if (!config.default) {
    config.default = {};
  }
  config.default.api_key = apiKey;
  if (!config.default.environment) {
    config.default.environment = "production";
  }
  if (config.default.base_url === void 0) {
    config.default.base_url = "";
  }
  writeConfig(config);
  console.log("API key saved to ~/.prismer/config.toml");
});
program.command("register <username>").description("Register an IM agent and store the token").option("--type <type>", "Identity type: agent or human", "agent").option("--display-name <name>", "Display name for the agent").option("--agent-type <agentType>", "Agent type: assistant, specialist, orchestrator, tool, or bot").option("--capabilities <caps>", "Comma-separated list of capabilities").action(async (username, opts) => {
  const config = readConfig();
  const apiKey = config.default?.api_key;
  if (!apiKey) {
    console.error('Error: No API key configured. Run "prismer init <api-key>" first.');
    process.exit(1);
  }
  const client = new PrismerClient({
    apiKey,
    environment: config.default?.environment || "production",
    baseUrl: config.default?.base_url || void 0
  });
  const registerOpts = {
    type: opts.type,
    username,
    displayName: opts.displayName || username
  };
  if (opts.agentType) {
    registerOpts.agentType = opts.agentType;
  }
  if (opts.capabilities) {
    registerOpts.capabilities = opts.capabilities.split(",").map((c) => c.trim());
  }
  try {
    const result = await client.im.account.register(registerOpts);
    if (!result.ok || !result.data) {
      console.error("Registration failed:", result.error?.message || "Unknown error");
      process.exit(1);
    }
    const data = result.data;
    if (!config.auth) {
      config.auth = {};
    }
    config.auth.im_token = data.token;
    config.auth.im_user_id = data.imUserId;
    config.auth.im_username = data.username;
    config.auth.im_token_expires = data.expiresIn;
    writeConfig(config);
    console.log("Registration successful!");
    console.log(`  User ID:  ${data.imUserId}`);
    console.log(`  Username: ${data.username}`);
    console.log(`  Display:  ${data.displayName}`);
    console.log(`  Role:     ${data.role}`);
    console.log(`  New:      ${data.isNew}`);
    console.log(`  Expires:  ${data.expiresIn}`);
    console.log("");
    console.log("Token stored in ~/.prismer/config.toml");
  } catch (err) {
    console.error("Registration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
});
program.command("status").description("Show current config and token status").action(async () => {
  const config = readConfig();
  console.log("=== Prismer Status ===");
  console.log("");
  const apiKey = config.default?.api_key;
  if (apiKey) {
    const masked = apiKey.length > 16 ? apiKey.slice(0, 12) + "..." + apiKey.slice(-4) : "***";
    console.log(`API Key:     ${masked}`);
  } else {
    console.log("API Key:     (not set)");
  }
  console.log(`Environment: ${config.default?.environment || "(not set)"}`);
  console.log(`Base URL:    ${config.default?.base_url || "(default)"}`);
  console.log("");
  const token = config.auth?.im_token;
  if (token) {
    console.log(`IM User ID:  ${config.auth?.im_user_id || "(unknown)"}`);
    console.log(`IM Username: ${config.auth?.im_username || "(unknown)"}`);
    const expires = config.auth?.im_token_expires;
    if (expires) {
      const expiresDate = new Date(expires);
      if (!isNaN(expiresDate.getTime())) {
        const now = /* @__PURE__ */ new Date();
        const isExpired = expiresDate <= now;
        const label = isExpired ? "EXPIRED" : "valid";
        console.log(`IM Token:    ${label} (expires ${expiresDate.toISOString()})`);
      } else {
        console.log(`IM Token:    set (expires in ${expires})`);
      }
    } else {
      console.log("IM Token:    set (expiry unknown)");
    }
  } else {
    console.log("IM Token:    (not registered)");
  }
  if (token) {
    console.log("");
    console.log("--- Live Info ---");
    try {
      const client = new PrismerClient({
        apiKey: token,
        environment: config.default?.environment || "production",
        baseUrl: config.default?.base_url || void 0
      });
      const me = await client.im.account.me();
      if (me.ok && me.data) {
        console.log(`Display:     ${me.data.user.displayName}`);
        console.log(`Role:        ${me.data.user.role}`);
        console.log(`Credits:     ${me.data.credits.balance}`);
        console.log(`Messages:    ${me.data.stats.messagesSent}`);
        console.log(`Unread:      ${me.data.stats.unreadCount}`);
      } else {
        console.log(`Could not fetch live info: ${me.error?.message || "unknown error"}`);
      }
    } catch (err) {
      console.log(`Could not fetch live info: ${err instanceof Error ? err.message : err}`);
    }
  }
});
var configCmd = program.command("config").description("Manage config file");
configCmd.command("show").description("Print config file contents").action(() => {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log("No config file found at ~/.prismer/config.toml");
    console.log('Run "prismer init <api-key>" to create one.');
    return;
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  console.log(raw);
});
configCmd.command("set <key> <value>").description("Set a config value (e.g., prismer config set default.api_key sk-prismer-...)").action((key, value) => {
  const config = readConfig();
  setNestedValue(config, key, value);
  writeConfig(config);
  console.log(`Set ${key} = ${value}`);
});
var im = program.command("im").description("IM messaging commands");
im.command("me").description("Show current identity and stats").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.account.me();
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const d = res.data;
  if (opts.json) {
    console.log(JSON.stringify(d, null, 2));
    return;
  }
  console.log(`Display Name: ${d?.user?.displayName || "-"}`);
  console.log(`Username:     ${d?.user?.username || "-"}`);
  console.log(`Role:         ${d?.user?.role || "-"}`);
  console.log(`Agent Type:   ${d?.agentCard?.agentType || "-"}`);
  console.log(`Credits:      ${d?.credits?.balance ?? "-"}`);
  console.log(`Messages:     ${d?.stats?.messagesSent ?? "-"}`);
  console.log(`Unread:       ${d?.stats?.unreadCount ?? "-"}`);
});
im.command("health").description("Check IM service health").action(async () => {
  const client = getIMClient();
  const res = await client.im.health();
  console.log(`IM Service: ${res.ok ? "OK" : "ERROR"}`);
  if (!res.ok) {
    console.error(res.error);
    process.exit(1);
  }
});
im.command("send").description("Send a direct message").argument("<user-id>", "Target user ID").argument("<message>", "Message content").option("--json", "JSON output").action(async (userId, message, opts) => {
  const client = getIMClient();
  const res = await client.im.direct.send(userId, message);
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }
  console.log(`Message sent (conversationId: ${res.data?.conversationId})`);
});
im.command("messages").description("View direct message history").argument("<user-id>", "Target user ID").option("-n, --limit <n>", "Max messages", "20").option("--json", "JSON output").action(async (userId, opts) => {
  const client = getIMClient();
  const res = await client.im.direct.getMessages(userId, { limit: parseInt(opts.limit) });
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const msgs = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(msgs, null, 2));
    return;
  }
  if (msgs.length === 0) {
    console.log("No messages.");
    return;
  }
  for (const m of msgs) {
    const ts = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
    console.log(`[${ts}] ${m.senderId || "?"}: ${m.content}`);
  }
});
im.command("discover").description("Discover available agents").option("--type <type>", "Filter by type").option("--capability <cap>", "Filter by capability").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const discoverOpts = {};
  if (opts.type) discoverOpts.type = opts.type;
  if (opts.capability) discoverOpts.capability = opts.capability;
  const res = await client.im.contacts.discover(discoverOpts);
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const agents = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(agents, null, 2));
    return;
  }
  if (agents.length === 0) {
    console.log("No agents found.");
    return;
  }
  console.log("Username".padEnd(20) + "Type".padEnd(14) + "Status".padEnd(10) + "Display Name");
  for (const a of agents) {
    console.log(`${(a.username || "").padEnd(20)}${(a.agentType || "").padEnd(14)}${(a.status || "").padEnd(10)}${a.displayName || ""}`);
  }
});
im.command("contacts").description("List contacts").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.contacts.list();
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const contacts = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(contacts, null, 2));
    return;
  }
  if (contacts.length === 0) {
    console.log("No contacts.");
    return;
  }
  console.log("Username".padEnd(20) + "Role".padEnd(10) + "Unread".padEnd(8) + "Display Name");
  for (const c of contacts) {
    console.log(`${(c.username || "").padEnd(20)}${(c.role || "").padEnd(10)}${String(c.unreadCount ?? 0).padEnd(8)}${c.displayName || ""}`);
  }
});
var groups = im.command("groups").description("Group management");
groups.command("list").description("List groups").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.groups.list();
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const list = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  if (list.length === 0) {
    console.log("No groups.");
    return;
  }
  for (const g of list) {
    console.log(`${g.groupId || ""}  ${g.title || ""} (${g.members?.length || "?"} members)`);
  }
});
groups.command("create").description("Create a group").argument("<title>", "Group title").option("-m, --members <ids>", "Comma-separated member IDs").option("--json", "JSON output").action(async (title, opts) => {
  const client = getIMClient();
  const members = opts.members ? opts.members.split(",").map((s) => s.trim()) : [];
  const res = await client.im.groups.create({ title, members });
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }
  console.log(`Group created (groupId: ${res.data?.groupId})`);
});
groups.command("send").description("Send message to group").argument("<group-id>", "Group ID").argument("<message>", "Message content").option("--json", "JSON output").action(async (groupId, message, opts) => {
  const client = getIMClient();
  const res = await client.im.groups.send(groupId, message);
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }
  console.log("Message sent to group.");
});
groups.command("messages").description("View group message history").argument("<group-id>", "Group ID").option("-n, --limit <n>", "Max messages", "20").option("--json", "JSON output").action(async (groupId, opts) => {
  const client = getIMClient();
  const res = await client.im.groups.getMessages(groupId, { limit: parseInt(opts.limit) });
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const msgs = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(msgs, null, 2));
    return;
  }
  if (msgs.length === 0) {
    console.log("No messages.");
    return;
  }
  for (const m of msgs) {
    const ts = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
    console.log(`[${ts}] ${m.senderId || "?"}: ${m.content}`);
  }
});
var convos = im.command("conversations").description("Conversation management");
convos.command("list").description("List conversations").option("--unread", "Show unread only").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const listOpts = {};
  if (opts.unread) {
    listOpts.withUnread = true;
    listOpts.unreadOnly = true;
  }
  const res = await client.im.conversations.list(listOpts);
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const list = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  if (list.length === 0) {
    console.log("No conversations.");
    return;
  }
  for (const c of list) {
    const unread = c.unreadCount ? ` (${c.unreadCount} unread)` : "";
    console.log(`${c.id || ""}  ${c.type || ""}  ${c.title || ""}${unread}`);
  }
});
convos.command("read").description("Mark conversation as read").argument("<conversation-id>", "Conversation ID").action(async (convId) => {
  const client = getIMClient();
  const res = await client.im.conversations.markAsRead(convId);
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  console.log("Marked as read.");
});
im.command("credits").description("Show credits balance").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.credits.get();
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }
  console.log(`Balance: ${res.data?.balance ?? "-"}`);
});
im.command("transactions").description("Transaction history").option("-n, --limit <n>", "Max transactions", "20").option("--json", "JSON output").action(async (opts) => {
  const client = getIMClient();
  const res = await client.im.credits.transactions({ limit: parseInt(opts.limit) });
  if (!res.ok) {
    console.error("Error:", res.error);
    process.exit(1);
  }
  const txns = res.data || [];
  if (opts.json) {
    console.log(JSON.stringify(txns, null, 2));
    return;
  }
  if (txns.length === 0) {
    console.log("No transactions.");
    return;
  }
  for (const t of txns) {
    console.log(`${t.createdAt || ""}  ${t.type || ""}  ${t.amount ?? ""}  ${t.description || ""}`);
  }
});
var ctx = program.command("context").description("Context API commands");
ctx.command("load").description("Load URL content").argument("<url>", "URL to load").option("-f, --format <fmt>", "Return format: hqcc, raw, both", "hqcc").option("--json", "JSON output").action(async (url, opts) => {
  const client = getAPIClient();
  const loadOpts = {};
  if (opts.format) loadOpts.return = { format: opts.format };
  const res = await client.load(url, loadOpts);
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (!res.success) {
    console.error("Error:", res.error?.message || "Load failed");
    process.exit(1);
  }
  const r = res.result;
  console.log(`URL:     ${r?.url || url}`);
  console.log(`Status:  ${r?.cached ? "cached" : "loaded"}`);
  if (r?.hqcc) {
    console.log(`
--- HQCC ---
${r.hqcc.substring(0, 2e3)}`);
  }
  if (r?.raw) {
    console.log(`
--- Raw ---
${r.raw.substring(0, 2e3)}`);
  }
});
ctx.command("search").description("Search cached content").argument("<query>", "Search query").option("-k, --top-k <n>", "Number of results", "5").option("--json", "JSON output").action(async (query, opts) => {
  const client = getAPIClient();
  const res = await client.search(query, { topK: parseInt(opts.topK) });
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (!res.success) {
    console.error("Error:", res.error?.message || "Search failed");
    process.exit(1);
  }
  const results = res.results || [];
  if (results.length === 0) {
    console.log("No results.");
    return;
  }
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`${i + 1}. ${r.url || "(no url)"}  score: ${r.ranking?.score ?? "-"}`);
    if (r.hqcc) console.log(`   ${r.hqcc.substring(0, 200)}`);
  }
});
ctx.command("save").description("Save content to cache").argument("<url>", "URL key").argument("<hqcc>", "HQCC content").option("--json", "JSON output").action(async (url, hqcc, opts) => {
  const client = getAPIClient();
  const res = await client.save({ url, hqcc });
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (!res.success) {
    console.error("Error:", res.error?.message || "Save failed");
    process.exit(1);
  }
  console.log("Content saved.");
});
var parse2 = program.command("parse").description("Document parsing commands");
parse2.command("run").description("Parse a document").argument("<url>", "Document URL").option("-m, --mode <mode>", "Parse mode: fast, hires, auto", "fast").option("--json", "JSON output").action(async (url, opts) => {
  const client = getAPIClient();
  const res = await client.parsePdf(url, opts.mode);
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (!res.success) {
    console.error("Error:", res.error?.message || "Parse failed");
    process.exit(1);
  }
  if (res.taskId) {
    console.log(`Task ID: ${res.taskId}`);
    console.log(`Status:  ${res.status || "processing"}`);
    console.log(`
Check progress: prismer parse status ${res.taskId}`);
  } else if (res.document) {
    console.log(`Status: complete`);
    const content = res.document.markdown || res.document.text || JSON.stringify(res.document, null, 2);
    console.log(content.substring(0, 5e3));
  }
});
parse2.command("status").description("Check parse task status").argument("<task-id>", "Task ID").option("--json", "JSON output").action(async (taskId, opts) => {
  const client = getAPIClient();
  const res = await client.parseStatus(taskId);
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  console.log(`Task:   ${taskId}`);
  console.log(`Status: ${res.status || (res.success ? "complete" : "unknown")}`);
});
parse2.command("result").description("Get parse result").argument("<task-id>", "Task ID").option("--json", "JSON output").action(async (taskId, opts) => {
  const client = getAPIClient();
  const res = await client.parseResult(taskId);
  if (opts.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  if (!res.success) {
    console.error("Error:", res.error?.message || "Not ready");
    process.exit(1);
  }
  const content = res.document?.markdown || res.document?.text || JSON.stringify(res.document, null, 2);
  console.log(content);
});
program.parse(process.argv);
