import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  max,
  min,
  or,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { z } from 'zod';

import { logsTable } from './db/schema.ts';

type DrizzleClient = ReturnType<typeof drizzle>;
type LogRow = typeof logsTable.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const CURSOR_REGEX = /^(\d+):(\d+)$/;

export class InvalidQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQueryError';
  }
}

function encodeCursor(row: { timestamp: number; id: number }): string {
  return `${String(row.timestamp)}:${String(row.id)}`;
}

const cursorSchema = z
  .string()
  .regex(CURSOR_REGEX, 'Cursor must be in the format "<timestamp>:<id>".')
  .transform((s) => {
    const [tsStr = '', idStr = ''] = s.split(':');
    return { timestamp: Number(tsStr), id: Number(idStr) };
  });

export const logsQuerySchema = z.object({
  service_name: z
    .string()
    .min(1)
    .meta({ description: 'Filter logs by service name.' })
    .optional(),
  level: z
    .string()
    .min(1)
    .meta({
      description: 'Filter logs by level (e.g., info, error, debug).',
    })
    .optional(),
  logger: z
    .string()
    .min(1)
    .meta({
      description: 'Filter logs by logger (e.g., pino, winston, console).',
    })
    .optional(),
  trace_id: z
    .string()
    .min(1)
    .meta({ description: 'Filter logs by trace ID.' })
    .optional(),
  from: z.coerce
    .number()
    .int()
    .min(0)
    .meta({
      description:
        'Filter logs starting from this epoch millisecond timestamp (inclusive).',
    })
    .optional(),
  to: z.coerce
    .number()
    .int()
    .min(0)
    .meta({
      description:
        'Filter logs up to this epoch millisecond timestamp (exclusive).',
    })
    .optional(),
  q: z
    .string()
    .trim()
    .min(1)
    .meta({
      description:
        'FTS5 free-text query on message. Supports prefix queries like "err*", phrases like "\\"failed connection\\"", and boolean operators like "AND/OR/NOT". Malformed queries return 400.',
    })
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .meta({
      description: `Maximum number of logs to return (default ${String(DEFAULT_LIMIT)}, max ${String(MAX_LIMIT)}).`,
    }),
  cursor: cursorSchema
    .meta({
      description:
        "Opaque pagination cursor from a previous response's next_cursor field. Mutually exclusive with offset.",
    })
    .optional(),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .meta({
      description: 'Pagination offset. Mutually exclusive with cursor.',
    })
    .optional(),
});

export type LogFilter = z.infer<typeof logsQuerySchema>;
export type LogPage = { data: LogRow[]; next_cursor: string | null };

export type LogMeta = {
  total: number;
  services: string[];
  levels: string[];
  loggers: string[];
  timestamp_range: { min: number; max: number } | null;
};

export function makeDatabase(db: DrizzleClient) {
  async function findLogs(filter: LogFilter): Promise<LogPage> {
    if (filter.cursor !== undefined && filter.offset !== undefined) {
      throw new InvalidQueryError('Cannot use both cursor and offset.');
    }

    const conditions = [
      filter.service_name !== undefined
        ? eq(logsTable.service_name, filter.service_name)
        : undefined,
      filter.level !== undefined
        ? eq(logsTable.level, filter.level)
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
      filter.to !== undefined ? lt(logsTable.timestamp, filter.to) : undefined,
      filter.q !== undefined
        ? sql`${logsTable.id} IN (SELECT rowid FROM logs_fts WHERE logs_fts MATCH ${filter.q})`
        : undefined,
      filter.cursor !== undefined
        ? or(
            lt(logsTable.timestamp, filter.cursor.timestamp),
            and(
              eq(logsTable.timestamp, filter.cursor.timestamp),
              lt(logsTable.id, filter.cursor.id),
            ),
          )
        : undefined,
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    let query = db
      .select()
      .from(logsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(logsTable.timestamp), desc(logsTable.id))
      .limit(filter.limit + 1)
      .$dynamic();

    if (filter.offset !== undefined) {
      query = query.offset(filter.offset);
    }

    let rows: LogRow[];
    try {
      rows = await query;
    } catch (err) {
      // If `q` was provided, the most likely cause of a query error is an
      // FTS5 syntax problem (unbalanced quote, stray operator, etc.). Surface
      // it as a 400 instead of bubbling up as a 500.
      if (filter.q !== undefined) {
        throw new InvalidQueryError(
          `Invalid FTS5 query: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      throw err;
    }
    const hasNextPage = rows.length > filter.limit;
    const data = hasNextPage ? rows.slice(0, filter.limit) : rows;
    const last = data.at(-1);
    const next_cursor =
      hasNextPage && last !== undefined ? encodeCursor(last) : null;
    return { data, next_cursor };
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

  async function findLogById(id: number) {
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
