import { afterAll, afterEach, beforeAll } from 'vitest';

import { worker } from './mocks/browser.ts';

// The real stylesheet, so specs exercise real layout: scroll behavior (pin
// to bottom, the "↓ N new" pill) only exists when the list actually has a
// bounded height and overflows.
import './index.css';

// Browser-mode MSW: start the service worker (served by msw/vite), once for
// the whole run. resetHandlers() between tests drops any per-test overrides
// (worker.use(...) — e.g. simulating a 500 or network error) so they don't leak.
beforeAll(async () => {
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true });
});

afterEach(() => {
  worker.resetHandlers();
});

afterAll(async () => {
  await worker.stop();
});
