import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineProject, mergeConfig } from 'vitest/config';

import configShared, {
  INTEGRATION_GLOB,
  SPEC_GLOB,
} from '../../vitest.shared.ts';

export default mergeConfig(
  configShared,
  defineProject({
    // Tailwind compiles in specs too — test-setup imports the real
    // stylesheet so layout-dependent behavior (scroll pinning) is real.
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
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
