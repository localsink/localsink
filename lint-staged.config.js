export default {
  '!(*.ts)': 'oxfmt --write',
  '*.ts': ['oxlint --fix', 'oxfmt --write'],
};
