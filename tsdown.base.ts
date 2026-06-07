import type { UserConfig } from 'tsdown';

export function libConfig(overrides: UserConfig = {}): UserConfig {
  return {
    exports: {
      devExports: '@localsink/source',
    },
    tsconfig: 'tsconfig.lib.json',
    dts: {
      tsgo: true,
    },
    publint: true,
    attw: {
      profile: 'esm-only',
    },
    failOnWarn: true,
    ...overrides,
  };
}
