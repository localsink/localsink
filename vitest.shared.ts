import { defineConfig } from 'vitest/config';

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
