import type { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const migrationsFolder = `${import.meta.dirname}/../drizzle`;

export async function applySchema(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
