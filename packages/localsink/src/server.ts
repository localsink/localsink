import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';

process.loadEnvFile();
if (!process.env['DB_FILE_NAME']) {
  console.error('DB_FILE_NAME environment variable is not set.');
  process.exit(1);
}

const db = drizzle(process.env['DB_FILE_NAME']);
await db.run(sql`PRAGMA journal_mode = WAL`);

const app = new Hono();
app.get('/', (c) => c.text('Hello Node.js!'));

const server = serve({
  fetch: app.fetch,
  port: 3000,
});

const exit = () => {
  server.close((err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
};
process.on('SIGINT', exit);
process.on('SIGTERM', exit);
