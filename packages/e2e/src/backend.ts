import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/libsql';
import { applySchema, createApp, makeDatabase } from 'localsink';
import type { Database } from 'localsink';

import { sampleLogs } from '@localsink/contract/fixtures';

// Mirrors packages/test-harness/src/test-server.ts, minus the vitest coupling
// (that harness registers teardown via onTestFinished, which Playwright has no
// equivalent of) — hence the exposed `close`.

export interface Backend {
  url: string;
  db: Database;
  close: () => Promise<void>;
}

export async function startBackend(): Promise<Backend> {
  const client = drizzle(':memory:');
  await applySchema(client);
  const db = makeDatabase(client);
  for (const log of sampleLogs) await db.createLog(log);

  const { server, port } = await new Promise<{
    server: ReturnType<typeof serve>;
    port: number;
  }>((resolve) => {
    const s = serve({ fetch: createApp(db).fetch, port: 0 }, (info) => {
      resolve({ server: s, port: info.port });
    });
  });

  return {
    url: `http://localhost:${String(port)}`,
    db,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          db.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
