/**
 * Container Service Gateway
 *
 * Unified reverse proxy for all container services.
 * Binds 0.0.0.0:3000, routes /api/v1/{service}/* to internal ports.
 *
 * Zero npm dependencies — pure Node.js.
 */

import { createServer, request as httpRequest } from 'node:http';
import { Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { VERSION } from './version.mjs';

const PORT = parseInt(process.env.GATEWAY_PORT || '3000', 10);
const JUPYTER_TOKEN = process.env.JUPYTER_TOKEN || '';
const START_TIME = Date.now();

// ── Service routing table ──────────────────────────────────

const SERVICES = {
  latex:   { host: '127.0.0.1', port: 8080,  health: '/health' },
  prover:  { host: '127.0.0.1', port: 8081,  health: '/health' },
  jupyter: { host: '127.0.0.1', port: 8888,  health: '/api/status' },
  gateway: { host: '127.0.0.1', port: 18900, health: '/' },
  arxiv:   { host: '127.0.0.1', port: 8082,  health: '/health' },
};

// ── Request statistics ─────────────────────────────────────

const stats = {
  // Per-service counters
  services: Object.fromEntries(
    Object.keys(SERVICES).map((s) => [s, {
      requests: 0,
      errors: 0,
      latency_sum_ms: 0,
      latency_max_ms: 0,
      status_codes: {},    // { "200": 5, "502": 1, ... }
    }])
  ),
  // LLM token usage (from OpenClaw gateway responses)
  tokens: {
    total_requests: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    // Per-model breakdown
    models: {},  // { "gpt-4o": { prompt: N, completion: N, total: N, requests: N } }
  },
  // WebSocket connections
  ws: {
    upgrades: 0,
    active: 0,
  },
};

function recordRequest(service, statusCode, elapsed) {
  const svc = stats.services[service];
  if (!svc) return;
  svc.requests++;
  svc.latency_sum_ms += elapsed;
  if (elapsed > svc.latency_max_ms) svc.latency_max_ms = elapsed;
  const code = String(statusCode);
  svc.status_codes[code] = (svc.status_codes[code] || 0) + 1;
  if (statusCode >= 400) svc.errors++;
}

function recordTokenUsage(usage, model) {
  if (!usage) return;
  const t = stats.tokens;
  t.total_requests++;
  t.prompt_tokens += usage.prompt_tokens || 0;
  t.completion_tokens += usage.completion_tokens || 0;
  t.total_tokens += usage.total_tokens || 0;

  if (model) {
    if (!t.models[model]) {
      t.models[model] = { prompt: 0, completion: 0, total: 0, requests: 0 };
    }
    const m = t.models[model];
    m.requests++;
    m.prompt += usage.prompt_tokens || 0;
    m.completion += usage.completion_tokens || 0;
    m.total += usage.total_tokens || 0;
  }
}

// ── Proxy logic ────────────────────────────────────────────

function proxyRequest(req, res, service, targetPath) {
  const svc = SERVICES[service];
  if (!svc) {
    sendJSON(res, 404, { error: `Unknown service: ${service}`, code: 'SERVICE_NOT_FOUND' });
    return;
  }

  const start = Date.now();
  const headers = { ...req.headers, host: `${svc.host}:${svc.port}` };

  // Jupyter: inject auth token
  if (service === 'jupyter' && JUPYTER_TOKEN) {
    headers['authorization'] = `token ${JUPYTER_TOKEN}`;
  }

  const opts = {
    hostname: svc.host,
    port: svc.port,
    path: targetPath || '/',
    method: req.method,
    headers,
    timeout: 30000,
  };

  const proxyReq = httpRequest(opts, (proxyRes) => {
    const elapsed = Date.now() - start;
    log(`${req.method} /api/v1/${service}${targetPath} → ${proxyRes.statusCode} (${elapsed}ms)`);
    recordRequest(service, proxyRes.statusCode, elapsed);

    // For gateway service: intercept response body to extract token usage
    if (service === 'gateway' && req.method === 'POST') {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks);
        // Try to parse OpenAI-compatible usage from response
        try {
          const json = JSON.parse(body.toString());
          if (json.usage) {
            recordTokenUsage(json.usage, json.model);
            log(`[tokens] model=${json.model || '?'} prompt=${json.usage.prompt_tokens || 0} completion=${json.usage.completion_tokens || 0} total=${json.usage.total_tokens || 0}`);
          }
        } catch { /* not JSON or no usage field — fine */ }
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(body);
      });
    } else {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  });

  proxyReq.on('error', (err) => {
    const elapsed = Date.now() - start;
    log(`${req.method} /api/v1/${service}${targetPath} → ERR (${elapsed}ms): ${err.message}`);
    recordRequest(service, 502, elapsed);
    sendJSON(res, 502, { error: `Service ${service} unavailable: ${err.message}`, code: 'SERVICE_UNAVAILABLE' });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    recordRequest(service, 504, Date.now() - start);
    sendJSON(res, 504, { error: `Service ${service} timeout`, code: 'SERVICE_TIMEOUT' });
  });

  req.pipe(proxyReq, { end: true });
}

