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
      await expect(db.findLogById(1)).resolves.toEqual({
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
      });
    });

    it('persists a log with only required fields, nulling optional columns', async () => {
      const db = await createDb();
      await db.createLog(minimalLog);
      await expect(db.findLogById(1)).resolves.toEqual({
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
      });
    });
  });

  describe('findLogs', () => {
    it('returns rows in timestamp DESC, id DESC order', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, timestamp: 1000, message: 'a' });
      await db.createLog({ ...minimalLog, timestamp: 2000, message: 'b' });
      await db.createLog({ ...minimalLog, timestamp: 1000, message: 'c' });
      const { data } = await db.findLogs({ limit: 50 });
      expect(data.map((r) => r.message)).toEqual(['b', 'c', 'a']);
    });

    it('returns envelope with next_cursor null when result is not a full page', async () => {
      const db = await createDb();
      await db.createLog(minimalLog);
      const result = await db.findLogs({ limit: 50 });
      expect(result.next_cursor).toBeNull();
    });

    it('filters by service_name', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, service_name: 'auth' });
      await db.createLog({ ...minimalLog, service_name: 'payments' });
      const { data } = await db.findLogs({ limit: 50, service_name: 'auth' });
      expect(data).toHaveLength(1);
      expect(data[0]?.service_name).toBe('auth');
    });

    it('filters by level', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, level: 'error' });
      await db.createLog({ ...minimalLog, level: 'info' });
      const { data } = await db.findLogs({ limit: 50, level: 'error' });
      expect(data).toHaveLength(1);
      expect(data[0]?.level).toBe('error');
    });

    it('filters by trace_id', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, trace_id: 'trace-1' });
      await db.createLog({ ...minimalLog, trace_id: 'trace-2' });
      const { data } = await db.findLogs({ limit: 50, trace_id: 'trace-1' });
      expect(data).toHaveLength(1);
      expect(data[0]?.trace_id).toBe('trace-1');
    });

    it('filters by from (inclusive)', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, timestamp: 999 });
      await db.createLog({ ...minimalLog, timestamp: 1000 });
      await db.createLog({ ...minimalLog, timestamp: 1001 });
      const { data } = await db.findLogs({ limit: 50, from: 1000 });
      expect(data).toHaveLength(2);
      expect(data.every((r) => r.timestamp >= 1000)).toBe(true);
    });

    it('filters by to (exclusive)', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, timestamp: 999 });
      await db.createLog({ ...minimalLog, timestamp: 1000 });
      await db.createLog({ ...minimalLog, timestamp: 1001 });
      const { data } = await db.findLogs({ limit: 50, to: 1000 });
      expect(data).toHaveLength(1);
      expect(data[0]?.timestamp).toBe(999);
    });

    it('ANDs multiple filters together', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        level: 'error',
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        level: 'info',
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'payments',
        level: 'error',
      });
      const { data } = await db.findLogs({
        limit: 50,
        service_name: 'auth',
        level: 'error',
      });
      expect(data).toHaveLength(1);
      expect(data[0]?.service_name).toBe('auth');
      expect(data[0]?.level).toBe('error');
    });

    describe('pagination', () => {
      it('caps results at limit and sets a string next_cursor on a full page', async () => {
        const db = await createDb();
        for (let i = 0; i < 3; i++) {
          await db.createLog({ ...minimalLog, message: `msg-${String(i)}` });
        }
        const { data, next_cursor } = await db.findLogs({ limit: 2 });
        expect(data).toHaveLength(2);
        expect(next_cursor).toBeTypeOf('string');
        // Cursor format: "<timestamp>:<id>"
        const last = data[1];
        if (!last) throw new Error('expected page to have 2 rows');
        expect(next_cursor).toBe(
          `${String(last.timestamp)}:${String(last.id)}`,
        );
      });

      it('advances pages with the composite cursor', async () => {
        const db = await createDb();
        for (let i = 1; i <= 4; i++) {
          await db.createLog({ ...minimalLog, message: `msg-${String(i)}` });
        }
        const page1 = await db.findLogs({ limit: 2 });
        expect(page1.data).toHaveLength(2);
        expect(page1.next_cursor).not.toBeNull();

        const last1 = page1.data[1];
        if (!last1) throw new Error('expected page to have 2 rows');
        const page2 = await db.findLogs({
          limit: 2,
          cursor: { timestamp: last1.timestamp, id: last1.id },
        });
        expect(page2.data).toHaveLength(2);
        expect(page2.next_cursor).toBeNull();

        const allIds = [...page1.data, ...page2.data].map((r) => r.id);
        expect(new Set(allIds).size).toBe(4);
      });

      it('does not skip rows when timestamps are non-monotonic with ids', async () => {
        // Regression guard: id-only cursor would skip row id=3 here because the
        // sort puts id=2 before id=3 (same timestamp, higher id first).
        const db = await createDb();
        await db.createLog({ ...minimalLog, timestamp: 100, message: 'a' }); // id=1
        await db.createLog({ ...minimalLog, timestamp: 300, message: 'b' }); // id=2
        await db.createLog({ ...minimalLog, timestamp: 200, message: 'c' }); // id=3
        await db.createLog({ ...minimalLog, timestamp: 300, message: 'd' }); // id=4

        const page1 = await db.findLogs({ limit: 2 });
        expect(page1.data.map((r) => r.message)).toEqual(['d', 'b']);

        const last1 = page1.data[1];
        if (!last1) throw new Error('expected page to have 2 rows');
        const page2 = await db.findLogs({
          limit: 2,
          cursor: { timestamp: last1.timestamp, id: last1.id },
        });
        expect(page2.data.map((r) => r.message)).toEqual(['c', 'a']);
      });

      it('supports offset pagination', async () => {
        const db = await createDb();
        for (let i = 1; i <= 4; i++) {
          await db.createLog({ ...minimalLog, message: `msg-${String(i)}` });
        }
        const page1 = await db.findLogs({ limit: 2, offset: 0 });
        const page2 = await db.findLogs({ limit: 2, offset: 2 });
        const allIds = [...page1.data, ...page2.data].map((r) => r.id);
        expect(new Set(allIds).size).toBe(4);
      });
    });
  });

  describe('getMeta', () => {
    it('returns zero-state when table is empty', async () => {
      const db = await createDb();
      await expect(db.getMeta()).resolves.toEqual({
        total: 0,
        services: [],
        levels: [],
        loggers: [],
        timestamp_range: null,
      });
    });

    it('returns distinct sorted values and correct total after seeding', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        service_name: 'payments',
        level: 'error',
        logger: 'winston',
        timestamp: 2000,
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        level: 'info',
        logger: 'winston',
        timestamp: 1000,
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        level: 'error',
        logger: null,
        timestamp: 3000,
      });

      const meta = await db.getMeta();
      expect(meta.total).toBe(3);
      expect(meta.services).toEqual(['auth', 'payments']);
      expect(meta.levels).toEqual(['error', 'info']);
      expect(meta.loggers).toEqual(['winston']);
      expect(meta.timestamp_range).toEqual({ min: 1000, max: 3000 });
    });

    it('excludes null from loggers array', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, logger: null });
      await db.createLog({ ...minimalLog, logger: 'console' });
      const meta = await db.getMeta();
      expect(meta.loggers).toEqual(['console']);
    });
  });

  describe('findLogs q (FTS5)', () => {
    it('matches a log by a token in message', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, message: 'user signed in' });
      await db.createLog({ ...minimalLog, message: 'payment failed' });
      const { data } = await db.findLogs({ limit: 50, q: 'signed' });
      expect(data).toHaveLength(1);
      expect(data[0]?.message).toBe('user signed in');
    });

    it('returns empty when no message matches', async () => {
      const db = await createDb();
      await db.createLog(minimalLog);
      const { data } = await db.findLogs({ limit: 50, q: 'nonexistent' });
      expect(data).toEqual([]);
    });

    it('ANDs q with other filters', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        message: 'login failed',
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'payments',
        message: 'login failed',
      });
      await db.createLog({
        ...minimalLog,
        service_name: 'auth',
        message: 'logout success',
      });
      const { data } = await db.findLogs({
        limit: 50,
        q: 'failed',
        service_name: 'auth',
      });
      expect(data).toHaveLength(1);
      expect(data[0]?.service_name).toBe('auth');
      expect(data[0]?.message).toBe('login failed');
    });

    it('combines q with cursor pagination', async () => {
      const db = await createDb();
      for (let i = 0; i < 4; i++) {
        await db.createLog({
          ...minimalLog,
          message: `error number ${String(i)}`,
        });
      }
      await db.createLog({ ...minimalLog, message: 'success' }); // won't match `error`

      const page1 = await db.findLogs({ limit: 2, q: 'error' });
      expect(page1.data).toHaveLength(2);
      expect(page1.next_cursor).not.toBeNull();

      const last1 = page1.data[1];
      if (!last1) throw new Error('expected page to have 2 rows');
      const page2 = await db.findLogs({
        limit: 2,
        q: 'error',
        cursor: { timestamp: last1.timestamp, id: last1.id },
      });
      expect(page2.data).toHaveLength(2);
      expect(page2.next_cursor).toBeNull();

      const allIds = [...page1.data, ...page2.data].map((r) => r.id);
      expect(new Set(allIds).size).toBe(4);
    });

    it('supports FTS5 prefix queries (token*)', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, message: 'errored out' });
      await db.createLog({ ...minimalLog, message: 'errors abound' });
      await db.createLog({ ...minimalLog, message: 'fine' });
      const { data } = await db.findLogs({ limit: 50, q: 'err*' });
      expect(data).toHaveLength(2);
    });
  });

  describe('FTS5 INSERT trigger sync', () => {
    it('makes a new log searchable immediately after createLog', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, message: 'uniquemarker' });
      const { data } = await db.findLogs({ limit: 50, q: 'uniquemarker' });
      expect(data).toHaveLength(1);
    });
  });
});
