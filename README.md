# localsink

Local-first log sink with a searchable UI and API for developers.

## What it is

`localsink` is a local-first log sink with a searchable UI and API, built around one bet: **you find logs by filtering and searching, not by scrolling a mile back.** Every design decision serves that — bounded views, fast facets, full-text search, and a live tail you can pause and interrogate. Self-contained, no external infrastructure required.

In practice, many teams end up building internal tools to collect, inspect, and query logs during local development and testing. `localsink` is a more polished take on that problem.

## Packages

| Package                                            | Description                                               |
| -------------------------------------------------- | --------------------------------------------------------- |
| [`localsink`](packages/localsink)                  | The server: HTTP + MCP API, SQLite, FTS5 search           |
| [`@localsink/web`](packages/web)                   | React + Vite UI                                           |
| [`@localsink/sdk`](packages/sdk)                   | Programmatic client for sending logs                      |
| [`@localsink/http`](packages/http)                 | Low-level HTTP primitives                                 |
| [`@localsink/contract`](packages/contract)         | Shared wire schemas (Zod)                                 |
| [`@localsink/console`](packages/console)           | `console.*` transport                                     |
| [`@localsink/pino`](packages/pino)                 | [Pino](https://github.com/pinojs/pino) transport          |
| [`@localsink/winston`](packages/winston)           | [Winston](https://github.com/winstonjs/winston) transport |
| [`@localsink/test-harness`](packages/test-harness) | Vitest harness for custom transports                      |

## License

`localsink` is **source-available** software — not open core. There are no artificial feature limitations and no enterprise-only forks; the full source code is available, and every user gets the full product.

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE.md):

- **Free forever** for personal, hobbyist, student, academic, and open source use.
- **Commercial use requires a commercial license.** If you're using `localsink` for internal tooling at a company, in a paid product, or on a consulting deliverable, contact [licensing@localsink.io](mailto:licensing@localsink.io) to purchase a commercial license.
