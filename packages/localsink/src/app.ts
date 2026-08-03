import { format } from 'node:util';

import { StreamableHTTPTransport } from '@hono/mcp';
import { serveStatic } from '@hono/node-server/serve-static';
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

export interface CreateAppOptions {
  /**
   * Directory holding the built SPA (index.html + assets/). Omit to serve the
   * API and MCP only — that's the dev setup, where Vite serves the SPA and
   * proxies here.
   */
  staticDir?: string;
}

export function createApp(database: Database, options: CreateAppOptions = {}) {
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

  // Static serving goes last: the API and MCP handlers above are terminal, so
  // they're matched before anything here can see the request.
  if (options.staticDir) {
    const root = options.staticDir;
    // Real files — /assets/*, and `/` itself, since a directory hit resolves
    // index.html. A miss calls next(), falling through to the handlers below.
    app.use('*', serveStatic({ root }));
    // Without these, an unmatched /api path would reach the SPA fallback and
    // answer an API client with index.html and a 200.
    app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));
    app.all('/mcp/*', (c) => c.json({ error: 'Not found.' }, 404));
    // Anything left is a client-side route.
    app.get('*', serveStatic({ path: 'index.html', root }));
  }

  return app;
}
