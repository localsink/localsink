/**
 * Shared lint-staged configuration for all packages and root-level files
 * @type {import('lint-staged').Configuration}
 */
export default {
  '!(*.ts)': 'oxfmt --write --no-error-on-unmatched-pattern',
  '*.ts': ['oxlint --fix', 'oxfmt --write'],
};
