import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import { makeDatabase } from './database.ts';
import type { Database } from './database.ts';

export { createApp } from './app.ts';
export { makeDatabase } from './database.ts';
export type { Database } from './database.ts';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function applySchema(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}

export async function createTestDatabase(): Promise<Database> {
  const db = drizzle(':memory:');
  await applySchema(db);
  return makeDatabase(db);
}
