import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { z } from 'zod';

import type { LicenseManager, LicenseManagerOptions } from './manager.ts';
import {
  applyOutcome,
  CHECK_INTERVAL_MS,
  deriveStatus,
  openLicenseManager,
  RENEWAL_GRACE_MS,
  RETRY_INTERVAL_MS,
} from './manager.ts';
import type { LicenseRecord } from './store.ts';
import { readLicenseFile, writeLicenseFile } from './store.ts';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);
const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER_KEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

// ── State rules ────────────────────────────────────────────────────────────

const validRecord = (expiresAt: number): LicenseRecord => ({
  key: KEY,
  entitlement: {
    valid: true,
    reason: null,
    customer: 'Acme',
    seats: 5,
    expires_at: expiresAt,
  },
  checked_at: T0,
  next_check_at: T0 + CHECK_INTERVAL_MS,
});

describe('applyOutcome', () => {
  it('a valid answer is good for a week', () => {
    const next = applyOutcome(
      validRecord(T0 + 30 * DAY),
      { kind: 'valid', customer: 'Acme', seats: 6, expiresAt: T0 + 60 * DAY },
      T0,
    );
    expect(next.entitlement).toMatchObject({ valid: true, seats: 6 });
    expect(next.next_check_at).toBe(T0 + CHECK_INTERVAL_MS);
  });

  it('checks at expiry when that comes before the week is up', () => {
    const next = applyOutcome(
      validRecord(T0),
      { kind: 'valid', customer: 'Acme', seats: 5, expiresAt: T0 + 2 * DAY },
      T0,
    );
    expect(next.next_check_at).toBe(T0 + 2 * DAY);
  });

  it('an indeterminate answer only moves the next check', () => {
    const record = validRecord(T0 + 30 * DAY);
    const next = applyOutcome(
      record,
      { kind: 'indeterminate', detail: 'fetch failed' },
      T0,
    );
    expect(next).toEqual({ ...record, next_check_at: T0 + RETRY_INTERVAL_MS });
  });

  it('an indeterminate answer never retries past the expiry', () => {
    const next = applyOutcome(
      validRecord(T0 + 3 * 60 * 60 * 1000),
      { kind: 'indeterminate', detail: 'fetch failed' },
      T0,
    );
    expect(next.next_check_at).toBe(T0 + 3 * 60 * 60 * 1000);
  });

  it('expired inside the renewal grace keeps the license and asks again once the grace is up', () => {
    const record = validRecord(T0);
    const next = applyOutcome(
      record,
      { kind: 'rejected', reason: 'expired', customer: 'Acme', expiresAt: T0 },
      T0 + 60_000,
    );
    expect(next.entitlement).toEqual(record.entitlement);
    expect(next.next_check_at).toBe(T0 + RENEWAL_GRACE_MS);
  });

  it('expired after the grace is final', () => {
    const next = applyOutcome(
      validRecord(T0),
      { kind: 'rejected', reason: 'expired', customer: 'Acme', expiresAt: T0 },
      T0 + RENEWAL_GRACE_MS,
    );
    expect(next.entitlement).toMatchObject({ valid: false, reason: 'expired' });
    expect(next.next_check_at).toBeNull();
  });

  it('expired before the held license ran out means it ended early', () => {
    const next = applyOutcome(
      validRecord(T0 + 10 * DAY),
      { kind: 'rejected', reason: 'expired', customer: 'Acme', expiresAt: T0 },
      T0 + DAY,
    );
    expect(next.entitlement).toMatchObject({
      valid: false,
      reason: 'inactive',
      expires_at: null,
    });
    expect(next.next_check_at).toBeNull();
  });

  it('expired with an end date still ahead means it ended early, even with nothing held', () => {
    const next = applyOutcome(
      { key: KEY, entitlement: null, checked_at: null, next_check_at: T0 },
      {
        kind: 'rejected',
        reason: 'expired',
        customer: 'Acme',
        expiresAt: T0 + 10 * DAY,
      },
      T0,
    );
    expect(next.entitlement).toMatchObject({ reason: 'inactive' });
  });

  it.each(['revoked', 'not_found'] as const)('%s is final', (reason) => {
    const next = applyOutcome(
      validRecord(T0 + 30 * DAY),
      { kind: 'rejected', reason, customer: null, expiresAt: null },
      T0,
    );
    expect(next.entitlement).toMatchObject({ valid: false, reason });
    expect(next.next_check_at).toBeNull();
  });

  it('a valid answer revives a dead key', () => {
    const deadRecord = applyOutcome(
      validRecord(T0 + 30 * DAY),
      { kind: 'rejected', reason: 'revoked', customer: null, expiresAt: null },
      T0,
    );
    const next = applyOutcome(
      deadRecord,
      { kind: 'valid', customer: 'Acme', seats: 5, expiresAt: T0 + 30 * DAY },
      T0 + DAY,
    );
    expect(next.entitlement).toMatchObject({ valid: true });
    expect(next.next_check_at).not.toBeNull();
  });
});

