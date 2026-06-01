import { defineProject, mergeConfig } from 'vitest/config';

import configShared, {
  INTEGRATION_GLOB,
  SPEC_GLOB,
} from '../../vitest.shared.ts';

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      name: 'web-unit',
      environment: 'jsdom',
      include: SPEC_GLOB,
      exclude: INTEGRATION_GLOB,
    },
  }),
);
