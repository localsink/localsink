import { expect, test } from './fixtures.ts';

// Drives the real FTS5 index through the search box (not the MSW substring
// stand-in the component tests use).

test('full-text search narrows to matching rows and clears back', async ({
  app,
}) => {
  await app.goto();
  expect(await app.logRows.count()).toBeGreaterThan(1);

  await app.search.fill('slow query');
  // Only the seeded "slow query detected" row matches both terms.
  await expect(app.rowWithText('slow query detected')).toBeVisible();
  await expect(app.rowWithText('GET /health 200')).toHaveCount(0);
  await expect(app.logRows).toHaveCount(1);

  await app.search.fill('');
  await expect(app.rowWithText('GET /health 200')).toBeVisible();
  expect(await app.logRows.count()).toBeGreaterThan(1);
});