describe('deriveStatus', () => {
  const facts = {
    source: 'file' as const,
    licensingHost: 'licensing.localsink.io',
    checking: false,
    unreachable: false,
  };

  it('no record is Community with no source', () => {
    expect(deriveStatus(null, facts, T0)).toMatchObject({
      edition: 'community',
      source: 'none',
      reason: null,
      key_hint: null,
    });
  });

  it('is Licensed through the renewal grace, then lapses without being final', () => {
    const record = validRecord(T0);
    expect(
      deriveStatus(record, facts, T0 + RENEWAL_GRACE_MS - 1),
    ).toMatchObject({ edition: 'licensed', reason: null });
    expect(deriveStatus(record, facts, T0 + RENEWAL_GRACE_MS)).toMatchObject({
      edition: 'community',
      reason: 'expired',
      dead: false,
    });
  });

  it('a key never confirmed is unverified', () => {
    expect(
      deriveStatus(
        { key: KEY, entitlement: null, checked_at: null, next_check_at: T0 },
        { ...facts, source: 'env' },
        T0,
      ),
    ).toMatchObject({
      edition: 'community',
      source: 'env',
      reason: 'unverified',
    });
  });

  it('never exposes the key beyond its last four characters', () => {
    const status = deriveStatus(validRecord(T0 + DAY), facts, T0);
    expect(status.key_hint).toBe('950e');
    expect(JSON.stringify(status)).not.toContain(KEY.slice(0, 8));
  });
});

// ── Manager ────────────────────────────────────────────────────────────────

type Answer = () => Response | Promise<Response>;

const valid =
  (expiresAt: number, seats = 5): Answer =>
  () =>
    HttpResponse.json({
      valid: true,
      customer: 'Acme',
      seats,
      plan: 'commercial',
      starts_at: T0 / 1000,
      expires_at: expiresAt / 1000,
      checked_at: Date.now() / 1000,
    });

const rejected =
  (reason: string, expiresAt: number | null = null): Answer =>
  () =>
    HttpResponse.json({
      valid: false,
      reason,
      customer: 'Acme',
      expires_at: expiresAt === null ? null : expiresAt / 1000,
    });

const unreachable: Answer = () => HttpResponse.error();

const requestSchema = z.object({ key: z.string() });

const VALIDATE = 'https://licensing.localsink.io/v1/validate';
const STAGING_VALIDATE = 'https://licensing-staging.localsink.io/v1/validate';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * The licensing service, answering with whatever `answer` holds and recording
 * which keys it was asked about.
 */
function fakeService(initial: Answer = valid(T0 + 365 * DAY), url = VALIDATE) {
  let answer = initial;
  const keys: string[] = [];
  server.use(
    http.post(url, async ({ request }) => {
      keys.push(requestSchema.parse(await request.json()).key);
      return answer();
    }),
  );
  return {
    keys,
    answer: (next: Answer) => {
      answer = next;
    },
  };
}

/**
 * Every outbound request, handled or not. A request with no handler fails,
 * and the manager would quietly treat that as "unreachable" — so the
 * never-contacts-us guarantee is asserted on what was attempted.
 */
function recordRequests(): string[] {
  const urls: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    urls.push(request.url);
  };
  server.events.on('request:start', listener);
  onTestFinished(() => {
    server.events.removeListener('request:start', listener);
  });
  return urls;
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'localsink-license-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function open(options: Partial<LicenseManagerOptions> = {}) {
  const manager = await openLicenseManager({
    version: '1.2.3',
    configDir: tempDir(),
    log: () => undefined,
    ...options,
  });
  onTestFinished(() => manager.close());
  return manager;
}

