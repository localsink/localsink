import { format } from 'node:util';

import { serveStatic } from '@hono/node-server/serve-static';
import { zValidator } from '@hono/zod-validator';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Hono } from 'hono';
import type { ValidationTargets } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
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
   * Directory holding the built SPA. Omit to serve the API and MCP only, which
   * is the dev setup: Vite serves the SPA and proxies here.
   */
  staticDir?: string;
  /** Host names to answer requests for. Omit to answer any. */
  allowedHosts?: string[];
}

export function createApp(database: Database, options: CreateAppOptions = {}) {
  const { findLogs, getMeta, findLogById, createLog } = database;

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

  // HSTS is off: localsink is served over plain HTTP, where browsers ignore it.
  app.use(secureHeaders({ strictTransportSecurity: false }));

  const { allowedHosts } = options;
  if (allowedHosts) {
    app.use('*', async (c, next) => {
      if (!allowedHosts.includes(new URL(c.req.url).hostname)) {
        throw new HTTPException(403, {
          res: c.json({ error: 'Host not allowed.' }, 403),
        });
      }
      await next();
    });
  }

  app.use(csrf());

  // Only log ingest is shared cross-origin, for browser apps.
  const ingestCors = cors({ allowMethods: ['POST'] });

  const mcpHandler = createMcpHandler(() => createMcpServer(database));
  app.all('/mcp', (c) => mcpHandler.fetch(c.req.raw));

  app.all('/mcp/*', (c) => c.json({ error: 'Not found.' }, 404));

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

  app.options('/api/logs', ingestCors);

  app.post(
    '/api/logs',
    ingestCors,
    validate('json', ingestPayloadSchema),
    async (c) => {
      const log = c.req.valid('json');
      await createLog(log);
      return c.body(null, 201);
    },
  );

  app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

  if (options.staticDir) {
    const root = options.staticDir;
    app.use('*', serveStatic({ root }));
    app.get('*', serveStatic({ path: 'index.html', root }));
  }

  return app;
}