// ── WebSocket upgrade ──────────────────────────────────────

function handleUpgrade(req, socket, head) {
  const match = req.url?.match(/^\/api\/v1\/(\w+)(\/.*)?$/);
  if (!match) { socket.destroy(); return; }

  const [, service, rest] = match;
  const svc = SERVICES[service];
  if (!svc) { socket.destroy(); return; }

  const targetPath = rest || '/';
  const headers = { ...req.headers, host: `${svc.host}:${svc.port}` };

  // Jupyter: inject auth token for WebSocket upgrade
  if (service === 'jupyter' && JUPYTER_TOKEN) {
    headers['authorization'] = `token ${JUPYTER_TOKEN}`;
  }

  const opts = {
    hostname: svc.host,
    port: svc.port,
    path: targetPath,
    method: 'GET',
    headers,
  };

  const proxyReq = httpRequest(opts);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // Relay the 101 Switching Protocols response
    let responseHead = `HTTP/1.1 101 Switching Protocols\r\n`;
    for (const [key, val] of Object.entries(proxyRes.headers)) {
      responseHead += `${key}: ${val}\r\n`;
    }
    responseHead += '\r\n';
    socket.write(responseHead);
    if (proxyHead.length) socket.write(proxyHead);

    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    stats.ws.upgrades++;
    stats.ws.active++;
    const onClose = () => { stats.ws.active = Math.max(0, stats.ws.active - 1); };
    proxySocket.on('error', () => { onClose(); socket.destroy(); });
    socket.on('error', () => { onClose(); proxySocket.destroy(); });
    proxySocket.on('close', onClose);
    socket.on('close', onClose);

    log(`WS upgrade /api/v1/${service}${targetPath}`);
  });

  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
}

// ── Health checks ──────────────────────────────────────────

