// eslint-disable-next-line import/extensions -- SDK uses ./* wildcard exports; .js is required for resolution
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { logsQuerySchema } from '../database.ts';
import type { Database } from '../database.ts';

export function createMcpServer(database: Database): McpServer {
  const server = new McpServer({ name: 'localsink', version: '0.0.0' });

  server.registerTool(
    'describe_logs',
    {
      description:
        'Returns shape-of-DB metadata: total count, distinct services / levels / loggers, and the timestamp range of logs in the DB. Call this first to discover valid filter values before calling search_logs.',
    },
    async () => {
      const meta = await database.getMeta();
      return {
        content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }],
      };
    },
  );

  server.registerTool(
    'search_logs',
    {
      description:
        'Search logs with optional filters; all params AND-ed together. Returns up to `limit` logs newest first, plus `next_cursor` for the next page. `q` runs FTS5 free-text search on message (supports prefix `err*`, phrase `"foo bar"`, boolean `AND/OR/NOT`).',
      inputSchema: logsQuerySchema,
    },
    async (input) => {
      const page = await database.findLogs(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
      };
    },
  );

  server.registerTool(
    'get_log_by_id',
    {
      description:
        'Fetch a single log by its numeric ID. Use after search_logs to drill into a specific row.',
      inputSchema: z.object({ id: z.number().int().positive() }),
    },
    async ({ id }) => {
      const log = await database.findLogById(id);
      if (!log) {
        return {
          content: [
            { type: 'text', text: `No log found with id ${String(id)}.` },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(log, null, 2) }],
      };
    },
  );

  return server;
}
