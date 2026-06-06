import type { UserConfig } from 'tsdown';

export function libConfig(overrides: UserConfig = {}): UserConfig {
  return {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    platform: 'node',
    dts: { cjsReexport: true },
    exports: true,
    publint: 'ci-only',
    attw: { enabled: 'ci-only', profile: 'node16' },
    clean: true,
    ...overrides,
  };
}
