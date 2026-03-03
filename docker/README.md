# Prismer Docker Guide

> Version: 5.0.0
> Updated: 2026-03-03
> Scope: Docker runtime, gateway routing, OpenClaw container integration

---

## Overview

The `docker/` directory contains the container runtime stack used by Prismer workspaces.

Core goals:

- Run all research services inside one containerized runtime.
- Expose a single host endpoint (`:16888`) through `container-gateway.mjs`.
- Proxy route-based APIs to internal services (LaTeX, Jupyter, Prover, arXiv, OpenClaw Gateway).

---

## Current Repository State

This section reflects the repository as it exists today.

- Available plugin source under `docker/plugin/`:
  - `prismer-workspace/`
- `prismer-im` source directory is **not present** in `docker/plugin/`.
- Some Docker/OpenClaw config files still reference `prismer-im`.

If you are preparing production builds, validate plugin references before release.

---

## Architecture

### Network Model

- Host fixed port: `16888`
- Container gateway port: `3000`
- Internal services stay private and are reached through gateway routing.

```text
Host (:16888)
  -> /api/v1/latex/*    -> 127.0.0.1:8080
  -> /api/v1/prover/*   -> 127.0.0.1:8081
  -> /api/v1/jupyter/*  -> 127.0.0.1:8888
  -> /api/v1/gateway/*  -> 127.0.0.1:18900
  -> /api/v1/arxiv/*    -> 127.0.0.1:8082
  -> /api/v1/health     -> aggregated health check
```

### Runtime Components

| Component | Purpose |
|---|---|
| `Dockerfile.openclaw` | Builds the OpenClaw-based runtime image |
| `gateway/container-gateway.mjs` | Unified reverse proxy + health + stats |
| `config/openclaw.json` | OpenClaw runtime config template |
| `docker-entrypoint-openclaw.sh` | Startup orchestration inside container |
| `scripts/bootstrap-workspace.sh` | Workspace bootstrapping |

---

## Directory Layout

```text
docker/
├── base/                        # Base image Dockerfiles and base services
├── config/                      # OpenClaw config + workspace template files
├── gateway/                     # container-gateway runtime
├── plugin/
│   └── prismer-workspace/       # Workspace tools plugin
├── scripts/                     # bootstrap + prismer-tools utilities
├── templates/                   # Persona and skill templates
├── Dockerfile.openclaw          # OpenClaw image layer
├── docker-compose.openclaw.yml  # Full container stack
├── docker-compose.dev.yml       # Local dev compose
├── docker-compose.lite.yml      # Lite mode compose
├── VERSIONS.md                  # Version tracking policy
└── versions-manifest.json       # Machine-readable version manifest
```

---

## Quick Start

### Prerequisites

- Docker with Compose plugin
- `.env` at repo root (`../.env` from `docker/`)
- Required model credentials (for your selected provider)

### 1. Full OpenClaw Runtime

```bash
cd docker
docker compose -f docker-compose.openclaw.yml up --build -d
```

### 2. Local Development Runtime

```bash
cd docker
docker compose -f docker-compose.dev.yml up --build -d
```

### 3. Health Check

```bash
curl http://localhost:16888/api/v1/health
curl http://localhost:16888/api/v1/health/gateway
```

---

## Gateway API Routes

| Route | Target |
|---|---|
| `GET /` | Gateway info and route metadata |
| `GET /api/v1/health` | Aggregated health status |
| `GET /api/v1/health/:service` | Per-service health status |
| `ANY /api/v1/latex/*` | LaTeX service (`:8080`) |
| `ANY /api/v1/prover/*` | Prover service (`:8081`) |
| `ANY /api/v1/jupyter/*` | Jupyter service (`:8888`) |
| `ANY /api/v1/gateway/*` | OpenClaw Gateway (`:18900`) |
| `ANY /api/v1/arxiv/*` | arXiv conversion service (`:8082`) |
| `GET /api/v1/stats` | Gateway traffic/runtime stats |

---

## Environment Variables

Most variables are read from `../.env` by compose.

### Common Runtime Variables

| Variable | Description |
|---|---|
| `OPENCLAW_GATEWAY_TOKEN` | Gateway auth token |
| `OPENAI_API_KEY` | OpenAI API key (if OpenAI model path is used) |
| `ANTHROPIC_API_KEY` | Anthropic API key (if Anthropic model path is used) |
| `OPENAI_API_BASE_URL` | Optional model gateway base URL override |
| `AGENT_DEFAULT_MODEL` | Default model name |

### IM-related Variables (still referenced by compose/config)

| Variable | Description |
|---|---|
| `PRISMER_IM_SERVER_URL` | IM server URL |
| `PRISMER_CONVERSATION_ID` | Conversation binding id |
| `PRISMER_AGENT_TOKEN` | Agent token for IM channel |
| `PRISMER_API_BASE_URL` | Web API base URL from container context |
| `PRISMER_AGENT_ID` | Agent identity label |

---

## Versions and Source of Truth

- Human-readable version notes: `docker/VERSIONS.md`
- Machine-readable manifest: `docker/versions-manifest.json`
- Compatibility matrix: `docker/compatibility.json`

Current manifest entries include:

- `baseVersion`: `5.0`
- `imageVersion`: `5.0`
- `prismer-workspace`: `0.5.0`
- `container-gateway`: `1.1.0`
- `prismer-tools`: `0.1.0`
- `prismer-im`: `0.2.0` (manifest/config reference; plugin source currently missing)

---

## Build and Smoke Test

### Build Image

```bash
cd docker
docker compose -f docker-compose.openclaw.yml build
```

### Start Runtime

```bash
docker compose -f docker-compose.openclaw.yml up -d
```

### Run Integration Smoke Script

```bash
cd docker
./test-openclaw.sh test
```

Available helper commands:

```bash
./test-openclaw.sh build
./test-openclaw.sh up
./test-openclaw.sh logs
./test-openclaw.sh down
./test-openclaw.sh all
```

---

## Troubleshooting

### 1) Build fails with missing `docker/plugin/prismer-im`

Cause: Docker/config still references `prismer-im`, but plugin source directory is not present.

What to do:

1. Restore the `prismer-im` plugin source directory, or
2. Remove/replace `prismer-im` references in:
   - `Dockerfile.openclaw`
   - `config/openclaw.json`
   - `docker-entrypoint-openclaw.sh`
   - `versions-manifest.json` and related docs

### 2) `GET /api/v1/health` is degraded

- Check container logs:

```bash
docker logs --tail 200 prismer-agent
```

- Verify each service endpoint through gateway.

### 3) Gateway route works but app cannot connect

- Confirm host port mapping (`16888:3000`) in compose.
- Confirm `CONTAINER_GATEWAY_URL` in web `.env` points to `http://localhost:16888`.

---

## Change Management

Before changing container behavior:

1. Update config/templates under `docker/config/` or `docker/templates/`.
2. Update version manifests when component versions change.
3. Re-run smoke checks (`test-openclaw.sh test`).
4. Keep `docker/VERSIONS.md` and this README aligned with runtime reality.

---

## Related Docs

- [`docker/VERSIONS.md`](./VERSIONS.md)
- [`docker/gateway/README.md`](./gateway/README.md)
- [`docker/plugin/prismer-workspace/README.md`](./plugin/prismer-workspace/README.md)
- [`docker/scripts/prismer-tools/README.md`](./scripts/prismer-tools/README.md)
- [`docs/architecture.md`](../docs/architecture.md)
- [`docs/RUNBOOK.md`](../docs/RUNBOOK.md)
