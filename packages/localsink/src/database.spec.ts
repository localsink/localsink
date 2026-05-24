import { drizzle } from 'drizzle-orm/libsql';

import { makeDatabase } from './database.ts';
import { applySchema } from './migrate.ts';

async function createDb() {
  const client = drizzle(':memory:');
  await applySchema(client);
  const db = makeDatabase(client);
  onTestFinished(() => db.close());
  return db;
}

const minimalLog = {
  service_name: 'svc',
  timestamp: 1000,
  level: 'info',
  message: 'hello',
};

describe('makeDatabase', () => {
  describe('findAllLogs', () => {
    it('returns an empty array when no logs exist', async () => {
      const db = await createDb();
      await expect(db.findAllLogs()).resolves.toEqual([]);
    });

    it('returns all inserted logs', async () => {
      const db = await createDb();
      await db.createLog(minimalLog);
      await db.createLog({ ...minimalLog, message: 'world' });
      await expect(db.findAllLogs()).resolves.toHaveLength(2);
    });
  });

  describe('findLogById', () => {
    it('returns the log when it exists', async () => {
      const db = await createDb();
      await db.createLog(minimalLog);
      await expect(db.findLogById(1)).resolves.toMatchObject({
        id: 1,
        message: 'hello',
      });
    });

    it('returns undefined when no log has that id', async () => {
      const db = await createDb();
      await expect(db.findLogById(999)).resolves.toBeUndefined();
    });
  });

  describe('createLog', () => {
    it('persists a log with all optional fields populated', async () => {
      const db = await createDb();
      await db.createLog({
        service_name: 'svc',
        timestamp: 1000,
        level: 'error',
        message: 'oops',
        trace_id: 'trace-1',
        span_id: 'span-1',
        logger: 'console',
        error: { message: 'kaboom', type: 'Error' },
        attributes: { userId: 42 },
      });
      await expect(db.findAllLogs()).resolves.toEqual([
        {
          id: 1,
          service_name: 'svc',
          timestamp: 1000,
          level: 'error',
          message: 'oops',
          trace_id: 'trace-1',
          span_id: 'span-1',
          logger: 'console',
          error: { message: 'kaboom', type: 'Error' },
          attributes: { userId: 42 },
        },
      ]);
    });

    it('persists a log with only required fields, nulling optional columns', async () => {
      const db = await createDb();
      await db.createLog(minimalLog);
      await expect(db.findAllLogs()).resolves.toEqual([
        {
          id: 1,
          service_name: 'svc',
          timestamp: 1000,
          level: 'info',
          message: 'hello',
          trace_id: null,
          span_id: null,
          logger: null,
          error: null,
          attributes: null,
        },
      ]);
    });
  });
});
