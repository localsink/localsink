#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, parseArgs } from 'node:util';

import { z } from 'zod';

import type { LicenseStatus } from '@localsink/contract';

import {
  configured,
  DEFAULT_DB_FILE_NAME,
  DEFAULT_PORT,
  loadEnv,
  resolveDbFileName,
} from './config.ts';
import { openLicenseManager } from './license/manager.ts';
import type { LicenseManager } from './license/manager.ts';
import { startServer } from './server.ts';
import type { ServerHandle } from './server.ts';

const USAGE = `localsink — local-first log sink with a searchable UI, API and MCP server.

Usage: localsink [options]

Options:
  -p, --port <number>  Port to listen on (env PORT) [default: ${String(DEFAULT_PORT)}]
  -d, --db <file>      libSQL database file (env DB_FILE_NAME)
                       [default: ${DEFAULT_DB_FILE_NAME}]
  -v, --version        Print the version
  -h, --help           Show this message

Environment:
  LOCALSINK_LICENSE_KEY  Commercial license key, for containers and other
                         setups without a persistent home directory
`;

function fail(message: string): never {
  process.stderr.write(message);
  process.exit(1);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : format(error);
}

/** startServer keeps its errors CLI-agnostic; the flag hint belongs here. */
function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.cause instanceof Error &&
    'code' in error.cause &&
    error.cause.code === 'EADDRINUSE'
  );
}

/** One startup line, from what is already known — never waits on the network. */
function describeEdition(status: LicenseStatus): string {
  if (status.edition === 'licensed' && status.expires_at !== null) {
    const through = new Date(status.expires_at).toISOString().slice(0, 10);
    return `Licensed to ${status.customer ?? 'unknown'} through ${through}`;
  }
  if (status.reason === 'unverified') return 'License: checking…';
  return 'Community Edition';
}

const manifestSchema = z.object({ version: z.string() });

/** `src/` and `dist/` both sit one level below the package manifest. */
function readVersion(): string {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    );
    return manifestSchema.parse(manifest).version;
  } catch {
    return 'unknown';
  }
}

// parseArgs throws on unknown flags and stray positionals; report those like
// any other bad input rather than as a stack trace.
function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        port: { type: 'string', short: 'p' },
        db: { type: 'string', short: 'd' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return fail(`${describe(error)}\n\n${USAGE}`);
  }
}

const { values } = parseCliArgs();

if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

if (values.version) {
  process.stdout.write(`${readVersion()}\n`);
  process.exit(0);
}

loadEnv();

// Flags win over the environment, which wins over the defaults.
const portInput = configured(values.port, process.env['PORT']);
const portResult = z.coerce
  .number()
  .int()
  .min(0)
  .max(65535)
  .default(DEFAULT_PORT)
  .safeParse(portInput);
if (!portResult.success) {
  fail(
    `Invalid port "${String(portInput)}": ${portResult.error.issues.map((i) => i.message).join('; ')}\n`,
  );
}

let license: LicenseManager;
try {
  license = await openLicenseManager({
    version: readVersion(),
    envKey: configured(process.env['LOCALSINK_LICENSE_KEY']),
    licensingUrl: configured(process.env['LOCALSINK_LICENSING_URL']),
  });
} catch (error) {
  fail(`${describe(error)}\n`);
}

// The build copies the SPA to dist/public, next to the bundled CLI. From
// source this is src/public, which doesn't exist, so dev serves API + MCP only.
const bundledStatic = join(import.meta.dirname, 'public');

let server: ServerHandle;
try {
  server = await startServer({
    port: portResult.data,
    dbFileName: resolveDbFileName(values.db),
    license,
    ...(existsSync(bundledStatic) ? { staticDir: bundledStatic } : {}),
  });
} catch (error) {
  fail(
    `${describe(error)}${isAddressInUse(error) ? ' Choose another with --port <number>.' : ''}\n`,
  );
}

process.stdout.write(`Server is listening on ${server.url}\n`);
process.stdout.write(`${describeEdition(await license.status())}\n`);

const shutdown = () => {
  void server.close().then(
    () => process.exit(0),
    (error: unknown) => fail(`${describe(error)}\n`),
  );
};
// `once`, not `on`: a second Ctrl-C falls through to Node's default handler and
// kills the process, which is the escape hatch if a shutdown ever stalls.
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
