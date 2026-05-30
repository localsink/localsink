import { format } from 'node:util';

import { serve } from '@hono/node-server';
import { z } from 'zod';

import { createApp } from './app.ts';
import { initializeDatabase } from './database.ts';
import type { Database } from './database.ts';

const portResult = z.coerce
  .number()
  .int()
  .min(0)
  .max(65535)
  .default(3000)
  .safeParse(process.env['PORT']);
if (!portResult.success) {
  process.stderr.write(
    `Invalid PORT "${String(process.env['PORT'])}": ${portResult.error.issues.map((i) => i.message).join('; ')}\n`,
  );
  process.exit(1);
}
const port = portResult.data;

let database: Database;
try {
  database = await initializeDatabase();
} catch (error) {
  process.stderr.write(`Failed to initialize database: ${format(error)}\n`);
  process.exit(1);
}

const app = createApp(database);

const server = serve({
  fetch: app.fetch,
  port,
});

server.addListener('listening', () => {
  const addressInfo = server.address();
  if (addressInfo && typeof addressInfo === 'object') {
    process.stdout.write(
      `Server is listening on http://${addressInfo.address}:${String(addressInfo.port)}\n`,
    );
  } else {
    process.stdout.write('Server is listening\n');
  }
});

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
