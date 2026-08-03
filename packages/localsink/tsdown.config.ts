import { existsSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';

import { defineConfig } from 'tsdown';

import { libConfig } from '../../tsdown.base.ts';

const webPackageJson = findPackageJSON('@localsink/web', import.meta.url);
if (!webPackageJson) {
  throw new Error(
    'Cannot locate @localsink/web. Is the workspace dependency installed?',
  );
}
const webDist = join(dirname(webPackageJson), 'dist');

if (!existsSync(webDist)) {
  throw new Error(
    `@localsink/web has not been built — ${webDist} does not exist.\n` +
      `Build dependencies too: pnpm --filter 'localsink...' build`,
  );
}

export default defineConfig(
  libConfig({
    entry: ['src/index.ts', 'src/cli.ts'],
    copy: [{ from: webDist, to: 'dist', rename: 'public' }],
    exports: { bin: true },
  }),
);
