import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Database } from './database.ts';
import { logsApiInsertSchema } from './db/schema.ts';

const logIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function createApp(database: Database) {
  const { findAllLogs, findLogById, createLog } = database;

  const app = new Hono();

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: 'Internal server error.' }, 500);
  });

  app.get('/api/logs', async (c) => {
    const logs = await findAllLogs();
    return c.json(logs);
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

  return app;
}
