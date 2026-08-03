# localsink

The localsink server: HTTP + MCP API for ingesting and querying logs, backed by SQLite (libSQL) with FTS5 full-text search.

## Run the server

```sh
npx localsink
```

This serves the UI, the REST API and the MCP endpoint on a single origin at
`http://localhost:3000`, creating and migrating `localsink.db` in the working
directory if it isn't there yet.

### From a clone

```sh
git clone https://github.com/localsink/localsink.git
cd localsink
pnpm install
pnpm --filter localsink dev   # API + MCP only; @localsink/web serves the UI
```

In dev the UI comes from Vite (`pnpm --filter @localsink/web dev`), which
proxies `/api` and `/mcp` here. The bundled UI is only served from a build,
where the assets sit next to the CLI in `dist/public`.

### Options

Flags win over the environment, which wins over the default.

| Flag           | Env            | Default             | Description                       |
| -------------- | -------------- | ------------------- | --------------------------------- |
| `--port`, `-p` | `PORT`         | `3000`              | HTTP port to bind.                |
| `--db`, `-d`   | `DB_FILE_NAME` | `file:localsink.db` | Path to the SQLite database file. |
| `--help`, `-h` | —              | —                   | Print usage.                      |

A `.env` file in the working directory is auto-loaded via `process.loadEnvFile()`.

## REST API

All endpoints return JSON. Request bodies are validated against the [`@localsink/contract`](../contract) schemas; validation failures return `400` with `{ error, issues }`.

### `POST /api/logs`

Ingest a single log. Body must match `ingestPayloadSchema`. Returns `201` with an empty body.

### `GET /api/logs`

Query logs with optional filters. All query params are AND-ed together.

| Param          | Description                                                            |
| -------------- | ---------------------------------------------------------------------- |
| `service_name` | Exact match.                                                           |
| `level`        | Exact match.                                                           |
| `logger`       | Exact match.                                                           |
| `trace_id`     | Exact match.                                                           |
| `from`         | Epoch ms, inclusive lower bound on `timestamp`.                        |
| `to`           | Epoch ms, exclusive upper bound on `timestamp`.                        |
| `q`            | FTS5 free-text query — see below.                                      |
| `limit`        | Max rows returned (default `50`, max `500`).                           |
| `cursor`       | Opaque keyset cursor from a prior response's `next_cursor`.            |
| `offset`       | Numeric offset.                                                        |
| `after_id`     | Forward-poll watermark: return only rows with `id > after_id`, id-ASC. |

`cursor`, `offset`, and `after_id` are **pairwise mutually exclusive**.

Default mode orders by `(timestamp DESC, id DESC)` and returns `next_cursor` for pagination back in time. `after_id` mode orders by `id ASC` for live-tail polling; `next_cursor` is always `null` and the client derives the next watermark from `data.at(-1).id`. Use `has_more` (not `next_cursor`) to detect truncation in `after_id` mode.

### `GET /api/logs/:id`

Fetch a single log by numeric ID. Returns `404` if not found.

### `GET /api/logs/meta`

Returns shape-of-DB metadata:

```ts
{
  total: number;
  services: string[];
  levels: string[];
  loggers: string[];
  timestamp_range: { min: number; max: number } | null;
}
```

## Full-text search (`q`)

The `q` param runs an FTS5 query against an index built recursively from `message`, the `error` JSON, and the `attributes` JSON — including attribute **keys**. Supported syntax:

| Form         | Example                                                          |
| ------------ | ---------------------------------------------------------------- |
| prefix       | `err*`                                                           |
| phrase       | `"failed connection"`                                            |
| boolean      | `error AND timeout`, `foo OR bar`, `NOT debug`                   |
| column scope | `message:login`, `error_text:timeout`, `attributes_text:user_id` |

Malformed FTS5 queries return `400` with the underlying parser error.

## MCP endpoint

`ALL /mcp` exposes a [Model Context Protocol](https://modelcontextprotocol.io) server over Streamable HTTP, with three tools mirroring the REST API:

- `describe_logs` → same as `GET /api/logs/meta`
- `search_logs` → same as `GET /api/logs`
- `get_log_by_id` → same as `GET /api/logs/:id`

Point an MCP-capable client (e.g. Claude Desktop) at `http://localhost:3000/mcp` to let an LLM search your logs.
