import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env['CI']);
// CI installs (and caches) the chromium-headless-shell channel. Environments
// that pre-provision a browser at a fixed path but can't fetch the pinned
// revision can point PLAYWRIGHT_CHROMIUM_PATH at it instead.
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_PATH'];

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.e2e.spec.ts',
  outputDir: './test-results',
  globalSetup: './src/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
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
});
