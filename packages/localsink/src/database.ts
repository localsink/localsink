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

export const logsQuerySchema = z
  .object({
    service_name: z.string().min(1).optional(),
    level: z.string().min(1).optional(),
    trace_id: z.string().min(1).optional(),
    from: z.coerce.number().int().optional(),
    to: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    cursor: cursorSchema.optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.cursor !== undefined && d.offset !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'Cannot use both cursor and offset.',
      });
    }
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
    const conditions = [
      filter.service_name !== undefined
        ? eq(logsTable.service_name, filter.service_name)
        : undefined,
      filter.level !== undefined
        ? eq(logsTable.level, filter.level)
        : undefined,
      filter.trace_id !== undefined
        ? eq(logsTable.trace_id, filter.trace_id)
        : undefined,
      filter.from !== undefined
        ? gte(logsTable.timestamp, filter.from)
        : undefined,
      filter.to !== undefined ? lt(logsTable.timestamp, filter.to) : undefined,
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

    const rows = await query;
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
