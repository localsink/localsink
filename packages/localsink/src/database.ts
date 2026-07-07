import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  max,
  min,
  or,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';

import type { LogFilter, LogMeta, LogPage, LogRow } from '@localsink/contract';
import {
  decodeCursor,
  encodeCursor,
  logsQuerySchema,
} from '@localsink/contract';

import { logsTable } from './db/schema.ts';

type DrizzleClient = ReturnType<typeof drizzle>;

export { logsQuerySchema };
export type { LogFilter, LogPage, LogMeta };

export class InvalidQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQueryError';
  }
}

// FTS5 phrase literal (internal quotes doubled). Punctuation inside a phrase is
// tokenized rather than parsed, so free text doesn't trip the MATCH grammar.
function toFtsPhrase(q: string): string {
  return `"${q.replaceAll('"', '""')}"`;
}

export function makeDatabase(db: DrizzleClient) {
  async function findLogs(filter: LogFilter): Promise<LogPage> {
    if (filter.cursor !== undefined && filter.offset !== undefined) {
      throw new InvalidQueryError('Cannot use both cursor and offset.');
    }
    if (filter.after_id !== undefined && filter.cursor !== undefined) {
      throw new InvalidQueryError('Cannot use both after_id and cursor.');
    }
    if (filter.after_id !== undefined && filter.offset !== undefined) {
      throw new InvalidQueryError('Cannot use both after_id and offset.');
    }

    const cursor =
      filter.cursor !== undefined ? decodeCursor(filter.cursor) : undefined;

    const ordering =
      filter.after_id !== undefined
        ? [asc(logsTable.id)]
        : [desc(logsTable.timestamp), desc(logsTable.id)];

    // Factored so `q` can be retried with a fallback MATCH form (undefined = none).
    const runWith = async (
      matchExpr: string | undefined,
    ): Promise<LogRow[]> => {
      const conditions = [
        filter.service_name !== undefined
          ? inArray(logsTable.service_name, filter.service_name)
          : undefined,
        filter.level !== undefined
          ? inArray(logsTable.level, filter.level)
          : undefined,
        filter.logger !== undefined
          ? eq(logsTable.logger, filter.logger)
          : undefined,
        filter.trace_id !== undefined
          ? eq(logsTable.trace_id, filter.trace_id)
          : undefined,
        filter.from !== undefined
          ? gte(logsTable.timestamp, filter.from)
          : undefined,
        filter.to !== undefined
          ? lt(logsTable.timestamp, filter.to)
          : undefined,
        matchExpr !== undefined
          ? sql`${logsTable.id} IN (SELECT rowid FROM logs_fts WHERE logs_fts MATCH ${matchExpr})`
          : undefined,
        filter.after_id !== undefined
          ? gt(logsTable.id, filter.after_id)
          : undefined,
        cursor !== undefined
          ? or(
              lt(logsTable.timestamp, cursor.timestamp),
              and(
                eq(logsTable.timestamp, cursor.timestamp),
                lt(logsTable.id, cursor.id),
              ),
            )
          : undefined,
      ].filter((c): c is NonNullable<typeof c> => c !== undefined);

      let query = db
        .select()
        .from(logsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(...ordering)
        .limit(filter.limit + 1)
        .$dynamic();

      if (filter.offset !== undefined) {
        query = query.offset(filter.offset);
      }

      return await query;
    };

    let rows: LogRow[];
    if (filter.q === undefined) {
      rows = await runWith(undefined);
    } else {
      try {
        // Raw first so power syntax (err*, AND/OR/NOT, "phrases", col:term) works.
        rows = await runWith(filter.q);
      } catch (rawErr) {
        // Punctuation-bearing free text isn't valid FTS5; retry as a phrase.
        // If the phrase retry also fails it's a real DB error (lock/timeout),
        // not bad syntax — propagate the original so it surfaces as 500, not 400.
        try {
          rows = await runWith(toFtsPhrase(filter.q));
        } catch {
          throw rawErr;
        }
      }
    }
    const hasNextPage = rows.length > filter.limit;
    const data = hasNextPage ? rows.slice(0, filter.limit) : rows;
    const last = data.at(-1);
    // after_id mode: client derives the next watermark from data.at(-1).id
    const next_cursor =
      filter.after_id === undefined && hasNextPage && last !== undefined
        ? encodeCursor(last)
        : null;
    return { data, next_cursor, has_more: hasNextPage };
  }

  async function getMeta(): Promise<LogMeta> {
    const [[countRow], serviceRows, levelRows, loggerRows, [rangeRow]] =
      await Promise.all([
        db.select({ total: count() }).from(logsTable),
        db
          .selectDistinct({ service_name: logsTable.service_name })
          .from(logsTable)
          .orderBy(asc(logsTable.service_name)),
        db
          .selectDistinct({ level: logsTable.level })
          .from(logsTable)
          .orderBy(asc(logsTable.level)),
        db
          .selectDistinct({ logger: logsTable.logger })
          .from(logsTable)
          .where(isNotNull(logsTable.logger))
          .orderBy(asc(logsTable.logger)),
        db
          .select({
            min: min(logsTable.timestamp),
            max: max(logsTable.timestamp),
          })
          .from(logsTable),
      ]);

    return {
      total: countRow?.total ?? 0,
      services: serviceRows.map((r) => r.service_name),
      levels: levelRows.map((r) => r.level),
      loggers: loggerRows.flatMap((r) => (r.logger !== null ? [r.logger] : [])),
      timestamp_range:
        rangeRow?.min != null && rangeRow?.max != null
          ? { min: rangeRow.min, max: rangeRow.max }
          : null,
    };
  }

  async function findLogById(id: number): Promise<LogRow | undefined> {
    return await db.select().from(logsTable).where(eq(logsTable.id, id)).get();
  }

  async function createLog(log: typeof logsTable.$inferInsert) {
    await db.insert(logsTable).values(log);
  }

  function close() {
    db.$client.close();
  }

  return {
    findLogs,
    getMeta,
    findLogById,
    createLog,
    close,
  };
}

export async function initializeDatabase() {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional; env vars may be set via shell
  }
  const dbFileName = process.env['DB_FILE_NAME'];
  if (!dbFileName) {
    throw new Error('DB_FILE_NAME environment variable is not set.');
  }

  const db = drizzle(dbFileName);
  await db.run(sql`PRAGMA journal_mode = WAL`);

  return makeDatabase(db);
}

export type Database = ReturnType<typeof makeDatabase>;
