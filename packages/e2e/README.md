# @localsink/e2e

Browser-level end-to-end tests: the real SPA, served by Vite, talking to a real Hono backend over a real libSQL database, driven through Chromium.

## Running

```sh
pnpm --filter @localsink/e2e e2e      # headless
pnpm --filter @localsink/e2e e2e:ui   # Playwright UI mode
```

First run locally needs the browser:

```sh
pnpm exec playwright install chromium chromium-headless-shell
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

**One backend is shared by the whole run**, so specs must not assume they own the database:

- Assert on presence, never exact totals — `tail.e2e.spec.ts` adds rows to the same backend.
- If you ingest, do it under a unique token (see `tail.e2e.spec.ts`) and assert only on rows carrying it.
