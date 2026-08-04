import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { staticDir } from './backend.ts';

// Each test's backend serves the built SPA, so the build has to have happened.
// CI runs `build:all` before `e2e:all`; locally we build here, which also keeps
// the assets from going stale after an edit to packages/web.
export default function globalSetup(): void {
  if (!process.env['CI']) {
    execFileSync('pnpm', ['--filter', 'localsink...', 'build'], {
      stdio: 'inherit',
    });
  }

  if (!existsSync(staticDir)) {
    throw new Error(
      `The SPA has not been built — ${staticDir} does not exist.\n` +
        `Build it with: pnpm --filter 'localsink...' build`,
    );
  }
}
