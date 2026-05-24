import { defineProject, mergeConfig } from 'vitest/config';

import configShared, { INTEGRATION_GLOB } from '../../vitest.shared.ts';

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      name: 'pino-integration',
      include: INTEGRATION_GLOB,
    },
  }),
);
