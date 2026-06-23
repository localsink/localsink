// oxlint-disable-next-line import/extensions -- SDK uses ./* wildcard exports; .js is required for resolution
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// oxlint-disable-next-line import/extensions -- same as above
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { drizzle } from 'drizzle-orm/libsql';

import { makeDatabase } from '../database.ts';
import { applySchema } from '../migrate.ts';
import { createMcpServer } from './server.ts';

async function connectedClient() {
  const drizzleClient = drizzle(':memory:');
  await applySchema(drizzleClient);
  const db = makeDatabase(drizzleClient);
  onTestFinished(() => db.close());

  const mcpServer = createMcpServer(db);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await mcpServer.connect(serverT);

  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientT);

  return { client, db };
}

const minimalLog = {
  service_name: 'svc',
  timestamp: 1000,
  level: 'info',
  message: 'hello',
};

// MCP content blocks are a discriminated union (type: 'text' | 'image' | ...).
// Our tools only ever return text blocks; narrow + parse the JSON. Inferred
// return type is `any` (from JSON.parse) so tests can access fields directly —
// the spec-file lint overrides permit unsafe-member-access on test values.
function parseJsonResult(content: unknown) {
  if (!Array.isArray(content)) throw new Error('expected content array');
  const block = content.find(
    (c): c is { type: 'text'; text: string } =>
      typeof c === 'object' &&
      c !== null &&
      'type' in c &&
      c.type === 'text' &&
      'text' in c &&
      typeof c.text === 'string',
  );
  if (!block) throw new Error('no text content block in result');
  return JSON.parse(block.text);
}

describe('MCP server', () => {
  it('lists all three tools', async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([
      'describe_logs',
      'get_log_by_id',
      'search_logs',
    ]);
  });

  describe('describe_logs', () => {
    it('returns zero-state meta on an empty DB', async () => {
      const { client } = await connectedClient();
      const result = await client.callTool({
        name: 'describe_logs',
        arguments: {},
      });
      expect(parseJsonResult(result.content)).toEqual({
        total: 0,
        services: [],
        levels: [],
        loggers: [],
        timestamp_range: null,
      });
    });

    it('returns populated meta after seeding', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        level: 'error',
        logger: 'winston',
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'payments',
        level: 'info',
      });
      const result = await client.callTool({
        name: 'describe_logs',
        arguments: {},
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        total: 2,
        services: ['auth', 'payments'],
        levels: ['error', 'info'],
        loggers: ['winston'],
      });
    });
  });

  describe('search_logs', () => {
    it('returns the envelope shape', async () => {
      const { client, db } = await connectedClient();
      await db.createLog(minimalLog);
      const result = await client.callTool({
        name: 'search_logs',
        arguments: {},
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [expect.objectContaining({ message: 'hello' })],
        next_cursor: null,
      });
    });

    it('filters by service_name', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({ ...minimalLog, service_name: 'auth' });
      await db.createLog({ ...minimalLog, service_name: 'payments' });
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { service_name: 'auth' },
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [expect.objectContaining({ service_name: 'auth' })],
      });
    });

    it('filters by logger', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({ ...minimalLog, logger: 'winston' });
      await db.createLog({ ...minimalLog, logger: 'pino' });
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { logger: 'winston' },
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [expect.objectContaining({ logger: 'winston' })],
      });
    });

    it('filters by q via FTS5', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({ ...minimalLog, message: 'payment failed' });
      await db.createLog({ ...minimalLog, message: 'user signed in' });
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { q: 'payment' },
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [expect.objectContaining({ message: 'payment failed' })],
      });
    });

    it('finds matches in error fields via q', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({
        ...minimalLog,
        error: { message: 'kaboom', type: 'TimeoutError' },
      });
      await db.createLog(minimalLog);
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { q: 'TimeoutError' },
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [
          expect.objectContaining({
            error: expect.objectContaining({ type: 'TimeoutError' }),
          }),
        ],
      });
    });

    it('finds matches in nested attributes via q', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({
        ...minimalLog,
        attributes: { user: { id: 'alice' } },
      });
      await db.createLog({
        ...minimalLog,
        attributes: { user: { id: 'bob' } },
      });
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { q: 'alice' },
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [
          expect.objectContaining({
            attributes: { user: { id: 'alice' } },
          }),
        ],
      });
    });

    it('advances pages via cursor', async () => {
      const { client, db } = await connectedClient();
      for (let i = 0; i < 4; i++) await db.createLog(minimalLog);
      const page1 = await client.callTool({
        name: 'search_logs',
        arguments: { limit: 2 },
      });
      expect(parseJsonResult(page1.content)).toMatchObject({
        data: [expect.anything(), expect.anything()],
        next_cursor: expect.stringMatching(/^\d+:\d+$/),
      });

      const cursor = parseJsonResult(page1.content).next_cursor;
      const page2 = await client.callTool({
        name: 'search_logs',
        arguments: { limit: 2, cursor },
      });
      expect(parseJsonResult(page2.content)).toMatchObject({
        data: [expect.anything(), expect.anything()],
        next_cursor: null,
      });
    });

    it('returns isError when both cursor and offset are provided', async () => {
      const { client } = await connectedClient();
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { cursor: '1000:1', offset: 10 },
      });
      expect(result.isError).toBe(true);
    });

    it('retries invalid FTS5 as a literal phrase instead of erroring', async () => {
      const { client, db } = await connectedClient();
      await db.createLog({
        ...minimalLog,
        attributes: { request_id: 'key-2024-q1' },
      });
      const result = await client.callTool({
        name: 'search_logs',
        arguments: { q: 'key-2024-q1' },
      });
      expect(result.isError).toBeFalsy();
      expect(parseJsonResult(result.content)).toMatchObject({
        data: [
          expect.objectContaining({
            attributes: { request_id: 'key-2024-q1' },
          }),
        ],
      });
    });
  });

  describe('get_log_by_id', () => {
    it('returns the log when it exists', async () => {
      const { client, db } = await connectedClient();
      await db.createLog(minimalLog);
      const result = await client.callTool({
        name: 'get_log_by_id',
        arguments: { id: 1 },
      });
      expect(parseJsonResult(result.content)).toMatchObject({
        id: 1,
        message: 'hello',
      });
    });

    it('returns isError when the log does not exist', async () => {
      const { client } = await connectedClient();
      const result = await client.callTool({
        name: 'get_log_by_id',
        arguments: { id: 999 },
      });
      expect(result.isError).toBe(true);
    });
  });
});
