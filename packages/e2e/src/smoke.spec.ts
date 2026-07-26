import { expect, test } from './fixtures.ts';

// The whole app against the real backend: real SPA (Vite dev + proxy) → real
// Hono API → real libSQL. Asserts on presence of seeded content, never exact
// totals (the tail suite mutates the shared backend).

test('loads the SPA and renders seeded logs from the real backend', async ({
  app,
}) => {
  await app.goto();

  await expect(app.editionBadge).toBeVisible();

  // Facets populate from real GET /api/logs/meta.
  for (const service of ['api', 'auth', 'worker', 'payments']) {
    await expect(app.facet(service)).toBeVisible();
  }

  // Seeded rows render; connectivity settled and the tail is live.
  expect(await app.logRows.count()).toBeGreaterThan(1);
  await app.expectState('connected');
  await expect(app.tailToggle).toContainText('tailing');
});

test('expands and collapses a log row', async ({ app }) => {
  await app.goto();

  const rowButton = app
    .rowWithText('slow query detected')
    .getByRole('button')
    .first();
  await expect(rowButton).toHaveAttribute('aria-expanded', 'false');
  // The collapsed row shows only the first 3 attribute chips (AttrStrip
  // MAX_CHIPS); `rows` is the hidden 4th, so its value is expansion-only.
  await expect(app.page.getByText('18402')).toHaveCount(0);

  await rowButton.click();
  await expect(rowButton).toHaveAttribute('aria-expanded', 'true');
  await expect(app.page.getByText('18402')).toBeVisible();

  await rowButton.click();
  await expect(rowButton).toHaveAttribute('aria-expanded', 'false');
  await expect(app.page.getByText('18402')).toHaveCount(0);
});
