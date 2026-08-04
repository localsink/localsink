import { expect, test } from './fixtures.ts';

// The browser URL param is `service`; the backend's is `service_name`.

test('facets filter rows and sync to the URL', async ({ app }) => {
  await app.goto();

  await app.facet('api').click();
  await expect(app.page).toHaveURL(/service=api/);
  await expect(app.rowWithText('GET /health 200')).toBeVisible();
  await expect(app.rowWithText('user login succeeded')).toHaveCount(0);

  await app.facet('error').click();
  await expect(app.page).toHaveURL(/service=api/);
  await expect(app.page).toHaveURL(/level=error/);
  await expect(app.rowWithText('unhandled exception')).toBeVisible();
  await expect(app.rowWithText('GET /health 200')).toHaveCount(0);
});

test('filters rehydrate from the URL on reload', async ({ app }) => {
  await app.goto();
  await app.facet('api').click();
  await app.facet('error').click();
  await expect(app.rowWithText('unhandled exception')).toBeVisible();

  await app.page.reload();

  await expect(app.facet('api')).toHaveAttribute('aria-pressed', 'true');
  await expect(app.facet('error')).toHaveAttribute('aria-pressed', 'true');
  await expect(app.rowWithText('unhandled exception')).toBeVisible();
  await expect(app.rowWithText('GET /health 200')).toHaveCount(0);
});

test('an impossible facet combination shows the empty state', async ({
  app,
}) => {
  await app.goto();
  // `web` only has info/debug rows — pairing it with `error` yields nothing.
  await app.facet('web').click();
  await app.facet('error').click();

  await expect(app.emptyState).toBeVisible();
  await expect(app.logRows).toHaveCount(0);
});
