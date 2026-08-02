import { defineConfig, devices } from '@playwright/test';

// Only the frontend is a shared server; each test starts its own backend (see
// src/fixtures.ts). 5273 rather than Vite's default so a running dev stack on
// :5173 doesn't collide.
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
        ...(chromiumPath
          ? { launchOptions: { executablePath: chromiumPath } }
          : { channel: 'chromium-headless-shell' }),
      },
    },
  ],
  webServer: [
    {
      // CI serves the built bundle (`build:all` runs before `e2e:all`), which
      // is the only place minification, Tailwind's purge and the React
      // Compiler's production output get exercised. Locally the dev server
      // keeps the edit → re-run loop working without a rebuild.
      command: `pnpm --filter @localsink/web ${isCI ? 'preview' : 'dev'} --port ${String(FRONTEND_PORT)} --strictPort`,
      url: `http://localhost:${String(FRONTEND_PORT)}`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
