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

## License & roadmap

`localsink` is **source-available** software — not open core. There are no artificial feature limitations and no enterprise-only forks; the full source code is available, and every user gets the full product. The licensing strategy is tuned so it's always free for personal, hobby, and open source use, while staying sustainable as a commercial product:

- **v0** (current): free for both non-commercial and commercial use under [BUSL-1.1](LICENSE). Automatically converts to **AGPLv3** on **2028-01-01**, so the v0 codebase eventually lands under an OSI-approved open source license.
- **v1+** (future): **PolyForm Noncommercial**. Commercial use will require a commercial license — funding continued development and giving teams a clear, standard agreement without AGPLv3 obligations. Personal, hobby, and open source use remain free.

> The v0 code (and any version released before the v1.0 milestone) will remain under the BUSL-1.1 terms — eventually becoming AGPLv3 — regardless of the license used for v1+.
