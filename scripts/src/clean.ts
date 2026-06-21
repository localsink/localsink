import { glob, rm } from 'node:fs/promises';
import { basename } from 'node:path';

const patterns = [
  '{packages/*,scripts}/dist',
  '{packages/*,scripts}/out-tsc',
  '{packages/*,scripts}/coverage',
  '**/*.tsbuildinfo',
  '**/.vitest-attachments',
  '**/.vitest-cache',
  '**/__screenshots__',
  '**/vite.config.*.timestamp-*',
  '**/playwright-report',
  '**/test-results',
];

for (const pattern of patterns) {
  for await (const path of glob(pattern, {
    exclude: (entry) => basename(entry) === 'node_modules',
  })) {
    await rm(path, { recursive: true, force: true });
  }
}
