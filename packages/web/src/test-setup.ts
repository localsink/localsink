import { afterAll, afterEach, beforeAll } from 'vitest';

import { worker } from './mocks/browser.ts';

// Browser-mode MSW: start the same service worker the dev app uses, once for
// the whole run. resetHandlers() between tests drops any per-test overrides
// (worker.use(...) — e.g. simulating a 500 or network error) so they don't leak.
beforeAll(async () => {
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
});

afterEach(() => {
  worker.resetHandlers();
});

afterAll(() => {
  worker.stop();
});
