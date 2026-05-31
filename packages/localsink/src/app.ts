import { format } from 'node:util';

import { StreamableHTTPTransport } from '@hono/mcp';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { ValidationTargets } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import { ingestPayloadSchema } from '@localsink/contract';

import type { Database } from './database.ts';
import { InvalidQueryError, logsQuerySchema } from './database.ts';
import { createMcpServer } from './mcp/server.ts';

const logIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const validate = <
  Schema extends z.ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      throw new HTTPException(400, {
        res: c.json(
          { error: 'Invalid request.', issues: result.error.issues },
          400,
        ),
      });
    }
  });

export function createApp(database: Database) {
  const { findLogs, getMeta, findLogById, createLog } = database;

  const mcpServer = createMcpServer(database);
  const mcpTransport = new StreamableHTTPTransport();

  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    if (error instanceof InvalidQueryError) {
      return c.json({ error: error.message }, 400);
    }
    process.stderr.write(`${format(error)}\n`);
    return c.json({ error: 'Internal server error.' }, 500);
  });

  app.use('*', cors());

  app.all('/mcp', async (c) => {
    if (!mcpServer.isConnected()) {
      await mcpServer.connect(mcpTransport);
    }
    return mcpTransport.handleRequest(c);
  });

  app.get('/api/logs/meta', async (c) => {
    const meta = await getMeta();
    return c.json(meta);
  });

  app.get('/api/logs', validate('query', logsQuerySchema), async (c) => {
    const filter = c.req.valid('query');
    const page = await findLogs(filter);
    return c.json(page);
  });

  app.get('/api/logs/:id', validate('param', logIdParamSchema), async (c) => {
    const { id } = c.req.valid('param');
    const log = await findLogById(id);
    if (!log) {
      return c.json({ error: `Log with ID ${String(id)} not found.` }, 404);
    }
    return c.json(log);
  });

  app.post('/api/logs', validate('json', ingestPayloadSchema), async (c) => {
    const log = c.req.valid('json');
    await createLog(log);
    return c.body(null, 201);
  });

  return app;
}
