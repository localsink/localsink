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
  it('returns 200 with an empty array when no logs exist', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it('returns 200 with all logs when rows exist', async () => {
    const { app, db } = await createTestApp();
    await db.createLog(minimalPayload);
    await db.createLog({ ...minimalPayload, message: 'world' });
    const res = await app.request('/api/logs');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({ service_name: 'svc', message: 'hello' }),
      expect.objectContaining({ service_name: 'svc', message: 'world' }),
    ]);
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

  it('returns 400 when the id is not a valid number', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs/abc');
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { name: 'ZodError' },
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
    await expect(db.findAllLogs()).resolves.toEqual([
      expect.objectContaining(minimalPayload),
    ]);
  });

  it('returns 400 when required fields are missing', async () => {
    const { app } = await createTestApp();
    const res = await app.request('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'missing required fields' }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { name: 'ZodError' },
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
});