async function checkService(name) {
  const svc = SERVICES[name];
  const start = Date.now();

  // OpenClaw gateway speaks WebSocket and may not provide a plain HTTP health path.
  // Treat successful TCP connect as healthy.
  if (name === 'gateway') {
    return new Promise((resolve) => {
      const socket = new Socket();
      let settled = false;
      const done = (status) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve({ status, latency_ms: Date.now() - start });
      };

      socket.setTimeout(3000);
      socket.once('connect', () => done('up'));
      socket.once('timeout', () => done('timeout'));
      socket.once('error', () => done('down'));
      socket.connect(svc.port, svc.host);
    });
  }

  return new Promise((resolve) => {
    const headers = {};
    // Jupyter requires auth token for all endpoints including health
    if (name === 'jupyter' && JUPYTER_TOKEN) {
      headers['authorization'] = `token ${JUPYTER_TOKEN}`;
    }
    const req = httpRequest(
      { hostname: svc.host, port: svc.port, path: svc.health, method: 'GET', headers, timeout: 3000 },
      (res) => {
        res.resume(); // drain
        resolve({ status: res.statusCode < 400 ? 'up' : 'degraded', latency_ms: Date.now() - start });
      }
    );
    req.on('error', () => resolve({ status: 'down', latency_ms: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', latency_ms: Date.now() - start }); });
    req.end();
  });
}

async function handleHealth(res, serviceName) {
  if (serviceName) {
    if (!SERVICES[serviceName]) {
      sendJSON(res, 404, { error: `Unknown service: ${serviceName}` });
      return;
    }
    const result = await checkService(serviceName);
    sendJSON(res, result.status === 'up' ? 200 : 503, { service: serviceName, ...result });
    return;
  }

  // Aggregate all
  const checks = await Promise.all(
    Object.keys(SERVICES).map(async (name) => [name, await checkService(name)])
  );
  const services = Object.fromEntries(checks);
  const allUp = checks.every(([, v]) => v.status === 'up');
  sendJSON(res, allUp ? 200 : 503, {
    status: allUp ? 'healthy' : 'degraded',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    services,
  });
}

// ── Stats endpoint ─────────────────────────────────────────

function handleStats(res) {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);
  const totalRequests = Object.values(stats.services).reduce((s, v) => s + v.requests, 0);
  const totalErrors = Object.values(stats.services).reduce((s, v) => s + v.errors, 0);

  // Compute per-service average latency
  const serviceStats = {};
  for (const [name, svc] of Object.entries(stats.services)) {
    serviceStats[name] = {
      ...svc,
      latency_avg_ms: svc.requests > 0 ? Math.round(svc.latency_sum_ms / svc.requests) : 0,
    };
  }

  sendJSON(res, 200, {
    uptime,
    total_requests: totalRequests,
    total_errors: totalErrors,
    error_rate: totalRequests > 0 ? (totalErrors / totalRequests * 100).toFixed(2) + '%' : '0%',
    services: serviceStats,
    tokens: stats.tokens,
    websockets: stats.ws,
  });
}

// ── HTTP server ────────────────────────────────────────────

const server = createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Stats endpoint
  if (path === '/api/v1/stats' && req.method === 'GET') {
    handleStats(res);
    return;
  }

  // Health checks
  const healthMatch = path.match(/^\/api\/v1\/health(?:\/(\w+))?$/);
  if (healthMatch && req.method === 'GET') {
    handleHealth(res, healthMatch[1]);
    return;
  }

  // Service proxy: /api/v1/{service}/{rest}
  const svcMatch = path.match(/^\/api\/v1\/(\w+)(\/.*)?$/);
  if (svcMatch) {
    const [, service, rest] = svcMatch;
    const search = url.search || '';
    proxyRequest(req, res, service, (rest || '/') + search);
    return;
  }

  // Root — includes component versions for compatibility checking
  if (path === '/') {
    sendJSON(res, 200, {
      service: 'prismer-container-gateway',
      version: VERSION,
      versions: loadVersionsManifest(),
      routes: Object.keys(SERVICES).map((s) => `/api/v1/${s}/*`),
      health: '/api/v1/health',
      stats: '/api/v1/stats',
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
});

server.on('upgrade', handleUpgrade);

server.listen(PORT, '0.0.0.0', () => {
  log(`Container Gateway v${VERSION} listening on 0.0.0.0:${PORT}`);
  log(`Routes: ${Object.entries(SERVICES).map(([k, v]) => `${k} → :${v.port}`).join(', ')}`);
  log(`Stats: /api/v1/stats`);
});

// ── Helpers ────────────────────────────────────────────────

/** Load versions manifest baked into the image at build time */
function loadVersionsManifest() {
  try {
    const raw = readFileSync('/opt/prismer/versions.json', 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Manifest not found (dev mode or old image) — return gateway version only
    return { 'container-gateway': VERSION };
  }
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [gateway] ${msg}`);
}
