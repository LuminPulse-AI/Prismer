#!/bin/bash
# ============================================================
# Prismer OpenClaw — Container Entrypoint
# ============================================================
#
# Starts all services:
#   1. LaTeX Server       (:8080)
#   2. Prover Server      (:8081)
#   3. arXiv Server       (:8082)
#   4. Jupyter Server     (:8888, internal)
#   5. OpenClaw Gateway   (:18900, loopback)
#   6. Container Gateway  (:3000, external-facing)
#
# ============================================================

set -e

# ── Colors ──
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# ── Configuration ──
CONTAINER_GATEWAY_PORT="${CONTAINER_GATEWAY_PORT:-3000}"
LATEX_PORT="${LATEX_PORT:-8080}"
PROVER_PORT="${PROVER_PORT:-8081}"
ARXIV_PORT="${ARXIV_PORT:-8082}"
JUPYTER_PORT="${JUPYTER_PORT:-8888}"
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18900}"
WORKSPACE="/workspace"
OPENCLAW_HOME="${HOME}/.openclaw"
JUPYTER_TOKEN="${JUPYTER_TOKEN:-prismer-jupyter-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')}"

export JUPYTER_TOKEN

# ── Detect LAN IP ──
get_lan_ip() {
  local ip=""
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [ -z "$ip" ] && ip=$(ip -4 addr show scope global 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1)
  [ -z "$ip" ] && ip="localhost"
  echo "$ip"
}

LAN_IP=$(get_lan_ip)

# ── Banner ──
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     ${CYAN}Prismer Academic Platform + OpenClaw${NC}${BOLD}           ║${NC}"
echo -e "${BOLD}╠════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║${NC}                                                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  ${GREEN}Gateway:${NC}  http://${LAN_IP}:${CONTAINER_GATEWAY_PORT}              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                    ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}  Services:                                         ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}    LaTeX    :${LATEX_PORT}  |  Prover  :${PROVER_PORT}              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}    arXiv    :${ARXIV_PORT}  |  Jupyter :${JUPYTER_PORT}              ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}    OpenClaw :${OPENCLAW_GATEWAY_PORT}                                ${BOLD}║${NC}"
echo -e "${BOLD}║${NC}                                                    ${BOLD}║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Ensure service directories exist with correct ownership ──
mkdir -p /home/user/cache/latex /home/user/cache/pip /home/user/cache/huggingface \
         /home/user/output/proofs /home/user/output/charts /home/user/output/data \
         /home/user/output/reports /home/user/output/code /home/user/output/figures \
         /home/user/.local/share/jupyter/runtime \
         /home/user/.local/bin \
         /home/user/.config/matplotlib /home/user/.config/jupyter \
         2>/dev/null || true

# ── Initialize workspace ──
init_workspace() {
  echo -e "${CYAN}[init]${NC} Initializing workspace..."

  mkdir -p "${WORKSPACE}"/{projects,notebooks,output,skills}
  mkdir -p "${OPENCLAW_HOME}/workspace"
  mkdir -p "${OPENCLAW_HOME}/.openclaw"

  # Symlink OpenClaw home
  if [ ! -e "${HOME}/.openclaw" ] && [ "${OPENCLAW_HOME}" != "${HOME}/.openclaw" ]; then
    ln -sfn "${OPENCLAW_HOME}" "${HOME}/.openclaw"
  fi

  # Git defaults
  if ! git config --global user.email &>/dev/null; then
    git config --global user.email "user@prismer.local"
    git config --global user.name "Prismer User"
    git config --global init.defaultBranch main
  fi

  # Bootstrap workspace templates (if bootstrap script exists)
  if [ -x /opt/prismer/scripts/bootstrap-workspace.sh ]; then
    /opt/prismer/scripts/bootstrap-workspace.sh
  fi

  local model_api_key="${OPENAI_API_KEY:-}"
  local model_base_url="${OPENAI_API_BASE_URL:-https://api.openai.com/v1}"
  local default_model="${AGENT_DEFAULT_MODEL:-gpt-4o}"
  local im_server_url="${PRISMER_IM_SERVER_URL:-}"
  local agent_token="${PRISMER_AGENT_TOKEN:-}"
  local conversation_id="${PRISMER_CONVERSATION_ID:-workspace-default}"
  local api_base_url="${PRISMER_API_BASE_URL:-http://host.docker.internal:3000}"
  local agent_id="${PRISMER_AGENT_ID:-${AGENT_ID:-default}}"

  if [ -z "${model_api_key}" ]; then
    echo -e "${YELLOW}[warn]${NC} OPENAI_API_KEY is empty. Agent replies may fail with 401."
  fi

  # Render runtime config to the effective OpenClaw path used by gateway runtime.
  cat > "${OPENCLAW_HOME}/.openclaw/openclaw.json" <<EOF
{
  "gateway": {
    "port": 18900,
    "mode": "local"
  },
  "models": {
    "providers": {
      "prismer-gateway": {
        "baseUrl": "${model_base_url}",
        "apiKey": "${model_api_key}",
        "api": "openai-completions",
        "models": [
          {"id": "gpt-4o", "name": "GPT-4o"},
          {"id": "gpt-4o-mini", "name": "GPT-4o Mini"}
        ]
      }
    }
  },
  "channels": {
    "prismer-im": {
      "accounts": {
        "default": {
          "imServerUrl": "${im_server_url}",
          "agentToken": "${agent_token}",
          "conversationId": "${conversation_id}"
        }
      }
    }
  },
  "agents": {
    "defaults": {
      "workspace": "/workspace",
      "model": {
        "primary": "prismer-gateway/${default_model}",
        "fallbacks": ["prismer-gateway/gpt-4o-mini"]
      },
      "thinkingDefault": "low",
      "timeoutSeconds": 600,
      "maxConcurrent": 3,
      "contextTokens": 200000
    },
    "list": [
      {
        "id": "academic",
        "default": true,
        "name": "Prismer Academic Assistant",
        "workspace": "/workspace",
        "identity": {
          "name": "Prismer",
          "theme": "academic research assistant",
          "emoji": "📚"
        },
        "tools": {
          "profile": "full"
        }
      }
    ]
  },
  "session": {
    "scope": "per-sender"
  },
  "tools": {
    "profile": "full"
  },
  "skills": {
    "allowBundled": ["*"],
    "load": {
      "extraDirs": ["/home/user/.openclaw/workspace/skills"]
    }
  },
  "plugins": {
    "enabled": true,
    "load": {
      "paths": [
        "/opt/prismer/plugins/prismer-im",
        "/opt/prismer/plugins/prismer-workspace"
      ]
    },
    "entries": {
      "prismer-im": {
        "enabled": true
      },
      "prismer-workspace": {
        "enabled": true,
        "config": {
          "apiBaseUrl": "${api_base_url}",
          "agentId": "${agent_id}"
        }
      }
    }
  },
  "logging": {
    "level": "info",
    "consoleLevel": "info"
  }
}
EOF

  echo -e "${GREEN}[init]${NC} Workspace ready."
}

