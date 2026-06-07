import type { UserConfig } from 'tsdown';

export function libConfig(overrides: UserConfig = {}): UserConfig {
  return {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'node',
    exports: true,
    publint: true,
    attw: {
      enabled: true,
      profile: 'node16',
      ignoreRules: ['cjs-resolves-to-esm'],
    },
    failOnWarn: true,
    clean: true,
    ...overrides,
  };
}
