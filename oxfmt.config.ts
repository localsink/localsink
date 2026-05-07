import { defineConfig } from 'oxfmt';

export default defineConfig({
  printWidth: 80,
  singleQuote: true,
  ignorePatterns: ['pnpm-lock.yaml', 'LICENSE'],
});
