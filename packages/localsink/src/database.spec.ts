import { drizzle } from 'drizzle-orm/libsql';

import { InvalidQueryError, makeDatabase } from './database.ts';
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
      const { data } = await db.findLogs({
        limit: 50,
        service_name: ['auth'],
      });
      expect(data).toHaveLength(1);
      expect(data[0]?.service_name).toBe('auth');
    });

    it('filters by multiple service_name values', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, service_name: 'auth' });
      await db.createLog({ ...minimalLog, service_name: 'payments' });
      await db.createLog({ ...minimalLog, service_name: 'web' });
      const { data } = await db.findLogs({
        limit: 50,
        service_name: ['auth', 'web'],
      });
      expect(data.map((r) => r.service_name).toSorted()).toEqual([
        'auth',
        'web',
      ]);
    });

    it('filters by level', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, level: 'error' });
      await db.createLog({ ...minimalLog, level: 'info' });
      const { data } = await db.findLogs({ limit: 50, level: ['error'] });
      expect(data).toHaveLength(1);
      expect(data[0]?.level).toBe('error');
    });

    it('filters by multiple level values', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, level: 'error' });
      await db.createLog({ ...minimalLog, level: 'warn' });
      await db.createLog({ ...minimalLog, level: 'info' });
      const { data } = await db.findLogs({
        limit: 50,
        level: ['error', 'warn'],
      });
      expect(data.map((r) => r.level).toSorted()).toEqual(['error', 'warn']);
    });

    it('filters by trace_id', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, trace_id: 'trace-1' });
      await db.createLog({ ...minimalLog, trace_id: 'trace-2' });
      const { data } = await db.findLogs({ limit: 50, trace_id: 'trace-1' });
      expect(data).toHaveLength(1);
      expect(data[0]?.trace_id).toBe('trace-1');
    });

    it('filters by logger', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, logger: 'winston' });
      await db.createLog({ ...minimalLog, logger: 'pino' });
      await db.createLog({ ...minimalLog, logger: null });
      const { data } = await db.findLogs({ limit: 50, logger: 'winston' });
      expect(data).toHaveLength(1);
      expect(data[0]?.logger).toBe('winston');
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
        service_name: ['auth'],
        level: ['error'],
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
          cursor: `${String(last1.timestamp)}:${String(last1.id)}`,
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
          cursor: `${String(last1.timestamp)}:${String(last1.id)}`,
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

      it('throws InvalidQueryError when both cursor and offset are provided', async () => {
        const db = await createDb();
        await expect(
          db.findLogs({
            limit: 2,
            cursor: '1000:1',
            offset: 0,
          }),
        ).rejects.toBeInstanceOf(InvalidQueryError);
      });

      describe('after_id', () => {
        it('returns only rows with id greater than after_id, ordered ASC', async () => {
          const db = await createDb();
          await db.createLog({ ...minimalLog, message: 'a' });
          await db.createLog({ ...minimalLog, message: 'b' });
          await db.createLog({ ...minimalLog, message: 'c' });
          // findLogs default is DESC; pick the middle row
          const { data: all } = await db.findLogs({ limit: 50 });
          const b = all.find((r) => r.message === 'b');
          if (!b) throw new Error('expected row b');
          const { data, next_cursor } = await db.findLogs({
            limit: 50,
            after_id: b.id,
          });
          expect(data).toHaveLength(1);
          expect(data[0]?.message).toBe('c');
          expect(data[0]?.id).toBeGreaterThan(b.id);
          expect(next_cursor).toBeNull();
        });

        it('returns empty when after_id is at or past the latest id', async () => {
          const db = await createDb();
          await db.createLog({ ...minimalLog, message: 'only' });
          const { data: all } = await db.findLogs({ limit: 50 });
          const only = all[0];
          if (!only) throw new Error('expected a row');
          const { data } = await db.findLogs({ limit: 50, after_id: only.id });
          expect(data).toHaveLength(0);
        });

        it('respects limit and returns next_cursor null (client uses last row id)', async () => {
          const db = await createDb();
          await db.createLog({ ...minimalLog, message: 'seed' });
          for (let i = 0; i < 5; i++) {
            await db.createLog({ ...minimalLog, message: `new-${String(i)}` });
          }
          const { data: all } = await db.findLogs({ limit: 50 });
          const seed = all.find((r) => r.message === 'seed');
          if (!seed) throw new Error('expected seed row');
          const { data, next_cursor, has_more } = await db.findLogs({
            limit: 3,
            after_id: seed.id,
          });
          expect(data).toHaveLength(3);
          expect(next_cursor).toBeNull();
          expect(has_more).toBe(true);
          const ids = data.map((r) => r.id);
          expect(ids).toEqual(ids.toSorted((a, b) => a - b));
        });

        it('respects active filters alongside after_id', async () => {
          const db = await createDb();
          await db.createLog({
            ...minimalLog,
            service_name: 'auth',
            message: 'seed',
          });
          await db.createLog({
            ...minimalLog,
            service_name: 'auth',
            message: 'auth-new',
          });
          await db.createLog({
            ...minimalLog,
            service_name: 'payments',
            message: 'payments-new',
          });
          const { data: all } = await db.findLogs({ limit: 50 });
          const seed = all.find((r) => r.message === 'seed');
          if (!seed) throw new Error('expected seed row');
          const { data } = await db.findLogs({
            limit: 50,
            after_id: seed.id,
            service_name: ['auth'],
          });
          expect(data).toHaveLength(1);
          expect(data[0]?.message).toBe('auth-new');
        });

        it('throws InvalidQueryError when combined with cursor', async () => {
          const db = await createDb();
          await expect(
            db.findLogs({ limit: 2, after_id: 0, cursor: '1000:1' }),
          ).rejects.toBeInstanceOf(InvalidQueryError);
        });

        it('throws InvalidQueryError when combined with offset', async () => {
          const db = await createDb();
          await expect(
            db.findLogs({ limit: 2, after_id: 0, offset: 0 }),
          ).rejects.toBeInstanceOf(InvalidQueryError);
        });

        it('after_id=0 returns all rows from the beginning, ordered ASC', async () => {
          const db = await createDb();
          await db.createLog({ ...minimalLog, message: 'a' });
          await db.createLog({ ...minimalLog, message: 'b' });
          await db.createLog({ ...minimalLog, message: 'c' });
          const { data } = await db.findLogs({ limit: 50, after_id: 0 });
          expect(data.map((r) => r.message)).toEqual(['a', 'b', 'c']);
        });

        it('chained polling catches up without gaps or duplicates', async () => {
          const db = await createDb();
          for (let i = 1; i <= 5; i++) {
            await db.createLog({ ...minimalLog, message: `m-${String(i)}` });
          }
          const page1 = await db.findLogs({ limit: 2, after_id: 0 });
          expect(page1.data.map((r) => r.message)).toEqual(['m-1', 'm-2']);

          const last1 = page1.data.at(-1);
          if (!last1) throw new Error('expected page1 to have rows');
          const page2 = await db.findLogs({ limit: 2, after_id: last1.id });
          expect(page2.data.map((r) => r.message)).toEqual(['m-3', 'm-4']);

          const last2 = page2.data.at(-1);
          if (!last2) throw new Error('expected page2 to have rows');
          const page3 = await db.findLogs({ limit: 2, after_id: last2.id });
          expect(page3.data.map((r) => r.message)).toEqual(['m-5']);

          const last3 = page3.data.at(-1);
          if (!last3) throw new Error('expected page3 to have rows');
          const page4 = await db.findLogs({ limit: 2, after_id: last3.id });
          expect(page4.data).toHaveLength(0);
        });

        it('respects q (FTS5) alongside after_id', async () => {
          const db = await createDb();
          await db.createLog({ ...minimalLog, message: 'seed payment' });
          await db.createLog({ ...minimalLog, message: 'payment failed' });
          await db.createLog({ ...minimalLog, message: 'user signed in' });
          await db.createLog({ ...minimalLog, message: 'payment retried' });
          const { data: all } = await db.findLogs({ limit: 50 });
          const seed = all.find((r) => r.message === 'seed payment');
          if (!seed) throw new Error('expected seed row');
          const { data } = await db.findLogs({
            limit: 50,
            after_id: seed.id,
            q: 'payment',
          });
          expect(data.map((r) => r.message)).toEqual([
            'payment failed',
            'payment retried',
          ]);
        });
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
        service_name: ['auth'],
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
        cursor: `${String(last1.timestamp)}:${String(last1.id)}`,
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

    it('treats free text with punctuation as a literal phrase', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { request_id: 'key-2024-q1' },
      });
      await db.createLog({
        ...minimalLog,
        attributes: { request_id: 'other' },
      });
      // Raw `key-2024-q1` is invalid FTS5 syntax; the fallback phrase matches
      // the indexed tokens key/2024/q1.
      const { data } = await db.findLogs({ limit: 50, q: 'key-2024-q1' });
      expect(data).toHaveLength(1);
      expect(data[0]?.attributes).toEqual({ request_id: 'key-2024-q1' });
    });

    it('does not throw on quote characters in q (literal fallback)', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, message: 'anything' });
      const { data } = await db.findLogs({ limit: 50, q: 'foo"bar' });
      expect(data).toEqual([]);
    });

    it('matches a token in error.message', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        error: { message: 'connection timeout' },
      });
      await db.createLog({ ...minimalLog, message: 'unrelated' });
      const { data } = await db.findLogs({ limit: 50, q: 'timeout' });
      expect(data).toHaveLength(1);
      expect(data[0]?.error?.message).toBe('connection timeout');
    });

    it('matches a token in error.stack', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        error: {
          message: 'boom',
          stack:
            'Error: boom\n    at handlePayment (/app/payments.ts:42:7)\n    at processOrder (/app/orders.ts:13:3)',
        },
      });
      const { data } = await db.findLogs({ limit: 50, q: 'handlePayment' });
      expect(data).toHaveLength(1);
    });

    it('matches a token in an arbitrary error key (looseObject)', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        error: { message: 'failed', cause: 'upstreamBigqueryQuota' },
      });
      const { data } = await db.findLogs({
        limit: 50,
        q: 'upstreamBigqueryQuota',
      });
      expect(data).toHaveLength(1);
    });

    it('matches a top-level attribute value', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { user_id: 'alice' },
      });
      await db.createLog({ ...minimalLog, attributes: { user_id: 'bob' } });
      const { data } = await db.findLogs({ limit: 50, q: 'alice' });
      expect(data).toHaveLength(1);
      expect(data[0]?.attributes).toEqual({ user_id: 'alice' });
    });

    it('matches a nested attribute value (recursive json_tree)', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { user: { name: 'alice', role: 'admin' } },
      });
      const { data } = await db.findLogs({ limit: 50, q: 'alice' });
      expect(data).toHaveLength(1);
    });

    it('matches an attribute key', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { order_id: 'ord-123' },
      });
      const { data } = await db.findLogs({ limit: 50, q: 'order_id' });
      expect(data).toHaveLength(1);
    });

    it('matches a numeric attribute value', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { user_id: 42 },
      });
      const { data } = await db.findLogs({ limit: 50, q: '42' });
      expect(data).toHaveLength(1);
    });

    it('matches boolean attribute keys and values', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { active: true, retryable: false },
      });
      const activeKey = await db.findLogs({ limit: 50, q: 'active' });
      expect(activeKey.data).toHaveLength(1);
      const activeVal = await db.findLogs({ limit: 50, q: 'true' });
      expect(activeVal.data).toHaveLength(1);
      const retryableVal = await db.findLogs({ limit: 50, q: 'false' });
      expect(retryableVal.data).toHaveLength(1);
    });

    it('does not index numeric array indices as tokens', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        attributes: { tags: ['error', 'auth'] },
      });
      const { data } = await db.findLogs({ limit: 50, q: '0' });
      expect(data).toHaveLength(0);
    });

    it('treats null error and attributes as empty (no false positives, no crash)', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, message: 'plain' });
      // null is a valid input — the trigger must not blow up and must not match anything.
      const empty = await db.findLogs({ limit: 50, q: 'nonexistent' });
      expect(empty.data).toEqual([]);
      const hit = await db.findLogs({ limit: 50, q: 'plain' });
      expect(hit.data).toHaveLength(1);
    });

    it('supports column-scoped queries', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        message: 'timeout while saving',
      });
      await db.createLog({
        ...minimalLog,
        message: 'saved ok',
        error: { message: 'timeout while flushing' },
      });
      const errorScoped = await db.findLogs({
        limit: 50,
        q: 'error_text:timeout',
      });
      expect(errorScoped.data).toHaveLength(1);
      expect(errorScoped.data[0]?.message).toBe('saved ok');

      const messageScoped = await db.findLogs({
        limit: 50,
        q: 'message:timeout',
      });
      expect(messageScoped.data).toHaveLength(1);
      expect(messageScoped.data[0]?.message).toBe('timeout while saving');
    });
  });

  describe('FTS5 INSERT trigger sync', () => {
    it('makes a new log searchable immediately after createLog', async () => {
      const db = await createDb();
      await db.createLog({ ...minimalLog, message: 'uniquemarker' });
      const { data } = await db.findLogs({ limit: 50, q: 'uniquemarker' });
      expect(data).toHaveLength(1);
    });

    it('indexes message, error, and attributes from a single insert', async () => {
      const db = await createDb();
      await db.createLog({
        ...minimalLog,
        message: 'msgUniqueToken',
        error: { message: 'errUniqueToken' },
        attributes: { attr_unique_token: 'valUniqueToken' },
      });
      for (const q of [
        'msgUniqueToken',
        'errUniqueToken',
        'attr_unique_token',
        'valUniqueToken',
      ]) {
        const { data } = await db.findLogs({ limit: 50, q });
        expect(data, `expected hit for q=${q}`).toHaveLength(1);
      }
    });
  });
});
