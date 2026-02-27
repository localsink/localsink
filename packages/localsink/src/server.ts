import { serve } from '@hono/node-server';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { logsApiInsertSchema } from './db/schema.ts';
import { initializeDatabase, type Database } from './database.ts';

let database: Database;
try {
  database = await initializeDatabase();
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}
const { findAllLogs, findLogById, createLog, close } = database;

const app = new Hono();

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'Internal server error.' }, 500);
});

app.get('/api/logs', async (c) => {
  const logs = await findAllLogs();
  return c.json(logs);
});

const logIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
app.get('/api/logs/:id', zValidator('param', logIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const log = await findLogById(id);
  if (!log) {
    return c.json({ error: `Log with ID ${String(id)} not found.` }, 404);
  }
  return c.json(log);
});

app.post('/api/logs', zValidator('json', logsApiInsertSchema), async (c) => {
  const log = c.req.valid('json');
  await createLog(log);
  return c.body(null, 201);
});

const server = serve({
  fetch: app.fetch,
  port: 3000,
});

server.addListener('listening', () => {
  const addressInfo = server.address();
  if (addressInfo && typeof addressInfo === 'object') {
    console.log(
      `Server is listening on http://${addressInfo.address}:${String(addressInfo.port)}`,
    );
  } else {
    console.log('Server is listening');
  }
});

const exit = () => {
  server.close((err) => {
    let exitCode = 0;
    if (err) {
      console.error(err);
      exitCode = 1;
    }
    try {
      close();
    } catch (error) {
      console.error('Failed to close database connection:', error);
      exitCode = 1;
    }
    process.exit(exitCode);
  });
};
process.once('SIGINT', exit);
process.once('SIGTERM', exit);
