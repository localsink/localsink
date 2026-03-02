import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from 'drizzle-zod';

export const logsTable = sqliteTable('logs', {
  id: int().primaryKey({ autoIncrement: true }),
  service_name: text().notNull(),
  timestamp: int().notNull(),
  level: text().notNull(),
  message: text().notNull(),
  trace_id: text(),
  span_id: text(),
  logger: text(),
  error: text({ mode: 'json' }).$type<{
    message?: string;
    stack?: string;
    type?: string;
  }>(),
  attributes: text({ mode: 'json' }).$type<Record<string, unknown>>(),
});

export const logsApiInsertSchema = createInsertSchema(logsTable).omit({
  id: true,
});
