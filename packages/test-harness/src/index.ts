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
  // for-of distinguishes empty from a present-but-undefined first element,
  // and yields `T` (not `T | undefined`) without a non-null assertion.
  for (const value of arr) {
    return value;
  }
  throw new Error('expected a non-empty array');
}
