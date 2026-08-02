import { expect, test } from './fixtures.ts';

// Connectivity is derived from the logs poll: consecutive failures →
// reconnecting (1–2) → offline (≥ OFFLINE_AFTER = 3).

test('offline: escalates after repeated failures, then recovers', async ({
  app,
}) => {
  await app.goto();

  await app.goOffline();
  await expect(app.connectionBanner).toBeVisible();
  await app.expectState('offline', { timeout: 10_000 });
  await expect(app.connectionBanner).toContainText(
    "Can't reach the localsink backend.",
  );
  await expect(app.tailToggle).toContainText('offline');

  await app.goOnline();
  await app.expectState('connected', { timeout: 10_000 });
  await expect(app.connectionBanner).toHaveCount(0);
  await expect(app.tailToggle).toContainText('tailing');
});

test('reconnecting: an intermittent blip recovers without going offline', async ({
  app,
}) => {
  await app.goto();

  // Two failed polls stay under the 3-strike offline threshold.
  await app.failNextPolls(2);
  await app.expectState('reconnecting', { timeout: 8_000 });
  await expect(app.connectionBanner).toContainText(
    'Reconnecting to the localsink backend…',
  );
  await expect(app.tailToggle).toContainText('reconnecting');

  await app.expectState('connected', { timeout: 8_000 });
  await expect(app.connectionBanner).toHaveCount(0);
});
