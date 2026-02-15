import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const logsTable = sqliteTable('logs', {
  id: int().primaryKey({ autoIncrement: true }),
  application: text().notNull(),
  timestamp: int().notNull(),
  level: text().notNull(),
  message: text().notNull(),
  logger: text(),
  error: text({ mode: 'json' }).$type<{
    message?: string;
    stack?: string;
    type?: string;
  }>(),
  context: text({ mode: 'json' }).$type<Record<string, unknown>>(),
});
