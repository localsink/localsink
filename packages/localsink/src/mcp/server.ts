// oxlint-disable-next-line import/extensions -- SDK uses ./* wildcard exports; .js is required for resolution
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { logsQuerySchema } from '@localsink/contract';

import { InvalidQueryError } from '../database.ts';
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
        'Search logs with optional filters; all params AND-ed together. Default mode returns up to `limit` logs newest first plus `next_cursor` for the next page (back in time). Pass `after_id` to switch to forward-polling mode: returns matching logs with `id > after_id` ordered by id ASC (oldest first), `next_cursor` is always null, and the client uses `data.at(-1).id` as the next high-water mark. `q` runs FTS5 free-text search on message (supports prefix `err*`, phrase `"foo bar"`, boolean `AND/OR/NOT`). Discover valid `service_name`, `level`, and `logger` values via describe_logs. `cursor`, `offset`, and `after_id` are pairwise mutually exclusive — calling with any two returns an error.',
      inputSchema: logsQuerySchema,
    },
    async (input) => {
      try {
        const page = await database.findLogs(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
        };
      } catch (err) {
        if (err instanceof InvalidQueryError) {
          return {
            content: [{ type: 'text', text: err.message }],
            isError: true,
          };
        }
        throw err;
      }
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
