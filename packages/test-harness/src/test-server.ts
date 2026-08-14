import { startServer } from 'localsink';
import type { Database } from 'localsink';
import { onTestFinished } from 'vitest';

export interface TestServer {
  url: string;
  db: Database;
}

export async function startTestServer(): Promise<TestServer> {
  const { url, db, close } = await startServer({
    port: 0,
    dbFileName: ':memory:',
  });
  onTestFinished(close);
  return { url, db };
}
