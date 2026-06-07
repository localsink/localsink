import type { UserConfig } from 'tsdown';

export function libConfig(overrides: UserConfig = {}): UserConfig {
  return {
    exports: true,
    publint: true,
    attw: {
      profile: 'esm-only',
    },
    failOnWarn: true,
    ...overrides,
  };
}
