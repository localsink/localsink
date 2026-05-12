import { fileURLToPath } from 'node:url';

const REGEX =
  /^((Revert .+)|((build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?: .+))/;

export function isValidPrTitle(title: string): boolean {
  return REGEX.test(title);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const title = process.env['PR_TITLE'];

  if (!title) {
    console.error('ERROR: PR_TITLE environment variable is not set.');
    process.exit(1);
  }

  console.log(`PR Title: ${title}`);

  if (!isValidPrTitle(title)) {
    console.error(
      '❌ ERROR: PR title does not follow the Conventional Commits standard.',
    );
    process.exit(1);
  }

  console.log('✅ Valid PR title.');
  process.exit(0);
}
