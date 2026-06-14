# @localsink/test-harness

Spin up a real localsink server backed by an in-memory database, for integration-testing custom transports against the actual wire.

If you are building a transport for a logger that localsink doesn't ship with — or wiring up an application that talks to localsink directly — this harness gives you the production server (real Hono routes, real Drizzle queries, real FTS5 triggers) on a random port, with a fresh empty database, on every call. No mocks, no fakes, no manual teardown.

## Install

```sh
pnpm add -D @localsink/test-harness
```

```sh
npm install --save-dev @localsink/test-harness
```

```sh
yarn add --dev @localsink/test-harness
```

Requires [Vitest](https://vitest.dev) — the harness uses `onTestFinished` to register automatic cleanup, so it must run inside a Vitest test.

## Usage

```ts
import { startTestServer } from '@localsink/test-harness';

import { myTransport } from './my-transport.ts';

describe('my-transport → server → DB', () => {
  it('persists a log end-to-end', async () => {
    const { url, db } = await startTestServer();

    // Point your transport at the harness's URL — exactly as a real user would.
    const logger = myTransport({ serviceName: 'test-service', url });
    logger.info('hello world');

    // Assert against the persisted state via the same Database API the server uses.
    await vi.waitFor(async () => {
      const { data } = await db.findLogs({ limit: 50 });
      expect(data).toEqual([
        expect.objectContaining({
          service_name: 'test-service',
          level: 'info',
          message: 'hello world',
        }),
      ]);
    });
  });
});
```

`db.findLogs` accepts the same `LogFilter` as `GET /api/logs` (including `q` for FTS5), so column-scoped full-text queries like `q: 'error_text:timeout'` can be asserted directly against the harness's database — useful for verifying that your transport's structured fields land in the FTS index correctly.

See [`packages/console/src/transport.integration.spec.ts`](../console/src/transport.integration.spec.ts) for richer examples (error extraction, FTS round-trips, multi-call ordering).

## API

### `startTestServer(): Promise<TestServer>`

Boots a fresh harness and returns:

```ts
interface TestServer {
  url: string; // e.g. "http://localhost:54321"
  db: Database; // the localsink Database API
}
```

Each call:

1. Creates a new in-memory libSQL database (`:memory:`).
2. Applies the localsink schema, including the FTS5 virtual table and `AFTER INSERT` trigger.
3. Mounts the real Hono app via `@hono/node-server` on **port 0** (the OS picks a free port).
4. Registers a `onTestFinished` hook that closes the server and the DB when the current test ends.

Because port allocation is automatic and each test gets its own database, harness instances are safe to use under Vitest's parallel pool — there is no shared state to contend for.

The returned `db` is the same `Database` object the server uses internally, so any method on it (e.g. `findLogs`, `findLogById`, `getMeta`, `createLog`) is available for direct assertions.
