import { expect, ingestLog, test } from './fixtures.ts';

// The live tail is 1 s HTTP polling of GET /api/logs?after_id=…. These specs
// ingest under a unique token so accumulated rows can't perturb other specs.
// Still run serially and isolated from other files: the bulk-ingest test
// below asserts on a row count ("bulk 39"), which a concurrently running spec
// ingesting its own rows could race.
test.describe.configure({ mode: 'serial' });

test('a newly ingested log appears at the live edge', async ({
  app,
  request,
}) => {
  await app.goto();

  const token = `e2e-tail-${String(Date.now())}`;
  await ingestLog(request, { service_name: token, message: `hello ${token}` });

  await expect(app.rowWithText(token)).toBeVisible({ timeout: 5_000 });
  // Pinned to the live edge → the arrival is the last (newest) row.
  await expect(app.logRows.last()).toContainText(token);
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

  const token = `e2e-pill-${String(Date.now())}`;
  await ingestLog(request, { service_name: token, message: token });

  await expect(app.jumpPill).toBeVisible({ timeout: 5_000 });
  await expect(app.jumpPill).toContainText('new');
  await expect(app.rowWithText(token)).toHaveCount(0);

  await app.jumpPill.click();
  await expect(app.rowWithText(token)).toBeVisible();
  await expect(app.jumpPill).toHaveCount(0);
});

test('pausing the tail holds new logs until resumed', async ({
  app,
  request,
}) => {
  await app.goto();

  await app.tailToggle.click();
  await expect(app.tailToggle).toContainText('paused');

  const token = `e2e-pause-${String(Date.now())}`;
  await ingestLog(request, { service_name: token, message: token });

  // More than two poll intervals: a live tail would have shown it by now.
  await app.page.waitForTimeout(2_500);
  await expect(app.rowWithText(token)).toHaveCount(0);

  // Resuming refetches immediately and drains what arrived while paused.
  await app.tailToggle.click();
  await expect(app.rowWithText(token)).toBeVisible({ timeout: 5_000 });
});
