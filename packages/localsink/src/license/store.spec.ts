import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LicenseRecord } from './store.ts';
import {
  licenseFilePath,
  readLicenseFile,
  removeLicenseFile,
  writeLicenseFile,
} from './store.ts';

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'localsink-license-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const record: LicenseRecord = {
  key: '0f8fad5b-d9cb-469f-a165-70867728950e',
  entitlement: {
    valid: true,
    reason: null,
    customer: 'Acme',
    seats: 5,
    expires_at: 1_800_000_000_000,
  },
  checked_at: 1_700_000_000_000,
  next_check_at: 1_700_604_800_000,
};

describe('licenseFilePath', () => {
  it('uses the config directory itself for production', () => {
    expect(licenseFilePath('https://licensing.localsink.io', '/cfg')).toBe(
      join('/cfg', 'license.json'),
    );
  });

  it('gives any other licensing service its own subdirectory', () => {
    expect(
      licenseFilePath('https://licensing-staging.localsink.io', '/cfg'),
    ).toBe(join('/cfg', 'licensing-staging.localsink.io', 'license.json'));
    expect(licenseFilePath('http://localhost:8787', '/cfg')).toBe(
      join('/cfg', 'localhost-8787', 'license.json'),
    );
  });
});

describe('license file', () => {
  it('round-trips a record, creating the directory', async () => {
    const path = join(tempDir(), 'nested', 'license.json');
    await writeLicenseFile(path, record);
    await expect(readLicenseFile(path)).resolves.toEqual(record);
  });

  it('is readable by its owner only', async () => {
    // Windows has no POSIX mode bits to check.
    if (process.platform === 'win32') return;
    const path = join(tempDir(), 'license.json');
    await writeLicenseFile(path, record);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('reads a missing file as no key', async () => {
    await expect(
      readLicenseFile(join(tempDir(), 'license.json')),
    ).resolves.toBeNull();
  });

  it.each([
    ['not JSON', '{"version": 1, "key": '],
    ['the wrong shape', JSON.stringify({ version: 1, key: 42 })],
    ['a future version', JSON.stringify({ ...record, version: 2 })],
  ])('reads a file that is %s as no key', async (_label, contents) => {
    const path = join(tempDir(), 'license.json');
    writeFileSync(path, contents);
    await expect(readLicenseFile(path)).resolves.toBeNull();
  });

  it('writes a versioned file', async () => {
    const path = join(tempDir(), 'license.json');
    await writeLicenseFile(path, record);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({
      version: 1,
      key: record.key,
    });
  });

  it('removes the file, and removing it twice is fine', async () => {
    const path = join(tempDir(), 'license.json');
    await writeLicenseFile(path, record);
    await removeLicenseFile(path);
    await removeLicenseFile(path);
    await expect(readLicenseFile(path)).resolves.toBeNull();
  });
});
