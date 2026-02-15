import { defineConfig } from 'drizzle-kit';

process.loadEnvFile();
if (!process.env['DB_FILE_NAME']) {
  console.error('DB_FILE_NAME environment variable is not set.');
  process.exit(1);
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env['DB_FILE_NAME'],
  },
});
