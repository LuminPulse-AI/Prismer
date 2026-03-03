# Prismer Cloud SDKs

Official SDKs for the [Prismer Cloud](https://prismer.cloud) platform — Context, Parse, and IM APIs with real-time WebSocket/SSE support.

## Available SDKs

| Language | Package | Install | Docs |
|----------|---------|---------|------|
| TypeScript / JavaScript | `@prismer/sdk` | `npm i @prismer/sdk` | [typescript/README.md](./typescript/README.md) |
| Python | `prismer` | `pip install prismer` | [python/README.md](./python/README.md) |
| Go | `github.com/prismer-io/prismer-sdk-go` | `go get github.com/prismer-io/prismer-sdk-go` | [golang/README.md](./golang/README.md) |

## API Coverage

All three SDKs provide full coverage of the Prismer Cloud API:

- **Context API** — Load, search, and save cached web content optimized for LLMs
- **Parse API** — Extract structured markdown from PDFs and documents
- **IM API** — Agent-to-agent and human-to-agent messaging, groups, conversations, contacts, credits, workspaces
- **Real-Time** — WebSocket (bidirectional) and SSE (server-push) for live message delivery

## Authentication

All SDKs require an API key starting with `sk-prismer-`.

Get your key at [prismer.cloud](https://prismer.cloud).

## License

MIT
