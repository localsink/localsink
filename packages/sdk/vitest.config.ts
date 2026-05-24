import { defineProject, mergeConfig } from 'vitest/config';

import configShared, {
  INTEGRATION_GLOB,
  SPEC_GLOB,
} from '../../vitest.shared.ts';

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      name: 'sdk-unit',
      include: SPEC_GLOB,
      exclude: INTEGRATION_GLOB,
    },
  }),
);
