import { defineConfig } from 'tsdown';

import { libConfig } from '../../tsdown.base.ts';

export default defineConfig(
  libConfig({
    exports: {
      devExports: '@localsink/source',
      // Workspace-only fixtures: resolvable via the source condition during
      // dev/test/typecheck, never built into dist, and omitted from the
      // published exports map (publishConfig) entirely.
      customExports(exports, { isPublish }) {
        if (!isPublish) {
          exports['./fixtures'] = {
            '@localsink/source': './src/fixtures/index.ts',
          };
        }
        return exports;
      },
    },
  }),
);
