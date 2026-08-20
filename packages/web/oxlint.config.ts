import { defineConfig } from 'oxlint';

import baseConfig from '../../oxlint.config.ts';

export default defineConfig({
  extends: [baseConfig],
  plugins: ['react'],
  env: {
    browser: true,
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    'react/no-deriving-state-in-effects': 'error',
    'react/unsupported-syntax': 'error',
    'react/syntax': 'error',
    'react/rule-suppression': 'error',
    'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
  },
});
