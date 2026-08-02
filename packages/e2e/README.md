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

### Dev server locally, built bundle in CI

Locally the SPA is served by `vite dev`, so editing app source and re-running just works. **In CI it is served by `vite preview` against `packages/web/dist`** — CI runs `build:all` before `e2e:all`, and the built bundle is the only place minification, Tailwind's class purge, and the React Compiler's production output are exercised. A failure that reproduces only in CI is most likely one of those.

To reproduce a CI run locally, build first:

```sh
pnpm --filter @localsink/web build
CI=1 pnpm --filter @localsink/e2e e2e
```

`CI=1` also enables retries and `forbidOnly`, and disables dev-server reuse. Note that `preview` serves whatever is in `dist` — rebuild after changing app source, or you are testing a stale bundle.

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

**Every test gets its own backend.** The `backend` fixture (`src/backend.ts`) starts the real Hono app over a fresh in-memory libSQL database on an OS-assigned port, seeded from `@localsink/contract/fixtures`, and tears it down afterwards. Tests may ingest freely and assert exact row counts — nothing leaks between them, and specs run fully parallel.

The frontend server is the one shared process. It's stateless — it only serves the SPA — so it costs nothing in isolation terms. Page requests to `/api/*` are intercepted and routed to the test's own backend, so no proxy is involved (which is also why `vite preview`, which ignores `server.proxy`, works unchanged).

If per-test backend startup ever shows up in profiles, `backend` can be changed to `{ scope: 'worker' }` in `src/fixtures.ts` — at the cost of state accumulating across the tests in a worker.

## Fault injection

`app.goOffline()` / `app.failNextPolls(n)` register their own routes, which take precedence over the backend binding (Playwright matches the most recently registered handler first). A fault injector that wants a request to reach the backend must call `route.fallback()`, not `route.continue()` — `continue()` goes to the network, where nothing is listening.
