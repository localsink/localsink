import { defineConfig } from 'oxlint';

import baseConfig from '../../oxlint.config.ts';

export default defineConfig({
  extends: [baseConfig],
  overrides: [
    {
      // False positive on winston transports; remove once fixed:
      // https://github.com/typescript-eslint/typescript-eslint/issues/13234
      files: ['**/*.spec.ts'],
      rules: {
        'typescript/no-unsafe-class-instance-assignment': 'off',
      },
    },
  ],
});
