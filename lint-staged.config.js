/**
 * Shared lint-staged configuration for all packages and root-level files
 * @type {import('lint-staged').Configuration}
 */
export default {
  '!(*.ts)': 'prettier --ignore-unknown --write',
  '*.ts': ['eslint --fix', 'prettier --write'],
};
