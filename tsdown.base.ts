import { mergeConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

export function libConfig(overrides: UserConfig = {}): UserConfig {
  return mergeConfig(
    {
      exports: {
        devExports: '@localsink/source',
      },
      tsconfig: 'tsconfig.lib.json',
      sourcemap: true,
      dts: {
        tsgo: true,
        sourcemap: false,
      },
      publint: true,
      attw: {
        profile: 'esm-only',
      },
      failOnWarn: true,
      suppressWarnings: ['TypeScript 7.0 does not yet have a stable API'],
    },
    overrides,
  );
}