init_workspace

# ── Start services ──
PIDS=()

# 1. LaTeX compile server
echo -e "${CYAN}[start]${NC} LaTeX server on :${LATEX_PORT}..."
python3 /home/user/.local/bin/latex-server.py --port "${LATEX_PORT}" &
PIDS+=($!)

# 2. Prover server (Lean4, Coq, Z3)
echo -e "${CYAN}[start]${NC} Prover server on :${PROVER_PORT}..."
python3 /home/user/.local/bin/prover-server.py --port "${PROVER_PORT}" &
PIDS+=($!)

# 3. arXiv paper server
echo -e "${CYAN}[start]${NC} arXiv server on :${ARXIV_PORT}..."
/usr/bin/python3 /home/user/.local/bin/arxiv-server.py &
PIDS+=($!)

# 4. Jupyter server (headless, internal only)
echo -e "${CYAN}[start]${NC} Jupyter server on :${JUPYTER_PORT} (internal)..."
jupyter server --no-browser \
  --port="${JUPYTER_PORT}" \
  --ip=127.0.0.1 \
  --ServerApp.token="${JUPYTER_TOKEN}" \
  --ServerApp.allow_remote_access=false \
  --ServerApp.log_level=WARN \
  2>&1 | sed 's/^/  [jupyter] /' &
PIDS+=($!)

# 5. OpenClaw Gateway (loopback — only accessible within container)
echo -e "${CYAN}[start]${NC} OpenClaw Gateway on :${OPENCLAW_GATEWAY_PORT}..."
export OPENCLAW_HOME
OPENCLAW_PID=""
if openclaw gateway run --allow-unconfigured --port "${OPENCLAW_GATEWAY_PORT}" --bind loopback 2>&1 | sed 's/^/  [openclaw] /' &
then
  OPENCLAW_PID=$!
  PIDS+=($!)
  sleep 3
else
  echo -e "${YELLOW}[warn]${NC} OpenClaw Gateway failed to start (config may be missing)"
fi

# 6. Container Gateway (external-facing unified proxy)
echo -e "${CYAN}[start]${NC} Container Gateway on :${CONTAINER_GATEWAY_PORT}..."
GATEWAY_PORT="${CONTAINER_GATEWAY_PORT}" JUPYTER_TOKEN="${JUPYTER_TOKEN}" \
  node /app/gateway/container-gateway.mjs &
GATEWAY_PID=$!
PIDS+=($!)

# ── Ready ──
sleep 2
echo ""
echo -e "${GREEN}[ready]${NC} All services started."
echo -e "${GREEN}[ready]${NC} Gateway at ${BOLD}http://${LAN_IP}:${CONTAINER_GATEWAY_PORT}/api/v1/health${NC}"
echo ""

# ── Graceful shutdown ──
cleanup() {
  echo ""
  echo -e "${YELLOW}[shutdown]${NC} Stopping services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null
  done
  wait 2>/dev/null
  echo -e "${GREEN}[done]${NC} Bye!"
  exit 0
}

trap cleanup SIGTERM SIGINT

# Keep alive — wait on the Container Gateway (critical service)
# OpenClaw Gateway may exit if unconfigured, which is non-fatal
wait "$GATEWAY_PID" 2>/dev/null
echo -e "${RED}[error]${NC} Container Gateway exited unexpectedly. Shutting down."
cleanup
