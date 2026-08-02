import { sampleLogs } from '@localsink/contract/fixtures';

import { expect, test } from './fixtures.ts';

test('full-text search narrows to matching rows and clears back', async ({
  app,
}) => {
  await app.goto();
  await expect(app.logRows).toHaveCount(sampleLogs.length);

  await app.search.fill('slow query');
  // Of the seed, only "slow query detected" matches both terms.
  await expect(app.rowWithText('slow query detected')).toBeVisible();
  await expect(app.rowWithText('GET /health 200')).toHaveCount(0);
  await expect(app.logRows).toHaveCount(1);

  await app.search.fill('');
  await expect(app.rowWithText('GET /health 200')).toBeVisible();
  await expect(app.logRows).toHaveCount(sampleLogs.length);
});
