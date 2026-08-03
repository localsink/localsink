#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import { DEFAULT_DB_FILE_NAME } from './database.ts';
import { startServer } from './server.ts';

const USAGE = `localsink — local-first log sink with a searchable UI, API and MCP server.

Usage: localsink [options]

Options:
  -p, --port <number>  Port to listen on (env PORT) [default: 3000]
  -d, --db <file>      libSQL database file (env DB_FILE_NAME)
                       [default: ${DEFAULT_DB_FILE_NAME}]
  -h, --help           Show this message
`;

// Flags win over the environment, which wins over the defaults.
const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
    db: { type: 'string', short: 'd' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

// A .env in the working directory is optional; shell env works just as well.
try {
  process.loadEnvFile();
} catch {
  // no .env to load
}

const portInput = values.port ?? process.env['PORT'];
const portResult = z.coerce
  .number()
  .int()
  .min(0)
  .max(65535)
  .default(3000)
  .safeParse(portInput);
if (!portResult.success) {
  process.stderr.write(
    `Invalid port "${String(portInput)}": ${portResult.error.issues.map((i) => i.message).join('; ')}\n`,
  );
  process.exit(1);
}

// The build copies the SPA to dist/public, so this resolves next to the
// bundled CLI. Running from source it points at src/public, which doesn't
// exist — so dev serves API + MCP only and Vite keeps serving the UI.
const bundledStatic = join(import.meta.dirname, 'public');

await startServer({
  port: portResult.data,
  dbFileName: values.db ?? process.env['DB_FILE_NAME'] ?? DEFAULT_DB_FILE_NAME,
  ...(existsSync(bundledStatic) ? { staticDir: bundledStatic } : {}),
});
