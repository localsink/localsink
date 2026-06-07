import { defineConfig } from 'vitest/config';

export const SPEC_GLOB = ['src/**/*.spec.ts', 'src/**/*.spec.tsx'];
export const INTEGRATION_GLOB = [
  'src/**/*.integration.spec.ts',
  'src/**/*.integration.spec.tsx',
];

export default defineConfig({
  resolve: {
    conditions: ['@localsink/source'],
  },
  ssr: {
    resolve: {
      conditions: ['@localsink/source'],
    },
  },
  test: {
    globals: true,
    pool: 'threads',
    restoreMocks: true,
    clearMocks: true,
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/out-tsc/**'],
  },
});
