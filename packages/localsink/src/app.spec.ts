import { drizzle } from 'drizzle-orm/libsql';

import { createApp } from './app.ts';
import { makeDatabase } from './database.ts';
import { applySchema } from './migrate.ts';

async function createTestApp() {
  const client = drizzle(':memory:');
  await applySchema(client);
  const db = makeDatabase(client);
  onTestFinished(() => db.close());
  return { app: createApp(db), db };
}

const minimalPayload = {
  service_name: 'svc',
  timestamp: 1000,
  level: 'info',
  message: 'hello',
};

describe('GET /api/logs', () => {
  it('returns 200 with envelope when no logs exist', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [], next_cursor: null });
  });

  it('returns 200 with envelope when rows exist, ordered timestamp DESC id DESC', async () => {
    const { app, db } = await createTestApp();
    await db.createLog(minimalPayload);
    await db.createLog({ ...minimalPayload, message: 'world' });
    const res = await app.request('/api/logs');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({ message: 'world' }),
        expect.objectContaining({ message: 'hello' }),
      ],
      next_cursor: null,
    });
  });

  describe('query params', () => {
    it('filters by service_name', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({ ...minimalPayload, service_name: 'auth' });
      await db.createLog({ ...minimalPayload, service_name: 'payments' });
      const res = await app.request('/api/logs?service_name=auth');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.objectContaining({ service_name: 'auth' })],
      });
    });

    it('filters by level', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({ ...minimalPayload, level: 'error' });
      await db.createLog({ ...minimalPayload, level: 'info' });
      const res = await app.request('/api/logs?level=error');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.objectContaining({ level: 'error' })],
      });
    });

    it('filters by logger', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({ ...minimalPayload, logger: 'winston' });
      await db.createLog({ ...minimalPayload, logger: 'pino' });
      const res = await app.request('/api/logs?logger=winston');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.objectContaining({ logger: 'winston' })],
      });
    });

    it('respects limit and returns a string next_cursor on a full page', async () => {
      const { app, db } = await createTestApp();
      for (let i = 0; i < 3; i++) await db.createLog(minimalPayload);
      const res = await app.request('/api/logs?limit=2');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.anything(), expect.anything()],
        next_cursor: expect.stringMatching(/^\d+:\d+$/),
      });
    });

    it('advances pages using the cursor', async () => {
      const { app, db } = await createTestApp();
      for (let i = 0; i < 4; i++) await db.createLog(minimalPayload);
      // Compute the cursor that page 1 (limit=2) would return — the 2nd row in
      // (timestamp DESC, id DESC) order, encoded as `<timestamp>:<id>`.
      const { data: allLogs } = await db.findLogs({ limit: 50 });
      const secondRow = allLogs[1];
      if (!secondRow) throw new Error('expected at least 2 logs');
      const cursor = `${String(secondRow.timestamp)}:${String(secondRow.id)}`;
      const res = await app.request(`/api/logs?limit=2&cursor=${cursor}`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.anything(), expect.anything()],
        next_cursor: null,
      });
    });

    it('returns 400 when both cursor and offset are provided', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?cursor=1000:1&offset=10');
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: 'Invalid request.',
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: 'Cannot use both cursor and offset.',
          }),
        ]),
      });
    });

    it('returns 400 when after_id is empty (does not silently switch to forward-polling mode)', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({ ...minimalPayload, message: 'a' });
      const res = await app.request('/api/logs?after_id=');
      expect(res.status).toBe(400);
    });

    it('returns 400 when both after_id and cursor are provided', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?after_id=5&cursor=1000:1');
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: 'Invalid request.',
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: 'Cannot use both after_id and cursor.',
          }),
        ]),
      });
    });

    it('returns logs with id > after_id ordered ASC', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({ ...minimalPayload, message: 'first' });
      await db.createLog({ ...minimalPayload, message: 'second' });
      await db.createLog({ ...minimalPayload, message: 'third' });
      const { data: all } = await db.findLogs({ limit: 50 });
      const second = all.find((r) => r.message === 'second');
      if (!second) throw new Error('expected second row');
      const res = await app.request(`/api/logs?after_id=${String(second.id)}`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.objectContaining({ message: 'third' })],
        next_cursor: null,
      });
    });

    it('returns 400 when cursor has an invalid format', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?cursor=not-a-cursor');
      expect(res.status).toBe(400);
    });

    it('returns 400 when limit is non-numeric', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?limit=abc');
      expect(res.status).toBe(400);
    });

    it('returns 400 when limit exceeds 500', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?limit=501');
      expect(res.status).toBe(400);
    });

    it('returns 400 when service_name is empty', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?service_name=');
      expect(res.status).toBe(400);
    });

    it('filters by q via FTS5', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({ ...minimalPayload, message: 'payment failed' });
      await db.createLog({ ...minimalPayload, message: 'user signed in' });
      const res = await app.request('/api/logs?q=payment');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [expect.objectContaining({ message: 'payment failed' })],
      });
    });

    it('ANDs q with other filters', async () => {
      const { app, db } = await createTestApp();
      await db.createLog({
        ...minimalPayload,
        service_name: 'auth',
        message: 'login failed',
      });
      await db.createLog({
        ...minimalPayload,
        service_name: 'payments',
        message: 'login failed',
      });
      const res = await app.request('/api/logs?q=failed&service_name=auth');
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        data: [
          expect.objectContaining({
            service_name: 'auth',
            message: 'login failed',
          }),
        ],
      });
    });

    it('returns 400 when q is empty', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?q=');
      expect(res.status).toBe(400);
    });

    it('returns 400 when q is whitespace-only', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs?q=%20%20%20');
      expect(res.status).toBe(400);
    });

    it('returns 400 (not 500) when q has invalid FTS5 syntax', async () => {
      const { app, db } = await createTestApp();
      await db.createLog(minimalPayload);
      const res = await app.request(
        `/api/logs?q=${encodeURIComponent('foo"bar')}`,
      );
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        error: expect.stringContaining('FTS5'),
      });
    });
  });

  describe('CORS', () => {
    it('returns Access-Control-Allow-Origin on /api/* responses', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
    });

    it('responds to preflight OPTIONS on /api/*', async () => {
      const { app } = await createTestApp();
      const res = await app.request('/api/logs', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      });
      expect(res.status).toBeLessThan(300);
      expect(res.headers.get('Access-Control-Allow-Origin')).not.toBeNull();
    });
  });
});

