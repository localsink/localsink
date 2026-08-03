#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { z } from 'zod';

import {
  configured,
  DEFAULT_DB_FILE_NAME,
  DEFAULT_PORT,
  loadEnv,
  resolveDbFileName,
} from './config.ts';
import { startServer } from './server.ts';

const USAGE = `localsink — local-first log sink with a searchable UI, API and MCP server.

Usage: localsink [options]

Options:
  -p, --port <number>  Port to listen on (env PORT) [default: ${String(DEFAULT_PORT)}]
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

loadEnv();

const portInput = configured(values.port, process.env['PORT']);
const portResult = z.coerce
  .number()
  .int()
  .min(0)
  .max(65535)
  .default(DEFAULT_PORT)
  .safeParse(portInput);
if (!portResult.success) {
  process.stderr.write(
    `Invalid port "${String(portInput)}": ${portResult.error.issues.map((i) => i.message).join('; ')}\n`,
  );
  process.exit(1);
}

// The build copies the SPA to dist/public, next to the bundled CLI. From
// source this is src/public, which doesn't exist, so dev serves API + MCP only.
const bundledStatic = join(import.meta.dirname, 'public');

await startServer({
  port: portResult.data,
  dbFileName: resolveDbFileName(values.db),
  ...(existsSync(bundledStatic) ? { staticDir: bundledStatic } : {}),
});
