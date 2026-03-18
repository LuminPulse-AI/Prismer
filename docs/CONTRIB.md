# Development Guide

> Detailed development workflow for Prismer.AI contributors. For quick-start contribution guidelines, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

- **Node.js 18+** (recommended: Node 20 LTS via [nvm](https://github.com/nvm-sh/nvm))
- **Docker** (for agent container)
- **Git**

## Environment Setup

```bash
# 1. Clone and enter web directory
git clone https://github.com/Prismer-AI/Prismer.git
cd Prismer/web

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.docker.example .env
# Edit .env and set your OPENAI_API_KEY

# 4. Initialize database (SQLite for local dev)
npm run db:generate
npm run db:push

# 5. Start dev server
npm run dev
```

Open http://localhost:3000.

### With Agent Container (optional)

To enable the full agent experience (LaTeX compilation, Jupyter, Prover):

```bash
# In a separate terminal
docker compose -f docker/docker-compose.dev.yml up
```

This starts the OpenClaw agent container on port 16888. The frontend connects to it via `CONTAINER_GATEWAY_URL=http://localhost:16888` in `.env`.

## Environment Variables

### Required

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | LLM provider API key | — |
| `DATABASE_URL` | Database connection string | `file:./prisma/dev.db` |

### Optional: LLM Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_BASE_URL` | LLM API base URL | `https://api.openai.com/v1` |
| `AGENT_DEFAULT_MODEL` | Server-side default model | `gpt-4o` |
| `NEXT_PUBLIC_OPENAI_API_KEY` | Client-side AI key (PDF reader) | — |
| `NEXT_PUBLIC_OPENAI_API_BASE_URL` | Client-side API base URL | `https://api.openai.com/v1` |
| `NEXT_PUBLIC_AGENT_DEFAULT_MODEL` | Client-side default model | `gpt-4o-mini` |

### Optional: Data Source

| Variable | Description | Default |
|----------|-------------|---------|
| `USE_REMOTE_PAPERS` | Enable remote paper database | `false` |
| `REMOTE_MYSQL_HOST` | MySQL host for paper data | — |
| `REMOTE_MYSQL_PORT` | MySQL port | `3306` |
| `REMOTE_MYSQL_USER` | MySQL user | — |
| `REMOTE_MYSQL_PASSWORD` | MySQL password | — |
| `REMOTE_MYSQL_DATABASE` | MySQL database name | — |

### Optional: Storage & CDN

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | S3 access key | — |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key | — |
| `AWS_REGION` | S3 region | `us-east-1` |
| `AWS_S3_BUCKET` | S3 bucket name | — |
| `CDN_DOMAIN` | CDN domain for paper assets | — |

### Optional: Agent Container

| Variable | Description | Default |
|----------|-------------|---------|
| `STATIC_AGENT_ENABLED` | Enable static agent binding | `true` |
| `STATIC_AGENT_ID` | Agent identifier | `default` |
| `STATIC_AGENT_CONTAINER_ID` | Docker container name | `prismer-agent` |
| `CONTAINER_GATEWAY_URL` | Container gateway URL | `http://localhost:16888` |

### Optional: Dev

| Variable | Description | Default |
|----------|-------------|---------|
| `DEV_USER_EMAIL` | Default dev user email | `dev@localhost` |

## Available Scripts

### Frontend (`web/`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev` | Development server with hot reload |
| `build` | `prisma generate && next build` | Production build (standalone output) |
| `start` | `next start` | Production server |
| `lint` | `eslint` | Run ESLint checks |

### Database (`web/`)

| Script | Command | Description |
|--------|---------|-------------|
| `db:generate` | `prisma generate` | Generate Prisma Client to `src/generated/prisma/` |
| `db:push` | `prisma db push` | Push schema changes to database |
| `db:migrate` | `prisma migrate dev` | Create and apply migration |
| `db:studio` | `prisma studio` | Open Prisma visual database browser |

### Testing (`web/`)

| Script | Command | Description |
|--------|---------|-------------|
| `test` | `vitest run` | Run all unit tests (single run) |
| `test:unit` | `vitest run` | Alias for `test` |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:coverage` | `vitest run --coverage` | Run tests with coverage report |
| `test:e2e` | `playwright test` | Run all Playwright E2E tests |
| `test:layer1` | `playwright test --project=layer1` | E2E: container + plugin + API (real agent) |
| `test:layer2` | `playwright test --project=layer2` | E2E: mock frontend rendering + trace |
| `test:layer3` | `playwright test --project=layer3` | E2E: full end-to-end, no mocks + trace |
| `test:report` | `playwright show-report tests/output/reports` | Show Playwright HTML report |

### Utility (`web/`)

| Script | Command | Description |
|--------|---------|-------------|
| `sync:server` | `tsx scripts/sync-server.ts` | WebSocket agent sync server (port 3456) |
| `verify:s3` | `tsx scripts/verify-s3.ts` | Verify S3 connectivity |
| `verify:all` | `npm run verify:s3` | Run all verification checks |

### SDK (`sdk/typescript/`)

| Script | Command | Description |
|--------|---------|-------------|
| `build` | `tsup` | Build CJS + ESM + type declarations |
| `dev` | `tsup ... --watch` | Watch mode build |
| `test` | `vitest` | Run SDK tests |
| `lint` | `eslint src/` | Lint SDK source |

## Testing

### Unit Tests (Vitest)

```bash
cd web

# Run all unit tests
npm test

# Run a specific test file
npx vitest run src/lib/sync/__tests__/SyncMatrixEngine.test.ts

# Run tests matching a pattern
npx vitest run -t "workspace"

# Watch mode
npm run test:watch
```

### E2E Tests (Playwright)

E2E tests are organized in three layers with increasing scope:

- **Layer 1** — Container + Plugin + API: Tests with a real running agent container
- **Layer 2** — Mock frontend rendering: Tests UI rendering with mock data, captures traces
- **Layer 3** — Full E2E: Complete user flows with no mocks, captures traces

```bash
cd web

# Run all E2E tests
npm run test:e2e

# Run a single layer
npm run test:layer1

# View the HTML report
npm run test:report
```

Test output is written to `tests/output/` (gitignored).

## Docker Profiles

| Profile | File | Use Case | Exposed Ports |
|---------|------|----------|---------------|
| Dev | `docker-compose.dev.yml` | Agent container only, frontend runs locally | 16888 (gateway) |
| Lite | `docker-compose.lite.yml` | Single container, all services | 16888, 18888 (Jupyter), 18080 (LaTeX) |
| Full | `docker-compose.openclaw.yml` | Full OpenClaw setup with all services | 16888 |

## Commit Convention

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example: `feat(workspace): add agent template selection`
