import type { Configuration } from 'lint-staged';

const config: Configuration = {
  '!(*.ts)': 'oxfmt --write --no-error-on-unmatched-pattern',
  '*.ts': ['oxlint --fix', 'oxfmt --write'],
};

export default config;
