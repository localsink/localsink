import { defineConfig } from 'vitest/config';

export const SPEC_GLOB = ['src/**/*.spec.ts'];
export const INTEGRATION_GLOB = ['src/**/*.integration.spec.ts'];

export default defineConfig({
  test: {
    globals: true,
    pool: 'threads',
    restoreMocks: true,
    clearMocks: true,
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/out-tsc/**'],
  },
});
