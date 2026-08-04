import { expect, ingestLog, test } from './fixtures.ts';

// The live tail is 1 s HTTP polling of GET /api/logs?after_id=…, which is what
// the timeouts below are multiples of.

test('a newly ingested log appears at the live edge', async ({
  app,
  request,
}) => {
  await app.goto();

  await ingestLog(request, {
    service_name: 'e2e-tail',
    message: 'hello from the tail',
  });

  await expect(app.rowWithText('e2e-tail')).toBeVisible({ timeout: 5_000 });
  // Pinned to the live edge → the arrival is the last (newest) row.
  await expect(app.logRows.last()).toContainText('e2e-tail');
});

test('arrivals while scrolled up collect in the jump pill', async ({
  app,
  request,
}) => {
  await app.goto();

  // Force the list to overflow so there's somewhere to scroll up to.
  for (let i = 0; i < 40; i += 1) {
    await ingestLog(request, {
      service_name: 'e2e-bulk',
      message: `bulk ${String(i)}`,
    });
  }
  await expect(app.rowWithText('bulk 39')).toBeVisible({ timeout: 8_000 });

  // Scrolling to the top releases the pin; arrivals then buffer.
  await app.logRows.first().scrollIntoViewIfNeeded();

  await ingestLog(request, { service_name: 'e2e-pill', message: 'e2e-pill' });

  await expect(app.jumpPill).toBeVisible({ timeout: 5_000 });
  await expect(app.jumpPill).toContainText('new');
  await expect(app.rowWithText('e2e-pill')).toHaveCount(0);

  await app.jumpPill.click();
  await expect(app.rowWithText('e2e-pill')).toBeVisible();
  await expect(app.jumpPill).toHaveCount(0);
});

test('pausing the tail holds new logs until resumed', async ({
  app,
  request,
}) => {
  await app.goto();

  await app.tailToggle.click();
  await expect(app.tailToggle).toContainText('paused');

  await ingestLog(request, { service_name: 'e2e-pause', message: 'e2e-pause' });

  // More than two poll intervals: a live tail would have shown it by now.
  await app.page.waitForTimeout(2_500);
  await expect(app.rowWithText('e2e-pause')).toHaveCount(0);

  await app.tailToggle.click();
  await expect(app.rowWithText('e2e-pause')).toBeVisible({ timeout: 5_000 });
});
