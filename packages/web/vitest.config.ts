import { playwright } from '@vitest/browser-playwright';
import { defineProject, mergeConfig } from 'vitest/config';

import configShared, {
  INTEGRATION_GLOB,
  SPEC_GLOB,
} from '../../vitest.shared.ts';
import viteConfig from './vite.config.ts';

// Inherit the app's vite config wholesale (plugins incl. Tailwind — specs
// import the real stylesheet so layout-dependent behavior like scroll pinning
// is real — the React Compiler babel preset, and the '@' alias) so tests run
// the same transform pipeline as the production build and the two configs
// can't drift apart. vite.config.ts drops its dev proxy under VITEST.
export default mergeConfig(
  mergeConfig(viteConfig, configShared),
  defineProject({
    test: {
      name: 'web-unit',
      include: SPEC_GLOB,
      exclude: INTEGRATION_GLOB,
      setupFiles: ['./src/test-setup.ts'],
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
    },
  }),
);
