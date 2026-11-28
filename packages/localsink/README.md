# localsink

The localsink server: HTTP + MCP API for ingesting and querying logs, backed by SQLite (libSQL) with FTS5 full-text search.

For an overview, the logger integrations and editions, see the
[main README](https://github.com/localsink/localsink#readme).

## Run the server

Requires Node.js 24 or later.

```sh
npx localsink
```

This serves the UI, the REST API and the MCP endpoint on a single origin at
`http://localhost:3000`, creating and migrating `localsink.db` in the working
directory if it isn't there yet.

To run it from a clone of the repository, see
[Development](https://github.com/localsink/localsink#development).

### Options

Flags win over the environment, which wins over the default.

| Flag              | Env                     | Default             | Description                                                            |
| ----------------- | ----------------------- | ------------------- | ---------------------------------------------------------------------- |
| `--port`, `-p`    | `PORT`                  | `3000`              | HTTP port to bind.                                                     |
| `--host`          | `HOST`                  | `127.0.0.1`         | Address to bind.                                                       |
| `--db`, `-d`      | `DB_FILE_NAME`          | `file:localsink.db` | Path to the SQLite database file.                                      |
| `--version`, `-v` | —                       | —                   | Print the version.                                                     |
| `--help`, `-h`    | —                       | —                   | Print usage.                                                           |
| —                 | `LOCALSINK_LICENSE_KEY` | —                   | Commercial license key. See [Commercial license](#commercial-license). |

A `.env` file in the working directory is auto-loaded via `process.loadEnvFile()`.

### Reaching localsink from elsewhere

By default localsink listens on `127.0.0.1` only, so nothing beyond your machine
can reach it. To reach it from a Docker container, a devcontainer or another
machine, or to run localsink itself in a container, bind every interface:

```sh
npx localsink --host 0.0.0.0
```

Anyone who can reach that address can then read and write your logs.

### Commercial license

localsink runs as the Community Edition until you add a commercial license key.
Click **Community Edition** in the top bar of the UI and paste your key.
localsink saves it in your user config directory, so it covers every project on
that machine.

In a container, or anywhere else without a persistent home directory, set
`LOCALSINK_LICENSE_KEY` instead (a `.env` file works too). localsink then keeps
the key in memory, never reads or writes a saved key, and checks it each time it
starts. While the variable is set, the key can't be changed or removed from the
UI.

Without a key, localsink makes no network calls to us. With one, it validates
the key when you enter it and about once a week afterward. The
[privacy notice](https://localsink.io/privacy) lists exactly what is sent.

#### Behind a proxy

Node's `fetch` ignores `HTTPS_PROXY` unless its proxy support is turned on. If
localsink can only reach the internet through a proxy, set both:

```sh
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://proxy.example.com:8080 npx localsink
```

These must be real environment variables, not `.env` entries: Node reads its
proxy settings at startup, before localsink loads `.env`.

### Browsers

Your logs shouldn't be readable by whatever website you happen to have open, so
only `POST /api/logs` is shared with other origins (via CORS), so browser apps
can send logs. Every other route answers web pages on its own origin only, and
a form-style write (a form post, or a `text/plain` or bodyless `fetch`) from a
page on another origin gets `403` from Hono's
[CSRF middleware](https://hono.dev/docs/middleware/builtin/csrf). Requests that
don't come from a browser (the transports, MCP clients) are unaffected, as long
as they send a JSON `Content-Type`. The middleware treats a request with no
`Content-Type` as `text/plain`, so a bodyless `curl -X POST` or `-X DELETE`
also gets `403` unless you add `-H 'Content-Type: application/json'`.

Responses also carry Hono's
[secure headers](https://hono.dev/docs/middleware/builtin/secure-headers), so
other sites can't frame the UI (`X-Frame-Options: SAMEORIGIN`).

While bound to loopback, the server also answers only requests addressed to
`localhost`, `127.0.0.1` or `[::1]`, which defeats DNS rebinding. Binding
another address with `--host` lifts that check, since the server is then meant
to be reached by other names.

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

console.log(server.url); // http://127.0.0.1:54321

await server.close();
```

If you are writing tests, prefer [`@localsink/test-harness`](../test-harness),
which wraps this and registers teardown for you.

### `startServer(options): Promise<ServerHandle>`

| Option       | Type              | Description                                                                                                         |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `port`       | `number`          | Port to bind. `0` lets the OS pick a free one.                                                                      |
| `host`       | `string?`         | Address to bind (default `127.0.0.1`). See [Reaching localsink from elsewhere](#reaching-localsink-from-elsewhere). |
| `dbFileName` | `string`          | libSQL database file, e.g. `file:localsink.db` or `:memory:`.                                                       |
| `staticDir`  | `string?`         | Directory holding a built SPA. Omit to serve the API and MCP endpoints.                                             |
| `license`    | `LicenseManager?` | From `openLicenseManager`. Serves the [license routes](#license-routes); the server closes it on shutdown.          |

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

| Export                                           | Description                                                     |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `createApp(db, options?)`                        | The Hono app, if you want to mount it yourself.                 |
| `openLicenseManager(options)`                    | Opens the license manager that the CLI passes to `startServer`. |
| `initializeDatabase(dbFileName?)`                | Opens and migrates a database, returning a `Database`.          |
| `makeDatabase(drizzleClient)`                    | Wraps an existing Drizzle client in the `Database` API.         |
| `applySchema(db)`                                | Applies the schema and migrations to a Drizzle client.          |
| `InvalidQueryError`                              | Thrown for mutually exclusive query params; maps to `400`.      |
| `DEFAULT_PORT`, `DEFAULT_HOST`                   | `3000` and `127.0.0.1`.                                         |
| `DEFAULT_DB_FILE_NAME`                           | `file:localsink.db`.                                            |
| `DEFAULT_SERVER_URL`                             | `http://localhost:3000`.                                        |
| `logsQuerySchema`                                | Zod schema for `GET /api/logs` query params.                    |
| `Database`, `ServerHandle`, `StartServerOptions` | Types for the above.                                            |
| `CreateAppOptions`                               | Options accepted by `createApp`.                                |
| `LicenseManager`, `LicenseManagerOptions`        | Types for `openLicenseManager`.                                 |
| `LogFilter`, `LogMeta`, `LogPage`, `LogRow`      | Wire types, re-exported so you needn't depend on the contract.  |

## REST API

All endpoints return JSON. Request bodies are validated against the [`@localsink/contract`](../contract) schemas; validation failures return `400` with `{ error, issues }`.

### `POST /api/logs`

Ingest a single log. Body must match `ingestPayloadSchema`. Returns `201` with an empty body. The only endpoint open to other origins, so browser apps can send logs.

### `GET /api/logs`

Query logs with optional filters. Different params are AND-ed together.
`service_name` and `level` accept several values (repeat the param or
comma-separate them, e.g. `level=warn,error`), which are OR-ed.

| Param          | Description                                                            |
| -------------- | ---------------------------------------------------------------------- |
| `service_name` | Exact match on any of the given values.                                |
| `level`        | Exact match on any of the given values.                                |
| `logger`       | Exact match.                                                           |
| `trace_id`     | Exact match.                                                           |
| `span_id`      | Exact match.                                                           |
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

### License routes

The UI's edition dialog uses these. The CLI always serves them. `startServer`
and `createApp` serve them only when given a `license` option. Responses use
the `LicenseStatus` and `LicenseActivation` schemas from
[`@localsink/contract`](../contract).

| Route                     | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `GET /api/license`        | Current edition and key status.                                          |
| `PUT /api/license`        | Activate a key: `{ "key": "…" }`. Returns `{ outcome, reason, status }`. |
| `POST /api/license/check` | Check the saved key against the licensing service now.                   |
| `DELETE /api/license`     | Remove the saved key and return to the Community Edition.                |

While `LOCALSINK_LICENSE_KEY` is set, `PUT` and `DELETE` return `409`, because
the key comes from the environment.

## Full-text search (`q`)

The `q` param runs an FTS5 query against an index built recursively from `message`, the `error` JSON, and the `attributes` JSON — including attribute **keys**. Supported syntax:

| Form         | Example                                                          |
| ------------ | ---------------------------------------------------------------- |
| prefix       | `err*`                                                           |
| phrase       | `"failed connection"`                                            |
| boolean      | `error AND timeout`, `foo OR bar`, `error NOT debug`             |
| column scope | `message:login`, `error_text:timeout`, `attributes_text:user_id` |

If `q` isn't valid FTS5 syntax (for example, free text with punctuation such
as `GET /health`), it's retried as a literal phrase instead of returning an
error.

## MCP endpoint

`ALL /mcp` exposes a [Model Context Protocol](https://modelcontextprotocol.io) server over Streamable HTTP, with three tools mirroring the REST API:

- `describe_logs` → same as `GET /api/logs/meta`
- `search_logs` → same as `GET /api/logs`
- `get_log_by_id` → same as `GET /api/logs/:id`

Point an MCP client that supports Streamable HTTP at `http://localhost:3000/mcp` to let an LLM search your logs. With Claude Code:

```sh
claude mcp add --transport http localsink http://localhost:3000/mcp
```

Browser-based MCP clients on another origin can't reach it (see [Browsers](#browsers)).
