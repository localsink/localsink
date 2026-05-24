import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['import'],
  env: {
    builtin: true,
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
    'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    'import/extensions': [
      'error',
      {
        ts: 'always',
        js: 'never',
        ignorePackages: true,
        checkTypeImports: true,
      },
    ],
    'import/no-anonymous-default-export': 'off',
  },
  options: {
    typeAware: true,
    denyWarnings: true,
  },
  overrides: [
    {
      files: ['**/*.spec.ts'],
      plugins: ['import', 'vitest'],
      env: {
        vitest: true,
      },
      // Vitest's asymmetric matchers (expect.any, expect.objectContaining, …)
      // are typed as `any` upstream, so the typescript/no-unsafe-* family
      // fires on routine test code. Relaxed for spec files only.
      rules: {
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-argument': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
      },
    },
  ],
});
