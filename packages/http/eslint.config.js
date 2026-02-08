import { defineConfig } from 'eslint/config';
import baseConfig from '../../eslint.config.js';

export default defineConfig(...baseConfig, {
  files: ['src/**/*.ts', 'vitest.config.ts'],
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: import.meta.dirname,
      project: ['./tsconfig.lib.json', './tsconfig.spec.json'],
    },
  },
});
