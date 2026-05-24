import { fileURLToPath } from 'node:url';

import type { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function applySchema(
  db: ReturnType<typeof drizzle>,
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
