import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['import', 'vitest'],
  env: {
    es2024: true,
    node: true,
  },
  categories: {
    correctness: 'error',
    suspicious: 'error',
  },
  rules: {
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
    'typescript/consistent-type-imports': 'error',
    'typescript/prefer-nullish-coalescing': 'error',
    'typescript/prefer-optional-chain': 'error',
    'import/no-anonymous-default-export': 'off',
  },
  options: {
    // Must remain in root config only — nested configs will error if these are set in package configs
    typeAware: true,
    denyWarnings: true,
  },
  ignorePatterns: ['dist/**', 'node_modules/**'],
});
