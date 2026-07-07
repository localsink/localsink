import { setTimeout as sleep } from 'node:timers/promises';
import { format } from 'node:util';

import { sampleLogs } from '@localsink/contract/fixtures';
import { createClient } from '@localsink/sdk';
import type { LogInput } from '@localsink/sdk';

// Emits a continuous stream of synthetic logs against a *running* server
// through the real ingest path (SDK → POST /api/logs) — unlike seed.ts, which
// writes straight to the database. Use it to exercise live tailing in the web
// UI. The SDK transport is fire-and-forget by design (delivery errors are
// swallowed so logging can never crash a host app), so reachability is probed
// once up front instead. Runs until Ctrl-C.

const url = process.env['LOCALSINK_URL'] ?? 'http://localhost:3000';

try {
  const response = await fetch(new URL('/api/logs/meta', url));
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
} catch (error) {
  process.stderr.write(
    `No localsink server reachable at ${url}: ${format(error)}\n` +
      'Start one first: `pnpm dev` or `pnpm start`.\n',
  );
  process.exit(1);
}

// Service/logger pairings derive from the seed fixtures so emitted traffic
// lands in the same facets the seeded data established. One client per
// service, exactly like real instrumented services would hold.
const services = [
  ...new Map(sampleLogs.map((log) => [log.service_name, log.logger])),
].map(([serviceName, logger]) => ({
  serviceName,
  logger,
  client: createClient({ serviceName, url }),
}));

// Weighted by repetition: mostly info/debug so warn/error stay meaningful.
const LEVELS = [
  'info',
  'info',
  'info',
  'info',
  'info',
  'debug',
  'debug',
  'debug',
  'warn',
  'warn',
  'error',
  'trace',
] as const;

const MESSAGES: Record<(typeof LEVELS)[number], string[]> = {
  info: [
    'request handled',
    'user session refreshed',
    'job completed',
    'cache warmed',
    'webhook delivered',
  ],
  debug: [
    'cache lookup',
    'query executed in 4ms',
    'retry scheduled',
    'config reloaded',
  ],
  warn: [
    'slow query detected',
    'rate limit approaching',
    'retrying upstream call',
  ],
  error: [
    'charge declined',
    'connection reset by peer',
    'upstream timeout after 3000ms',
  ],
  trace: ['enter handler', 'span started'],
};

function pick<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function buildLog(logger: string | null): LogInput {
  const level = pick(LEVELS);
  const message = pick(MESSAGES[level]);
  const input: LogInput = {
    timestamp: Date.now(),
    level,
    message,
    logger,
    attributes: {
      req_id: `req_${Math.random().toString(36).slice(2, 8)}`,
      duration_ms: Math.floor(Math.random() * 900) + 5,
    },
  };
  if (level === 'error') {
    input.error = {
      type: 'Error',
      message,
      stack:
        `Error: ${message}\n` +
        '    at handler (src/routes.ts:42:11)\n' +
        '    at dispatch (src/app.ts:17:5)',
    };
  }
  return input;
}

process.stdout.write(`Emitting synthetic logs to ${url} — Ctrl-C to stop.\n`);
for (;;) {
  const { serviceName, logger, client } = pick(services);
  const input = buildLog(logger);
  await client.log(input);
  process.stdout.write(
    `${serviceName.padEnd(14)} ${input.level.padEnd(5)} ${input.message}\n`,
  );
  await sleep(300 + Math.random() * 2200);
}
