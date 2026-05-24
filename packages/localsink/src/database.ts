import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';

import { logsTable } from './db/schema.ts';

type DrizzleClient = ReturnType<typeof drizzle>;

export function makeDatabase(db: DrizzleClient) {
  async function findAllLogs() {
    return await db.select().from(logsTable);
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
    findAllLogs,
    findLogById,
    createLog,
    close,
  };
}

export async function initializeDatabase() {
  process.loadEnvFile();
  const dbFileName = process.env['DB_FILE_NAME'];
  if (!dbFileName) {
    throw new Error('DB_FILE_NAME environment variable is not set.');
  }

  const db = drizzle(dbFileName);
  await db.run(sql`PRAGMA journal_mode = WAL`);

  return makeDatabase(db);
}

export type Database = ReturnType<typeof makeDatabase>;
