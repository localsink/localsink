import { format } from 'node:util';

import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { initializeDatabase } from './database.ts';
import type { Database } from './database.ts';

export interface StartServerOptions {
  port: number;
  dbFileName: string;
  /** Directory holding the built SPA. Omitted in dev, where Vite serves it. */
  staticDir?: string;
}

/**
 * Boots the database and HTTP server and installs signal handlers. Resolves
 * once the server is listening; the process then stays alive until a signal
 * arrives. Argument parsing lives in cli.ts so this stays callable in-process.
 */
export async function startServer(options: StartServerOptions): Promise<void> {
  const { port, dbFileName, staticDir } = options;

  let database: Database;
  try {
    database = await initializeDatabase(dbFileName);
  } catch (error) {
    process.stderr.write(`Failed to initialize database: ${format(error)}\n`);
    process.exit(1);
  }

  const app = createApp(database, staticDir ? { staticDir } : {});

  const server = serve({ fetch: app.fetch, port });

  const exit = () => {
    server.close((err) => {
      let exitCode = 0;
      if (err) {
        process.stderr.write(`${format(err)}\n`);
        exitCode = 1;
      }
      try {
        database.close();
      } catch (error) {
        process.stderr.write(`Failed to close database: ${format(error)}\n`);
        exitCode = 1;
      }
      process.exit(exitCode);
    });
  };
  process.once('SIGINT', exit);
  process.once('SIGTERM', exit);

  await new Promise<void>((resolve) => {
    server.addListener('listening', () => {
      const addressInfo = server.address();
      const url =
        addressInfo && typeof addressInfo === 'object'
          ? `http://${addressInfo.address}:${String(addressInfo.port)}`
          : null;
      process.stdout.write(
        url ? `Server is listening on ${url}\n` : 'Server is listening\n',
      );
      if (staticDir) process.stdout.write(`Serving the UI from ${staticDir}\n`);
      resolve();
    });
  });
}
