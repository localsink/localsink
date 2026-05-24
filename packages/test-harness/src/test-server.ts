import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/libsql';
import { applySchema, createApp, makeDatabase } from 'localsink';
import type { Database } from 'localsink';

export interface TestServer {
  url: string;
  db: Database;
}

async function createTestDatabase(): Promise<Database> {
  const client = drizzle(':memory:');
  await applySchema(client);
  return makeDatabase(client);
}

export async function startTestServer(): Promise<TestServer> {
  const db = await createTestDatabase();
  const app = createApp(db);
  const { server, port } = await new Promise<{
    server: ReturnType<typeof serve>;
    port: number;
  }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve({ server: s, port: info.port });
    });
  });
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          db.close();
          if (err) reject(err);
          else resolve();
        });
      }),
  );
  return {
    url: `http://localhost:${String(port)}`,
    db,
  };
}
