import type { UserConfig } from 'tsdown';

export function libConfig(overrides: UserConfig = {}): UserConfig {
  return {
    exports: {
      devExports: '@localsink/source',
    },
    publint: true,
    attw: {
      profile: 'esm-only',
    },
    failOnWarn: true,
    ...overrides,
  };
}
