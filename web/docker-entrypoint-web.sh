#!/bin/sh
set -e

echo "[prismer-web] Starting Prismer Web..."

# Auto-initialize SQLite database on first run (copy pre-built template)
if echo "$DATABASE_URL" | grep -q "file:"; then
  DB_PATH=$(echo "$DATABASE_URL" | sed 's|file:||')
  if [ ! -f "$DB_PATH" ]; then
    echo "[prismer-web] SQLite database not found at $DB_PATH, initializing..."
    DB_DIR=$(dirname "$DB_PATH")
    mkdir -p "$DB_DIR"
    if [ -f ".template.db" ]; then
      cp .template.db "$DB_PATH"
      echo "[prismer-web] Database initialized from template."
    else
      echo "[prismer-web] Warning: .template.db not found, database not initialized."
    fi
  else
    echo "[prismer-web] SQLite database found at $DB_PATH"
  fi
fi

echo "[prismer-web] Starting Next.js server on port ${PORT:-3000}..."
exec node server.js
