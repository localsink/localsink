import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['import'],
  env: {
    es2024: true,
    node: true,
  },
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  rules: {
    // typescript-eslint strictTypeChecked equivalents
    'typescript/no-explicit-any': 'error',
    'typescript/no-unsafe-assignment': 'error',
    'typescript/no-unsafe-call': 'error',
    'typescript/no-unsafe-member-access': 'error',
    'typescript/no-unsafe-return': 'error',
    'typescript/await-thenable': 'error',
    'typescript/no-misused-promises': 'error',
    'typescript/no-floating-promises': 'error',
    'typescript/no-unsafe-argument': 'error',
    'typescript/restrict-template-expressions': 'error',
    'typescript/no-unnecessary-type-assertion': 'error',
    // typescript-eslint stylisticTypeChecked equivalents
    'typescript/consistent-type-imports': 'error',
    'typescript/prefer-nullish-coalescing': 'error',
    'typescript/prefer-optional-chain': 'error',
    // Not in eslint-plugin-import/recommended v2 — disable Oxlint's default
    'import/no-anonymous-default-export': 'off',
  },
  options: {
    // Must remain in root config only — nested configs will error if typeAware is set there
    typeAware: true,
  },
  ignorePatterns: ['dist/**', 'node_modules/**'],
});
