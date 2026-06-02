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
    plugins: [react()],
    test: {
      name: 'web-unit',
      include: SPEC_GLOB,
      exclude: INTEGRATION_GLOB,
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: 'chromium' }],
      },
    },
  }),
);
