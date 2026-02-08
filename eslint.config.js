import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import { configs as tsConfigs } from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';

export default defineConfig(
  globalIgnores(['dist']),
  eslint.configs.recommended,
  tsConfigs.strictTypeChecked,
  tsConfigs.stylisticTypeChecked,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
  {
    files: [
      'eslint.config.js',
      'lint-staged.config.js',
      'vitest.config.ts',
      'vitest.shared.ts',
    ],
    ...tsConfigs.disableTypeChecked,
  },
  eslintConfigPrettier,
);
