import { defineConfig } from 'vitest/config';

// The package manager sets `npm_lifecycle_event` to the script name being run
// (e.g. `test` or `integration`), so the target is derived from which script
// was invoked rather than a bespoke env var.
const integration = process.env['npm_lifecycle_event'] === 'integration';

const baseExclude = ['**/node_modules/**', '**/dist/**', '**/out-tsc/**'];

export default defineConfig({
  test: {
    globals: true,
    pool: 'threads',
    restoreMocks: true,
    clearMocks: true,
    passWithNoTests: true,
    include: integration
      ? ['src/**/*.integration.spec.ts']
      : ['src/**/*.spec.ts'],
    exclude: integration
      ? baseExclude
      : [...baseExclude, '**/*.integration.spec.ts'],
  },
});
