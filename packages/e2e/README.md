# @localsink/e2e

Browser-level end-to-end tests: the real SPA talking to a real Hono backend over a real libSQL database, driven through Chromium.

## Running

```sh
pnpm --filter @localsink/e2e e2e      # headless
pnpm --filter @localsink/e2e e2e:ui   # Playwright UI mode
```

First run locally needs the browser:

```sh
pnpm exec playwright install chromium chromium-headless-shell
```

### The built bundle, always

There is no Vite server. Each test's backend serves the SPA out of `packages/localsink/dist/public` exactly as `npx localsink` does, so every run exercises minification, Tailwind's class purge, the React Compiler's production output, and the real static-asset and SPA-fallback routes.

That build is a prerequisite. `src/global-setup.ts` runs it for you locally — which also stops the assets going stale after an edit to `packages/web` — and skips it under `CI`, where `build:all` has already run before `e2e:all`. Either way it fails with an actionable message if the assets are missing.

Set `CI=1` to skip the build and use whatever is in `dist` (also enables retries and `forbidOnly`):

```sh
pnpm --filter 'localsink...' build
CI=1 pnpm --filter @localsink/e2e e2e
```

## Writing a spec

Import `test` and `expect` from `./fixtures.ts`, which extends Playwright's `test` with an `app` fixture — an `AppPage` page object over the SPA:

```ts
import { expect, test } from './fixtures.ts';

test('does the thing', async ({ app }) => {
  await app.goto(); // waits for connected + first rows
  await app.facet('api').click();
  await expect(app.rowWithText('GET /health 200')).toBeVisible();
});
```

Prefer adding a locator or helper to `AppPage` over inlining selectors in a spec.

## Isolation

**Every test gets its own server.** The `backend` fixture (`src/backend.ts`) starts the real Hono app — SPA, API and MCP together — over a fresh in-memory libSQL database on an OS-assigned port, seeded from `@localsink/contract/fixtures`, and tears it down afterwards. Tests may ingest freely and assert exact row counts — nothing leaks between them, and specs run fully parallel.

Nothing is shared, and nothing is intercepted. A `baseURL` fixture points each test at its own server, so the page and `ingestLog`'s request context are both genuinely same-origin against it — the same single-origin arrangement a user gets from `npx localsink`.

If per-test startup ever shows up in profiles, `backend` can be changed to `{ scope: 'worker' }` in `src/fixtures.ts` — at the cost of state accumulating across the tests in a worker.

## Fault injection

`app.goOffline()` / `app.failNextPolls(n)` register a `page.route` over the tail poll (`/api/logs` exactly, so the separate `/api/logs/meta` poll is untouched) and abort matching requests. A fault injector that wants a request to go through calls `route.continue()` — the network is this test's own backend.
