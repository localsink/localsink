import type { Configuration } from 'lint-staged';

const config: Configuration = {
  '!(*.ts|*.tsx)': 'oxfmt --write --no-error-on-unmatched-pattern',
  '*.{ts,tsx}': ['oxlint --fix', 'oxfmt --write'],
};

export default config;
