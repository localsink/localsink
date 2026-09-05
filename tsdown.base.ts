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
        generator: 'tsgo',
        sourcemap: false,
      },
      publint: true,
      attw: true,
      failOnWarn: true,
      suppressWarnings: ['TypeScript 7.0 does not yet have a stable API'],
    },
    overrides,
  );
}