describe('GET /api/logs/:id', () => {
  it('returns 200 with the log when it exists', async () => {
    const { app, db } = await createTestApp();
    await db.createLog(minimalPayload);
    const res = await app.request('/api/logs/1');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 1,
      message: 'hello',
    });
  });

  it('returns 404 when no log has that id', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs/999');
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: 'Log with ID 999 not found.',
    });
  });

  it('returns 400 with cleaned-up error shape when the id is not a valid number', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs/abc');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid request.',
      issues: expect.any(Array),
    });
  });
});

describe('POST /api/logs', () => {
  it('returns 201 and persists the log', async () => {
    const { app, db } = await createTestApp();
    const res = await app.request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(201);
    await expect(db.findLogById(1)).resolves.toMatchObject(minimalPayload);
  });

  it('returns 400 with cleaned-up error shape when required fields are missing', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'missing required fields' }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: 'Invalid request.',
      issues: expect.any(Array),
    });
  });

  it('returns 400 when the body is not JSON', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when attributes is not an object', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...minimalPayload, attributes: 'not-an-object' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when error is not an object', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...minimalPayload, error: 42 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/logs/meta', () => {
  it('returns 200 with zero-state shape when table is empty', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs/meta');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      total: 0,
      services: [],
      levels: [],
      loggers: [],
      timestamp_range: null,
    });
  });

  it('returns 200 with populated shape after seeding', async () => {
    const { app, db } = await createTestApp();
    await db.createLog({
      ...minimalPayload,
      service_name: 'auth',
      level: 'error',
      logger: 'winston',
    });
    await db.createLog({
      ...minimalPayload,
      service_name: 'payments',
      level: 'info',
      logger: null,
    });
    const res = await app.request('/api/logs/meta');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      total: 2,
      services: ['auth', 'payments'],
      levels: ['error', 'info'],
      loggers: ['winston'],
      timestamp_range: expect.objectContaining({
        min: expect.any(Number),
        max: expect.any(Number),
      }),
    });
  });

  it('is not handled by the /:id route (router-ordering regression)', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs/meta');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      total: expect.any(Number),
    });
  });
});

function parseSseResponse(text: string) {
  const lines = text.split('\n');
  const dataLine = lines.find((l) => l.startsWith('data: '));
  if (!dataLine) {
    throw new Error(`No data line found in SSE response. Full text:\n${text}`);
  }
  const jsonStr = dataLine.slice('data: '.length);
  return JSON.parse(jsonStr);
}

describe('POST /mcp', () => {
  it('handles tools/list request', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    const body = parseSseResponse(text);
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: expect.any(Array),
      },
    });

    const tools = body.result.tools
      .map((t: { name: string }) => t.name)
      .toSorted((a: string, b: string) => a.localeCompare(b));
    expect(tools).toEqual(['describe_logs', 'get_log_by_id', 'search_logs']);
  });

  it('handles tools/call request for describe_logs', async () => {
    const { app, db } = await createTestApp();
    await db.createLog(minimalPayload);

    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'describe_logs',
          arguments: {},
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const text = await res.text();
    const body = parseSseResponse(text);
    expect(body).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"total": 1'),
          },
        ],
      },
    });
  });
});
