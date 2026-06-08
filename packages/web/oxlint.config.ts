import { defineConfig } from 'oxlint';

import baseConfig from '../../oxlint.config.ts';

export default defineConfig({
  extends: [baseConfig],
  plugins: ['react'],
  jsPlugins: [
    { name: 'react-compiler', specifier: 'eslint-plugin-react-hooks' },
  ],
  env: {
    browser: true,
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
    'react-compiler/config': 'error',
    'react-compiler/error-boundaries': 'error',
    'react-compiler/gating': 'error',
    'react-compiler/globals': 'error',
    'react-compiler/immutability': 'error',
    'react-compiler/preserve-manual-memoization': 'error',
    'react-compiler/purity': 'error',
    'react-compiler/refs': 'error',
    'react-compiler/set-state-in-effect': 'error',
    'react-compiler/set-state-in-render': 'error',
    'react-compiler/static-components': 'error',
  },
});
