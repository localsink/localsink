import { once } from 'node:events';
import { format } from 'node:util';

import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';

import { createApp } from './app.ts';
import { initializeDatabase } from './database.ts';
import type { Database } from './database.ts';

export interface StartServerOptions {
  /** Port to bind. Pass `0` to let the OS pick a free one. */
  port: number;
  /** libSQL database file, e.g. `file:localsink.db` or `:memory:`. */
  dbFileName: string;
  /** Directory holding the built SPA. Omitted in dev, where Vite serves it. */
  staticDir?: string;
}

export interface ServerHandle {
  /** Origin the server is reachable at, e.g. `http://localhost:3000`. */
  url: string;
  /** The port actually bound, which differs from the request when it was `0`. */
  port: number;
  db: Database;
  /** Stops the server and closes the database. Safe to call more than once. */
  close: () => Promise<void>;
}

/**
 * A host a client can actually dial. The wildcard addresses a bound server
 * reports (`::`, `0.0.0.0`) are not routable, and bare IPv6 literals need
 * brackets to be legal in a URL.
 */
function displayHost(address: string): string {
  if (address === '::' || address === '0.0.0.0' || address === '') {
    return 'localhost';
  }
  return address.includes(':') ? `[${address}]` : address;
}

/**
 * Deliberately free of CLI advice, since the caller may not be the CLI. The
 * original errno is kept on `cause` so callers can still branch on it.
 */
function startupError(port: number, error: unknown): Error {
  if (
    error instanceof Error &&
    'code' in error &&
    error.code === 'EADDRINUSE'
  ) {
    return new Error(`Port ${String(port)} is already in use.`, {
      cause: error,
    });
  }
  return new Error(`Failed to start server: ${format(error)}`, {
    cause: error,
  });
}

async function stop(server: ServerType, db: Database): Promise<void> {
  const closed = server[Symbol.asyncDispose]();
  // `close` waits out every in-flight request, and an MCP stream never ends on
  // its own, so a client attached to /mcp would otherwise block shutdown. Node
  // documents calling this *after* `close`, so no connection accepted in
  // between can outlive it.
  if ('closeAllConnections' in server) {
    server.closeAllConnections();
  }
  await closed;
  db.close();
}

/**
 * Boots the API, MCP endpoint and (when `staticDir` is given) the SPA.
 *
 * Rejects rather than exiting, and installs no signal handlers: the caller owns
 * process lifetime.
 */
export async function startServer(
  options: StartServerOptions,
): Promise<ServerHandle> {
  const { port, dbFileName, staticDir } = options;

  let db: Database;
  try {
    db = await initializeDatabase(dbFileName);
  } catch (error) {
    throw new Error(`Failed to initialize database: ${format(error)}`, {
      cause: error,
    });
  }

  let server: ServerType;
  try {
    const app = createApp(db, staticDir ? { staticDir } : {});
    server = serve({ fetch: app.fetch, port });
    // A failed bind emits 'error' in place of 'listening'; `once` rejects on
    // that and detaches both listeners either way.
    await once(server, 'listening');
  } catch (error) {
    try {
      db.close();
    } catch {
      // The startup failure is the interesting error; don't let cleanup mask it.
    }
    throw startupError(port, error);
  }

  const address = server.address();
  const bound =
    typeof address === 'object' && address !== null ? address : null;

  let stopping: Promise<void> | undefined;

  return {
    url: `http://${displayHost(bound?.address ?? '')}:${String(bound?.port ?? port)}`,
    port: bound?.port ?? port,
    db,
    close: () => {
      stopping ??= stop(server, db);
      return stopping;
    },
  };
}
