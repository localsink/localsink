import { defineProject, mergeConfig } from 'vitest/config';

import configShared from '../../vitest.shared.ts';

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      name: 'console-unit',
      include: ['src/**/*.spec.ts'],
      exclude: ['src/**/*.integration.spec.ts'],
    },
  }),
);
