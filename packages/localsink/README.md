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

| Flag              | Env            | Default             | Description                       |
| ----------------- | -------------- | ------------------- | --------------------------------- |
| `--port`, `-p`    | `PORT`         | `3000`              | HTTP port to bind.                |
| `--db`, `-d`      | `DB_FILE_NAME` | `file:localsink.db` | Path to the SQLite database file. |
| `--version`, `-v` | —              | —                   | Print the version.                |
| `--help`, `-h`    | —              | —                   | Print usage.                      |

A `.env` file in the working directory is auto-loaded via `process.loadEnvFile()`.

`Ctrl-C` (or `SIGTERM`) shuts down cleanly, closing in-flight connections and the
database. A second `Ctrl-C` kills the process immediately.

## Programmatic use

`localsink` is also a library. `startServer` boots the same server the CLI runs,
but leaves process lifetime to you: it rejects instead of exiting, and installs
no signal handlers.

```ts
import { startServer } from 'localsink';

const server = await startServer({
  port: 0, // 0 lets the OS pick a free port
  dbFileName: ':memory:',
});

console.log(server.url); // http://localhost:54321

await server.close();
```

If you are writing tests, prefer [`@localsink/test-harness`](../test-harness),
which wraps this and registers teardown for you.

### `startServer(options): Promise<ServerHandle>`

| Option       | Type      | Description                                                             |
| ------------ | --------- | ----------------------------------------------------------------------- |
| `port`       | `number`  | Port to bind. `0` lets the OS pick a free one.                          |
| `dbFileName` | `string`  | libSQL database file, e.g. `file:localsink.db` or `:memory:`.           |
| `staticDir`  | `string?` | Directory holding a built SPA. Omit to serve the API and MCP endpoints. |

Resolves to a `ServerHandle`:

```ts
interface ServerHandle {
  url: string; // origin the server is reachable at
  port: number; // the port actually bound, which differs when 0 was requested
  db: Database; // the database backing the server
  close: () => Promise<void>; // stops the server and closes the db
}
```

`close()` is safe to call more than once, and forces open connections shut so a
client attached to `/mcp` can't block shutdown.

`startServer` rejects if the database can't be initialized or the port can't be
bound. The underlying error is preserved on `cause`, so callers can branch on
`error.cause.code === 'EADDRINUSE'`.

### Other exports

| Export                                           | Description                                                    |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `createApp(db, options?)`                        | The Hono app, if you want to mount it yourself.                |
| `initializeDatabase(dbFileName?)`                | Opens and migrates a database, returning a `Database`.         |
| `makeDatabase(drizzleClient)`                    | Wraps an existing Drizzle client in the `Database` API.        |
| `applySchema(db)`                                | Applies the schema and migrations to a Drizzle client.         |
| `InvalidQueryError`                              | Thrown for mutually exclusive query params; maps to `400`.     |
| `DEFAULT_PORT`, `DEFAULT_DB_FILE_NAME`           | `3000` and `file:localsink.db`.                                |
| `DEFAULT_SERVER_URL`                             | `http://localhost:3000`.                                       |
| `logsQuerySchema`                                | Zod schema for `GET /api/logs` query params.                   |
| `Database`, `ServerHandle`, `StartServerOptions` | Types for the above.                                           |
| `CreateAppOptions`                               | Options accepted by `createApp`.                               |
| `LogFilter`, `LogMeta`, `LogPage`, `LogRow`      | Wire types, re-exported so you needn't depend on the contract. |

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
