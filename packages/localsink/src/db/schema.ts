import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const logsTable = sqliteTable(
  'logs',
  {
    id: int().primaryKey({ autoIncrement: true }),
    service_name: text().notNull(),
    timestamp: int().notNull(),
    level: text().notNull(),
    message: text().notNull(),
    trace_id: text(),
    span_id: text(),
    logger: text(),
    error: text({ mode: 'json' }).$type<{
      message?: string | undefined;
      stack?: string | undefined;
      type?: string | undefined;
      [key: string]: unknown;
    }>(),
    attributes: text({ mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (t) => [
    index('idx_logs_timestamp').on(t.timestamp, t.id),
    index('idx_logs_service_name').on(t.service_name, t.timestamp, t.id),
    index('idx_logs_level').on(t.level, t.timestamp, t.id),
    index('idx_logs_trace_id').on(t.trace_id),
    index('idx_logs_logger').on(t.logger),
  ],
);

const errorPayloadSchema = z
  .looseObject({
    message: z.string().optional(),
    stack: z.string().optional(),
    type: z.string().optional(),
  })
  .nullable()
  .optional();

const attributesSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional();

export const logsApiInsertSchema = createInsertSchema(logsTable, {
  error: errorPayloadSchema,
  attributes: attributesSchema,
}).omit({ id: true });
