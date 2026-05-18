import { serve } from '@hono/node-server';
import { createApp, createTestDatabase } from 'localsink/testing';
import type { Database } from 'localsink/testing';

export interface TestServer {
  url: string;
  db: Database;
  close: () => Promise<void>;
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
  return {
    url: `http://localhost:${String(port)}`,
    db,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          db.close();
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

export async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 2000,
  intervalMs = 25,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (predicate(value)) return value;
    if (Date.now() > deadline) {
      throw new Error('pollUntil: timed out waiting for condition');
    }
    await new Promise((r) => {
      setTimeout(r, intervalMs);
    });
  }
}

export function first<T>(arr: readonly T[]): T {
  const [value] = arr;
  if (value === undefined) {
    throw new Error('expected at least one row');
  }
  return value;
}