/**
 * Advances fake time, then waits out any check that fired. A check does real
 * file I/O, which fake timers can't hurry, so this polls on real time until the
 * manager reports it has settled.
 */
async function advance(manager: LicenseManager, ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  while ((await manager.status()).checking) await sleep(1);
}

describe('openLicenseManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('with no key', () => {
    it('never contacts the licensing service', async () => {
      const requests = recordRequests();
      const manager = await open();

      await advance(manager, 0);
      await advance(manager, 60 * DAY);
      await manager.status();

      expect(requests).toEqual([]);
    });

    it('is Community Edition', async () => {
      const manager = await open();
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'community',
        source: 'none',
      });
    });

    it('does not contact the service for Check now either', async () => {
      const requests = recordRequests();
      const manager = await open();
      await manager.check();
      expect(requests).toEqual([]);
    });

    it('rejects an invalid licensing URL', async () => {
      await expect(
        open({ licensingUrl: 'http://example.com' }),
      ).rejects.toThrow(/Invalid licensing URL/);
    });
  });

  describe('activation', () => {
    it('saves a valid key and is Licensed', async () => {
      const configDir = tempDir();
      fakeService(valid(T0 + 30 * DAY));
      const manager = await open({ configDir });

      const result = await manager.activate(KEY);

      expect(result).toMatchObject({
        outcome: 'activated',
        reason: null,
        status: {
          edition: 'licensed',
          source: 'file',
          customer: 'Acme',
          seats: 5,
          expires_at: T0 + 30 * DAY,
          key_hint: '950e',
        },
      });
      await expect(
        readLicenseFile(join(configDir, 'license.json')),
      ).resolves.toMatchObject({ key: KEY });
    });

    it('survives a restart without contacting the service', async () => {
      const configDir = tempDir();
      const service = fakeService(valid(T0 + 30 * DAY));
      const first = await open({ configDir });
      await first.activate(KEY);
      first.close();

      const second = await open({ configDir });
      await advance(second, DAY);

      await expect(second.status()).resolves.toMatchObject({
        edition: 'licensed',
      });
      expect(service.keys).toEqual([KEY]);
    });

    it.each([
      ['not_found', rejected('not_found'), 'not_found'],
      ['revoked', rejected('revoked'), 'revoked'],
      ['expired', rejected('expired', T0 - DAY), 'expired'],
      ['refunded', rejected('expired', T0 + 10 * DAY), 'inactive'],
    ])(
      'reports a %s key as rejected and saves nothing',
      async (_label, answer, reason) => {
        const configDir = tempDir();
        fakeService(answer);
        const manager = await open({
          configDir,
        });

        const result = await manager.activate(KEY);

        expect(result).toMatchObject({
          outcome: 'rejected',
          reason,
          status: { edition: 'community', source: 'none' },
        });
        expect(existsSync(join(configDir, 'license.json'))).toBe(false);
      },
    );

    it('reports an unreachable service and saves nothing', async () => {
      const configDir = tempDir();
      fakeService(unreachable);
      const manager = await open({
        configDir,
      });

      await expect(manager.activate(KEY)).resolves.toMatchObject({
        outcome: 'unreachable',
        status: { edition: 'community', source: 'none' },
      });
      expect(existsSync(join(configDir, 'license.json'))).toBe(false);
    });

    it('a failed replacement keeps the working key', async () => {
      const service = fakeService(valid(T0 + 30 * DAY));
      const manager = await open();
      await manager.activate(KEY);

      service.answer(rejected('not_found'));
      const result = await manager.activate(OTHER_KEY);

      expect(result).toMatchObject({
        outcome: 'rejected',
        status: { edition: 'licensed', key_hint: '950e' },
      });
    });

    it('reports a key that cannot be saved', async () => {
      const configDir = tempDir();
      // A file where the directory needs to be.
      writeFileSync(join(configDir, 'blocked'), '');
      fakeService();
      const manager = await open({
        configDir: join(configDir, 'blocked'),
      });

      await expect(manager.activate(KEY)).resolves.toMatchObject({
        outcome: 'save_failed',
        status: { edition: 'community' },
      });
    });
  });

  describe('schedule', () => {
    it('checks again a week after a successful check', async () => {
      const service = fakeService();
      const manager = await open();
      await manager.activate(KEY);

      await advance(manager, CHECK_INTERVAL_MS - 1000);
      expect(service.keys).toHaveLength(1);

      await advance(manager, 1000);
      expect(service.keys).toHaveLength(2);
    });

    it('retries a day after the service could not be reached, keeping the license', async () => {
      const service = fakeService();
      const manager = await open();
      await manager.activate(KEY);

      service.answer(unreachable);
      await advance(manager, CHECK_INTERVAL_MS);
      expect(service.keys).toHaveLength(2);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'licensed',
        unreachable: true,
      });

      service.answer(valid(T0 + 365 * DAY));
      await advance(manager, RETRY_INTERVAL_MS);
      expect(service.keys).toHaveLength(3);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'licensed',
        unreachable: false,
      });
    });

    it('confirms a renewal at expiry', async () => {
      const service = fakeService(valid(T0 + 2 * DAY));
      const manager = await open();
      await manager.activate(KEY);

      service.answer(valid(T0 + 32 * DAY));
      await advance(manager, 2 * DAY);

      expect(service.keys).toHaveLength(2);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'licensed',
        expires_at: T0 + 32 * DAY,
      });
    });

    it('holds the license through the renewal grace, then lets it go for good', async () => {
      const service = fakeService(valid(T0 + 2 * DAY));
      const manager = await open();
      await manager.activate(KEY);

      service.answer(rejected('expired', T0 + 2 * DAY));
      await advance(manager, 2 * DAY);
      expect(service.keys).toHaveLength(2);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'licensed',
      });

      await advance(manager, RENEWAL_GRACE_MS);
      expect(service.keys).toHaveLength(3);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'community',
        reason: 'expired',
        dead: true,
      });

      await advance(manager, 60 * DAY);
      expect(service.keys).toHaveLength(3);
    });

    it('drops a refunded license at the next weekly check', async () => {
      const service = fakeService(valid(T0 + 30 * DAY));
      const manager = await open();
      await manager.activate(KEY);

      service.answer(rejected('expired', T0 + 30 * DAY));
      await advance(manager, CHECK_INTERVAL_MS);

      await expect(manager.status()).resolves.toMatchObject({
        edition: 'community',
        reason: 'inactive',
        dead: true,
      });
    });

    it('keeps a dead key dead across a restart, with no automatic checks', async () => {
      const configDir = tempDir();
      const service = fakeService();
      const first = await open({ configDir });
      await first.activate(KEY);
      service.answer(rejected('revoked'));
      await first.check();
      first.close();

      const second = await open({ configDir });
      await advance(second, 60 * DAY);

      await expect(second.status()).resolves.toMatchObject({
        reason: 'revoked',
        dead: true,
      });
      expect(service.keys).toHaveLength(2);
    });

    it('stands down when another localsink already did the check', async () => {
      const configDir = tempDir();
      const service = fakeService();
      const manager = await open({ configDir });
      await manager.activate(KEY);

      // Another process sharing the file checked a day early.
      const path = join(configDir, 'license.json');
      const record = await readLicenseFile(path);
      if (!record) throw new Error('expected a saved record');
      await writeLicenseFile(path, {
        ...record,
        next_check_at: T0 + CHECK_INTERVAL_MS + 3 * DAY,
      });

      await advance(manager, CHECK_INTERVAL_MS);
      expect(service.keys).toHaveLength(1);
    });
  });

  describe('Check now', () => {
    it('revives a lapsed key after a re-subscription', async () => {
      const service = fakeService(valid(T0 + 2 * DAY));
      const manager = await open();
      await manager.activate(KEY);
      service.answer(rejected('expired', T0 + 2 * DAY));
      await advance(manager, 2 * DAY);
      await advance(manager, RENEWAL_GRACE_MS);
      await expect(manager.status()).resolves.toMatchObject({
        reason: 'expired',
        dead: true,
      });

      // Re-subscribing reuses the same key; only Check now notices.
      service.answer(valid(T0 + 90 * DAY));
      await expect(manager.check()).resolves.toMatchObject({
        edition: 'licensed',
        dead: false,
      });
    });
  });

  describe('removal', () => {
    it('forgets the key', async () => {
      const configDir = tempDir();
      fakeService();
      const manager = await open({ configDir });
      await manager.activate(KEY);

      await expect(manager.remove()).resolves.toMatchObject({
        edition: 'community',
        source: 'none',
      });
      expect(existsSync(join(configDir, 'license.json'))).toBe(false);
    });

    it('drops the answer to a check that was in flight', async () => {
      const configDir = tempDir();
      const service = fakeService();
      const manager = await open({ configDir });
      await manager.activate(KEY);

      let release: (() => void) | undefined;
      service.answer(
        () =>
          new Promise<Response>((resolve) => {
            release = () => {
              resolve(valid(T0 + 365 * DAY)());
            };
          }),
      );
      const checking = manager.check();
      await vi.waitFor(() => {
        expect(service.keys).toHaveLength(2);
      });

      await manager.remove();
      release?.();
      await checking;

      expect(existsSync(join(configDir, 'license.json'))).toBe(false);
    });
  });

  it('writes nothing after close', async () => {
    const configDir = tempDir();
    const service = fakeService();
    const manager = await open({ configDir });
    await manager.activate(KEY);
    const before = readFileSync(join(configDir, 'license.json'), 'utf8');

    service.answer(rejected('revoked'));
    manager.close();
    await advance(manager, 60 * DAY);
    await manager.check();

    expect(readFileSync(join(configDir, 'license.json'), 'utf8')).toBe(before);
  });

  it('reads a corrupt license file as no key', async () => {
    const configDir = tempDir();
    writeFileSync(join(configDir, 'license.json'), '{ nope');
    const service = fakeService();
    const manager = await open({ configDir });

    await expect(manager.status()).resolves.toMatchObject({
      edition: 'community',
      source: 'none',
    });
    expect(service.keys).toEqual([]);
  });

  describe('with LOCALSINK_LICENSE_KEY', () => {
    it('checks it at startup, normalized, and never touches the license file', async () => {
      const configDir = tempDir();
      const saved = JSON.stringify({ version: 1, key: OTHER_KEY });
      writeFileSync(join(configDir, 'license.json'), saved);
      const service = fakeService(valid(T0 + 30 * DAY));

      const manager = await open({
        configDir,
        envKey: `  ${KEY.toUpperCase()} `,
      });
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'community',
        source: 'env',
        reason: 'unverified',
      });

      await advance(manager, 0);

      expect(service.keys).toEqual([KEY]);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'licensed',
        source: 'env',
      });
      expect(readFileSync(join(configDir, 'license.json'), 'utf8')).toBe(saved);
    });

    it('creates no config directory', async () => {
      const configDir = join(tempDir(), 'never-created');
      fakeService();
      const manager = await open({
        configDir,
        envKey: KEY,
      });
      await advance(manager, 0);
      await manager.check();
      expect(existsSync(configDir)).toBe(false);
    });

    it('refuses activation and removal', async () => {
      fakeService();
      const manager = await open({ envKey: KEY });
      expect(manager.source).toBe('env');
      await expect(manager.activate(OTHER_KEY)).rejects.toThrow(
        /LOCALSINK_LICENSE_KEY/,
      );
      await expect(manager.remove()).rejects.toThrow(/LOCALSINK_LICENSE_KEY/);
    });

    it('stays unverified and retries daily while the service is unreachable', async () => {
      const service = fakeService(unreachable);
      const manager = await open({ envKey: KEY });

      await advance(manager, 0);
      await expect(manager.status()).resolves.toMatchObject({
        reason: 'unverified',
        unreachable: true,
      });

      service.answer(valid(T0 + 30 * DAY));
      await advance(manager, RETRY_INTERVAL_MS);
      await expect(manager.status()).resolves.toMatchObject({
        edition: 'licensed',
      });
    });
  });

  it('keeps a non-production licensing service in its own directory', async () => {
    const configDir = tempDir();
    mkdirSync(configDir, { recursive: true });
    fakeService(valid(T0 + 365 * DAY), STAGING_VALIDATE);
    const manager = await open({
      configDir,
      licensingUrl: 'https://licensing-staging.localsink.io',
    });

    await manager.activate(KEY);

    expect(
      existsSync(
        join(configDir, 'licensing-staging.localsink.io', 'license.json'),
      ),
    ).toBe(true);
    expect(existsSync(join(configDir, 'license.json'))).toBe(false);
    await expect(manager.status()).resolves.toMatchObject({
      licensing_host: 'licensing-staging.localsink.io',
    });
  });
});
