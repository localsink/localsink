import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';

import { startServer } from 'localsink';
import type { Database } from 'localsink';

import { sampleLogs } from '@localsink/contract/fixtures';

const localsinkPackageJson = findPackageJSON('localsink', import.meta.url);
if (!localsinkPackageJson) {
  throw new Error('Cannot locate localsink. Is the dependency installed?');
}

/**
 * The SPA as `npx localsink` serves it. Built, not Vite-served, so these tests
 * exercise minification, Tailwind's purge and the React Compiler's production
 * output. global-setup.ts guarantees it exists.
 */
export const staticDir = join(dirname(localsinkPackageJson), 'dist', 'public');

export interface Backend {
  url: string;
  db: Database;
  close: () => Promise<void>;
}

export async function startBackend(): Promise<Backend> {
  const { url, db, close } = await startServer({
    port: 0,
    dbFileName: ':memory:',
    staticDir,
  });
  for (const log of sampleLogs) await db.createLog(log);

  return { url, db, close };
}
