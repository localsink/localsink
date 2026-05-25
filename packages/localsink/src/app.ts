import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import type { Database } from './database.ts';
import { logsQuerySchema } from './database.ts';
import { logsApiInsertSchema } from './db/schema.ts';

const logIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const validationErrorHandler: NonNullable<Parameters<typeof zValidator>[2]> = (
  result,
  c,
) => {
  if (!result.success) {
    return c.json(
      { error: 'Invalid request.', issues: result.error.issues },
      400,
    );
  }
  return undefined;
};

export function createApp(database: Database) {
  const { findLogs, getMeta, findLogById, createLog } = database;

  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    console.error(error);
    return c.json({ error: 'Internal server error.' }, 500);
  });

  app.get('/api/logs/meta', async (c) => {
    const meta = await getMeta();
    return c.json(meta);
  });

  app.get(
    '/api/logs',
    zValidator('query', logsQuerySchema, validationErrorHandler),
    async (c) => {
      const filter = c.req.valid('query');
      const page = await findLogs(filter);
      return c.json(page);
    },
  );

  app.get(
    '/api/logs/:id',
    zValidator('param', logIdParamSchema, validationErrorHandler),
    async (c) => {
      const { id } = c.req.valid('param');
      const log = await findLogById(id);
      if (!log) {
        return c.json({ error: `Log with ID ${String(id)} not found.` }, 404);
      }
      return c.json(log);
    },
  );

  app.post(
    '/api/logs',
    zValidator('json', logsApiInsertSchema, validationErrorHandler),
    async (c) => {
      const log = c.req.valid('json');
      await createLog(log);
      return c.body(null, 201);
    },
  );

  return app;
}
