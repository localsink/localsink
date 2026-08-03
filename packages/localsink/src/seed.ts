import { format } from 'node:util';

import { sampleLogs } from '@localsink/contract/fixtures';

import { loadEnv, resolveDbFileName } from './config.ts';
import { initializeDatabase } from './database.ts';
import type { Database } from './database.ts';

// Seeds the dev database with the shared sample fixtures so the UI has data
// to render against the real API. Idempotent: skips when the database already
// holds logs. Rows are inserted verbatim (ids included) so the seeded data
// matches the web package's MSW pseudo-backend exactly.

loadEnv();

let database: Database;
try {
  database = await initializeDatabase(resolveDbFileName());
} catch (error) {
  process.stderr.write(`Failed to initialize database: ${format(error)}\n`);
  process.exit(1);
}

try {
  const { total } = await database.getMeta();
  if (total > 0) {
    process.stdout.write(
      `Database already holds ${String(total)} logs; nothing to seed.\n`,
    );
  } else {
    for (const log of sampleLogs) {
      await database.createLog(log);
    }
    process.stdout.write(`Seeded ${String(sampleLogs.length)} sample logs.\n`);
  }
} catch (error) {
  process.stderr.write(`Seeding failed: ${format(error)}\n`);
  process.exitCode = 1;
} finally {
  database.close();
}
