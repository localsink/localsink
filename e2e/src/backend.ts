import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/libsql';
import { applySchema, createApp, makeDatabase } from 'localsink';

import { sampleLogs } from '@localsink/contract/fixtures';

// Standalone backend for the Playwright E2E run: the real Hono app over an
// in-memory libSQL database (schema + FTS5 triggers), seeded with the shared
// sample fixtures. Mirrors the in-process test harness
// (packages/test-harness/src/test-server.ts) and the dev seed script
// (packages/localsink/src/seed.ts:30-32), minus the vitest coupling — so it can
// run as a plain `node --conditions=@localsink/source src/backend.ts` process
// that Playwright's webServer boots and tears down. Ephemeral (no DB file, no
// drizzle-kit:migrate), so every run starts from the same known seed.

const port = Number(process.env['PORT'] ?? 3100);

const client = drizzle(':memory:');
await applySchema(client);
const db = makeDatabase(client);
for (const log of sampleLogs) await db.createLog(log);

const server = serve({ fetch: createApp(db).fetch, port }, (info) => {
  process.stdout.write(
    `E2E backend listening on http://localhost:${String(info.port)}\n`,
  );
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
