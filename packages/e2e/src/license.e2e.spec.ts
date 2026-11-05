import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openLicenseManager } from 'localsink';
import type { LicenseManager } from 'localsink';

import { startBackend } from './backend.ts';
import { test as base, expect } from './fixtures.ts';
import { startFakeLicensing } from './licensing.ts';
import type { FakeLicensing } from './licensing.ts';

const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e';

// Seconds, as the licensing service sends them. 2030-01-01.
const VALID = {
  valid: true,
  customer: 'Acme',
  seats: 5,
  plan: 'commercial',
  starts_at: 1_767_225_600,
  expires_at: 1_893_456_000,
  checked_at: 1_767_225_600,
};

// Each test gets its own licensing service and license directory, and the
// backend is wired to them the way the CLI wires production: nothing here can
// read or write the real per-user license file.
const test = base.extend<{
  licensing: FakeLicensing;
  configDir: string;
  openLicense: () => Promise<LicenseManager>;
}>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads the destructuring pattern to infer fixture dependencies; `{}` declares "none"
  licensing: async ({}, use) => {
    const licensing = await startFakeLicensing();
    await use(licensing);
    await licensing.close();
  },

  // oxlint-disable-next-line no-empty-pattern -- as above
  configDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'localsink-e2e-license-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },

  openLicense: async ({ licensing, configDir }, use) => {
    await use(() =>
      openLicenseManager({
        version: '0.0.0-e2e',
        licensingUrl: licensing.origin,
        configDir,
        log: () => undefined,
      }),
    );
  },

  backend: async ({ openLicense }, use) => {
    const backend = await startBackend({ license: await openLicense() });
    await use(backend);
    await backend.close();
  },
});

test('with no key, the licensing service is never contacted', async ({
  app,
  licensing,
}) => {
  await app.goto();
  await expect(app.editionBadge).toBeVisible();

  // Opening the dialog refetches the local status — still no remote call.
  await app.editionBadge.click();
  await expect(
    app.page.getByRole('heading', { name: 'Community Edition' }),
  ).toBeVisible();
  await app.page.keyboard.press('Escape');

  expect(licensing.requests).toEqual([]);
});

test('activates a key, keeps it across a restart, and removes it', async ({
  app,
  backend,
  licensing,
  configDir,
  openLicense,
}) => {
  licensing.answer(VALID);
  await app.goto();

  await app.editionBadge.click();
  await app.page.getByLabel('License key').fill(KEY);
  await app.page.getByRole('button', { name: 'Activate' }).click();
  await expect(app.page.getByText('Acme')).toBeVisible();
  await app.page.keyboard.press('Escape');
  await expect(
    app.page.getByRole('button', { name: 'Licensed' }),
  ).toBeVisible();

  expect(licensing.requests).toEqual([JSON.stringify({ key: KEY })]);
  const file = join(configDir, `127.0.0.1-${new URL(licensing.origin).port}`);
  expect(existsSync(join(file, 'license.json'))).toBe(true);

  // A fresh server on the same port and license directory, as after a restart.
  const port = new URL(backend.url).port;
  await backend.close();
  const restarted = await startBackend({
    port: Number(port),
    license: await openLicense(),
  });
  try {
    await app.page.reload();
    await expect(
      app.page.getByRole('button', { name: 'Licensed' }),
    ).toBeVisible();
    // The license was checked moments ago; a restart doesn't check it again.
    expect(licensing.requests).toHaveLength(1);

    await app.page.getByRole('button', { name: 'Licensed' }).click();
    await app.page
      .getByRole('button', { name: 'Remove from this computer' })
      .click();
    await expect(
      app.page.getByRole('heading', { name: 'Community Edition' }),
    ).toBeVisible();
    await app.page.keyboard.press('Escape');
    await expect(app.editionBadge).toBeVisible();
    expect(existsSync(join(file, 'license.json'))).toBe(false);
  } finally {
    await restarted.close();
  }
});

test('a rejected key is reported and nothing is saved', async ({
  app,
  licensing,
  configDir,
}) => {
  licensing.answer({ valid: false, reason: 'not_found' });
  await app.goto();

  await app.editionBadge.click();
  await app.page.getByLabel('License key').fill(KEY);
  await app.page.getByRole('button', { name: 'Activate' }).click();

  await expect(app.page.getByRole('alert')).toContainText(
    "That license key wasn't recognized.",
  );
  await app.page.keyboard.press('Escape');
  await expect(app.editionBadge).toBeVisible();
  expect(licensing.requests).toHaveLength(1);
  expect(
    existsSync(
      join(
        configDir,
        `127.0.0.1-${new URL(licensing.origin).port}`,
        'license.json',
      ),
    ),
  ).toBe(false);
});
