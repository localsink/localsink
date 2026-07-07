import { format } from 'node:util';

import { sampleLogs } from '@localsink/contract/fixtures';

import { initializeDatabase } from './database.ts';
import type { Database } from './database.ts';

// Seeds the dev database with the shared sample fixtures so the UI has data
// to render against the real API. Idempotent: skips when the database already
// holds logs. Rows are inserted verbatim (ids included) so the seeded data
// matches the web package's MSW pseudo-backend exactly. Assumes the schema
// exists — run `pnpm drizzle-kit:migrate` first on a fresh DB (migrate, not
// push: the FTS5 table and trigger live only in the migration SQL).

let database: Database;
try {
  database = await initializeDatabase();
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
  if (format(error).includes('no such table')) {
    process.stderr.write(
      'The schema is missing — run `pnpm drizzle-kit:migrate` first.\n',
    );
  }
  process.exitCode = 1;
} finally {
  database.close();
}
