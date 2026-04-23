# Self-Hosting Prismer

This guide helps you choose the right deployment option for your situation.

## Decision Tree

Are you a single researcher running Prismer on your own laptop?
- Yes, and I want to develop or modify the frontend -> [Local Development](local-dev.md)
- Yes, I just want to run it -> [Single Container](single-container.md)

Are you deploying for a lab or team on a dedicated server?
- Yes -> [Full Stack Deployment](full-stack.md)

## Deployment Options at a Glance

| Option | Compose File | Frontend | Agent | Best For |
|--------|-------------|----------|-------|----------|
| [Local Dev](local-dev.md) | `docker-compose.dev.yml` | Host (npm run dev) | Container | Frontend development |
| [Single Container](single-container.md) | `docker-compose.lite.yml` | Container | Container | Personal use, quick setup |
| [Full Stack](full-stack.md) | `docker-compose.openclaw.yml` | Container | Container | Lab servers, shared deployment |

## Prerequisites (All Options)

- Docker 24+ with Docker Compose v2
- An OpenAI-compatible API key (OpenAI, Azure, vLLM, Ollama, LiteLLM)
- The Prismer repository cloned locally

## Environment Setup (Common First Step)

All deployment options share the same `.env` file at the repository root:

```bash
cd /path/to/Prismer
cp .env.example .env
```

Edit `.env` and set at minimum:

```
OPENAI_API_KEY=sk-your-api-key-here
NEXTAUTH_SECRET=<output of: openssl rand -base64 32>
```

See `.env.example` for the full list of options.

## Optional OCR Provider

Prismer can now import PDFs into the local paper library through `POST /api/papers/upload`.

Local-only behavior:
- Uploaded PDFs are stored under `web/data/ocr/<paperId>/`.
- If no OCR provider is configured, the paper still opens in raw PDF mode.

Volcengine OCR behavior:
- Set `VOLCENGINE_LAS_API_KEY` to enable Volcengine LAS PDF parsing.
- Set `PUBLIC_APP_URL` when your self-hosted Prismer instance is reachable from the public internet.
- Prismer will save the uploaded PDF locally, ask Volcengine to parse `PUBLIC_APP_URL/api/ocr/<paperId>/pdf`, then write:
  - `metadata.json`
  - `ocr_result.json`
  - `detections.json`
  - `paper.md`

Notes:
- If the server is only reachable on `localhost`, Volcengine OCR is skipped unless you import from a public `sourceUrl`.
- The current Volcengine integration is the first self-host pass: Markdown and text-block detections are normalized into Prismer’s local OCR dataset format.
- Imported papers are also registered into the local asset library as `paper` assets, so they show up in `Asset Browser` and reopen through the OCR-backed PDF route.
- When the import is launched from a real workspace session, the uploaded paper is also linked into that workspace’s collection.
- If Volcengine returns figure image URLs, Prismer now downloads them into `web/data/ocr/<paperId>/images/*` and rewrites detection `image_path` to local files.

Validation:

```bash
cd web
npm run test:self-host-ocr
npm run test:self-host-ocr-ui
```

This smoke test covers `POST /api/papers/upload`, workspace collection binding, asset registration, paper listing through `/api/papers`, asset listing through `/api/v2/assets`, local OCR file reads through `/api/ocr/*`, and localized `images/*` output with a mocked Volcengine `submit/poll` flow.

The browser E2E covers the user-visible path through the workspace UI:
- open `/workspace`
- dismiss the readiness gate
- switch to the `Reader` tab
- import a PDF from `Paper Library`
- reopen the imported paper from `Asset Browser`

Both `npm run test:self-host-ocr` and `npm run test:self-host-ocr-ui` are wired into `.github/workflows/ci.yml` as dedicated self-host validation jobs.

## Port Reference

| Port | Service | Notes |
|------|---------|-------|
| 3000 | Next.js frontend | All options except local-dev |
| 16888 | Container gateway | Unified entry point for agent services |
| 18888 | Jupyter | Direct access in single-container mode |
| 18080 | LaTeX | Direct access in single-container mode |

## Troubleshooting

See [troubleshooting.md](troubleshooting.md) for common issues across all deployment options.
