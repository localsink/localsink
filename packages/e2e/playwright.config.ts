import { defineConfig, devices } from '@playwright/test';

// True end-to-end layer: the real React SPA (Vite dev server + proxy) talking to
// the real Hono backend (in-memory libSQL + FTS5, seeded) through a real browser.
// Component-level MSW tests keep their fast unit role; this covers the
// integration seams they can't. Dedicated ports (backend 3100, frontend 5273) so
// a running dev stack on :3000/:5173 doesn't collide.

const BACKEND_PORT = 3100;
const FRONTEND_PORT = 5273;
const isCI = Boolean(process.env['CI']);
// CI installs (and caches) the chromium-headless-shell channel. Environments
// that pre-provision a browser at a fixed path but can't fetch the pinned
// revision can point PLAYWRIGHT_CHROMIUM_PATH at it instead.
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.e2e.spec.ts',
  outputDir: './test-results',
  // One shared, seeded backend for the run (see src/*.e2e.spec.ts isolation notes):
  // read-only suites assert on presence, the mutating tail suite ingests under a
  // unique token, so files can run in parallel. tail.e2e.spec.ts opts itself
  // into serial mode since its own row-count assertions can't tolerate
  // interleaving with its other tests.
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(FRONTEND_PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse the browser CI already installs + caches; fall back to an
        // explicitly provisioned binary when PLAYWRIGHT_CHROMIUM_PATH is set.
        ...(chromiumPath
          ? { launchOptions: { executablePath: chromiumPath } }
          : { channel: 'chromium-headless-shell' }),
      },
    },
  ],
  webServer: [
    {
      command: 'node --conditions=@localsink/source src/backend.ts',
      url: `http://localhost:${String(BACKEND_PORT)}/api/logs/meta`,
      env: { PORT: String(BACKEND_PORT) },
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @localsink/web dev --port ${String(FRONTEND_PORT)} --strictPort`,
      url: `http://localhost:${String(FRONTEND_PORT)}`,
      env: { VITE_API_TARGET: `http://localhost:${String(BACKEND_PORT)}` },
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
