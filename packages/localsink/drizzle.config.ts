import { defineConfig } from 'drizzle-kit';

import { loadEnv, resolveDbFileName } from './src/config.ts';

loadEnv();

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveDbFileName(),
  },
});
