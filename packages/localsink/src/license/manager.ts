import { format } from 'node:util';

import type { LicenseActivation, LicenseStatus } from '@localsink/contract';

import type { CheckOutcome } from './client.ts';
import { checkKey, resolveLicensingOrigin } from './client.ts';
import type { Entitlement, LicenseRecord } from './store.ts';
import {
  licenseFilePath,
  readLicenseFile,
  removeLicenseFile,
  writeLicenseFile,
} from './store.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a successful check is good for. */
export const CHECK_INTERVAL_MS = 7 * DAY_MS;
/** When to try again after the licensing service couldn't be reached. */
export const RETRY_INTERVAL_MS = DAY_MS;
/**
 * How long a license stays in force past its expiry while localsink confirms
 * the renewal. Paddle charges at the end of the period and the licensing
 * service learns of it moments later, so a check at the exact expiry can
 * race the renewal.
 */
export const RENEWAL_GRACE_MS = DAY_MS;

// ── State rules ────────────────────────────────────────────────────────────
// Pure functions of (record, outcome, now), so the whole policy is testable
// without timers, files or a network.

/** The next automatic check, never later than the license's own expiry. */
function nextCheck(
  entitlement: Entitlement | null,
  candidate: number,
  now: number,
): number {
  const expiresAt = entitlement?.valid ? entitlement.expires_at : null;
  return expiresAt !== null && expiresAt > now
    ? Math.min(candidate, expiresAt)
    : candidate;
}

/** Folds one check's outcome into the record for that key. */
export function applyOutcome(
  record: LicenseRecord,
  outcome: CheckOutcome,
  now: number,
): LicenseRecord {
  const previous = record.entitlement;

  if (outcome.kind === 'indeterminate') {
    // Changes nothing about the key — only when to try again.
    return {
      ...record,
      next_check_at: nextCheck(previous, now + RETRY_INTERVAL_MS, now),
    };
  }

  if (outcome.kind === 'valid') {
    const entitlement: Entitlement = {
      valid: true,
      reason: null,
      customer: outcome.customer,
      seats: outcome.seats,
      expires_at: outcome.expiresAt,
    };
    return {
      key: record.key,
      entitlement,
      checked_at: now,
      next_check_at: nextCheck(entitlement, now + CHECK_INTERVAL_MS, now),
    };
  }

  if (outcome.reason === 'expired') {
    const previousExpiry = previous?.valid ? previous.expires_at : null;

    // The licensing service reports a refunded license as expired, often with
    // an end date still in the future. Either sign — that date, or the license
    // we held not having reached its own — means it ended early.
    const endedEarly =
      (outcome.expiresAt !== null && outcome.expiresAt > now) ||
      (previousExpiry !== null && now < previousExpiry);
    if (endedEarly) {
      return dead(record.key, 'inactive', outcome.customer, null, now);
    }

    // Inside the renewal grace: the renewal may not have landed yet. Keep the
    // license and ask once more when the grace runs out.
    if (previousExpiry !== null && now < previousExpiry + RENEWAL_GRACE_MS) {
      return {
        ...record,
        checked_at: now,
        next_check_at: previousExpiry + RENEWAL_GRACE_MS,
      };
    }
  }

  return dead(
    record.key,
    outcome.reason,
    outcome.customer,
    outcome.expiresAt,
    now,
  );
}

function dead(
  key: string,
  reason: 'expired' | 'inactive' | 'revoked' | 'not_found',
  customer: string | null,
  expiresAt: number | null,
  now: number,
): LicenseRecord {
  return {
    key,
    entitlement: {
      valid: false,
      reason,
      customer,
      seats: null,
      expires_at: expiresAt,
    },
    checked_at: now,
    // Final: no automatic checks. Check now still works, which is how a
    // customer who re-subscribes (and keeps the same key) gets back.
    next_check_at: null,
  };
}

interface StatusFacts {
  source: 'file' | 'env';
  licensingHost: string;
  checking: boolean;
  unreachable: boolean;
}

/** What the UI is told. Never includes the key beyond its last four characters. */
export function deriveStatus(
  record: LicenseRecord | null,
  facts: StatusFacts,
  now: number,
): LicenseStatus {
  const base = {
    licensing_host: facts.licensingHost,
    checking: facts.checking,
    unreachable: facts.unreachable,
  };

  if (!record) {
    return {
      ...base,
      edition: 'community',
      // An env key always has a record, so "no record" means no saved key.
      source: 'none',
      reason: null,
      dead: false,
      customer: null,
      seats: null,
      expires_at: null,
      checked_at: null,
      key_hint: null,
    };
  }

  const known = {
    ...base,
    source: facts.source,
    checked_at: record.checked_at,
    key_hint: record.key.slice(-4),
  };
  const entitlement = record.entitlement;

  if (!entitlement) {
    return {
      ...known,
      edition: 'community',
      reason: 'unverified',
      dead: false,
      customer: null,
      seats: null,
      expires_at: null,
    };
  }

  if (entitlement.valid) {
    const inForce =
      entitlement.expires_at !== null &&
      now < entitlement.expires_at + RENEWAL_GRACE_MS;
    return {
      ...known,
      edition: inForce ? 'licensed' : 'community',
      // Past the grace without a determinate answer: lapsed, but still being
      // checked, since the renewal may simply not have been confirmed yet.
      reason: inForce ? null : 'expired',
      dead: false,
      customer: entitlement.customer,
      seats: entitlement.seats,
      expires_at: entitlement.expires_at,
    };
  }

  return {
    ...known,
    edition: 'community',
    reason: entitlement.reason,
    dead: true,
    customer: entitlement.customer,
    seats: null,
    expires_at: entitlement.expires_at,
  };
}

// ── Manager ────────────────────────────────────────────────────────────────

export interface LicenseManagerOptions {
  /** localsink's own version, reported in the user agent. */
  version: string;
  /**
   * LOCALSINK_LICENSE_KEY. When set it is the only key, held in memory: the
   * license file is never read, written or mentioned.
   */
  envKey?: string | undefined;
  /** LOCALSINK_LICENSING_URL. Defaults to production. */
  licensingUrl?: string | undefined;
  /** Where the license file lives. Defaults to the OS config directory. */
  configDir?: string;
  /** Background failures. Defaults to stderr. */
  log?: (message: string) => void;
}

export interface LicenseManager {
  /** `env` when LOCALSINK_LICENSE_KEY is managing the key. */
  readonly source: 'file' | 'env';
  status(): Promise<LicenseStatus>;
  /** Validates a candidate key and saves it only if it is valid. */
  activate(key: string): Promise<LicenseActivation>;
  /** Checks the current key now, including one that is no longer checked automatically. */
  check(): Promise<LicenseStatus>;
  /** Forgets the saved key. Billing is untouched. */
  remove(): Promise<LicenseStatus>;
  /** Cancels the timer and any request in flight. */
  close(): void;
}

/** Where a key's record lives: the license file, or memory for an env key. */
interface RecordStore {
  read(): Promise<LicenseRecord | null>;
  write(record: LicenseRecord): Promise<void>;
  remove(): Promise<void>;
}

function fileStore(path: string): RecordStore {
  return {
    read: () => readLicenseFile(path),
    write: (record) => writeLicenseFile(path, record),
    remove: () => removeLicenseFile(path),
  };
}

function memoryStore(initial: LicenseRecord): RecordStore {
  let record = initial;
  return {
    read: () => Promise.resolve(record),
    write: (next) => {
      record = next;
      return Promise.resolve();
    },
    remove: () => Promise.reject(new Error('An env key cannot be removed.')),
  };
}

/**
 * Loads the saved state and schedules the first check. Never waits on the
 * network: a check that is due runs in the background.
 *
 * Throws only for an invalid `licensingUrl`.
 */
export async function openLicenseManager(
  options: LicenseManagerOptions,
): Promise<LicenseManager> {
  const origin = resolveLicensingOrigin(options.licensingUrl);
  const licensingHost = new URL(origin).host;
  const log =
    options.log ?? ((message) => process.stderr.write(`${message}\n`));
  const userAgent = `localsink/${options.version} (${process.platform}; ${process.arch})`;

  const envKey = options.envKey?.trim().toLowerCase();
  const source = envKey ? 'env' : 'file';
  const store: RecordStore = envKey
    ? // Never confirmed yet, and due immediately.
      memoryStore({
        key: envKey,
        entitlement: null,
        checked_at: null,
        next_check_at: Date.now(),
      })
    : fileStore(licenseFilePath(origin, options.configDir));

  const aborter = new AbortController();
  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  let inflight: Promise<void> | null = null;
  // Whether the last check of this key failed to reach the service. In memory
  // only: it describes this process's view of the network, not the key.
  let lastAttempt: { key: string; failed: boolean } | null = null;
  // Activation and removal run one at a time.
  let mutations: Promise<unknown> = Promise.resolve();

  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = mutations.then(fn, fn);
    mutations = run.catch(() => undefined);
    return run;
  };

  const check = (key: string): Promise<CheckOutcome> =>
    checkKey({
      origin,
      key,
      userAgent,
      signal: aborter.signal,
    });

  async function status(): Promise<LicenseStatus> {
    const record = await store.read();
    return deriveStatus(
      record,
      {
        source,
        licensingHost,
        checking: inflight !== null,
        unreachable:
          record !== null &&
          lastAttempt?.key === record.key &&
          lastAttempt.failed,
      },
      Date.now(),
    );
  }

  async function schedule(): Promise<void> {
    if (closed) return;
    const record = await store.read();
    // Cleared here, after the read, so two overlapping calls can't both leave
    // a timer behind.
    clearTimeout(timer);
    if (closed || !record || record.next_check_at === null) return;
    // Capped so a far-off date can't overflow setTimeout's 32-bit delay.
    const delay = Math.min(
      Math.max(0, record.next_check_at - Date.now()),
      CHECK_INTERVAL_MS,
    );
    timer = setTimeout(() => void refresh(false), delay);
    timer.unref();
  }

  /** One check of the current key; see `refresh`. */
  async function runCheck(force: boolean): Promise<void> {
    const record = await store.read();
    if (!record) return;
    if (
      !force &&
      (record.next_check_at === null || record.next_check_at > Date.now())
    ) {
      return;
    }

    const outcome = await check(record.key);
    if (closed) return;
    if (outcome.kind === 'indeterminate') {
      log(`License check failed: ${outcome.detail}. Will retry.`);
    }

    // Committed in turn with activation and removal: the key may have been
    // replaced or removed while the request was out, and an answer about a
    // key that is no longer current is dropped.
    await serialize(async () => {
      const current = await store.read();
      if (closed || current?.key !== record.key) return;
      lastAttempt = {
        key: record.key,
        failed: outcome.kind === 'indeterminate',
      };
      await store.write(applyOutcome(current, outcome, Date.now()));
    });
  }

  /**
   * One check at a time, through to scheduling the next, so `checking` is
   * false only once everything has settled. A background run (`force` false)
   * rereads the record first and stands down if the check isn't due — another
   * localsink sharing the file may already have done it.
   */
  async function refresh(force: boolean): Promise<void> {
    if (closed) return;
    inflight ??= (async () => {
      await runCheck(force).catch((error: unknown) => {
        log(`License check failed: ${format(error)}`);
      });
      await schedule().catch((error: unknown) => {
        log(`License check scheduling failed: ${format(error)}`);
      });
    })().finally(() => {
      inflight = null;
    });
    await inflight;
  }

  await schedule();

  return {
    source,

    status,

    activate: (key) =>
      serialize(async (): Promise<LicenseActivation> => {
        if (source === 'env') {
          throw new Error('The license key is set by LOCALSINK_LICENSE_KEY.');
        }

        const outcome = await check(key);
        if (outcome.kind === 'indeterminate') {
          return {
            outcome: 'unreachable',
            reason: null,
            status: await status(),
          };
        }

        // Judged as if it were a new key, so a refunded license reads as
        // inactive rather than expired.
        const record = applyOutcome(
          { key, entitlement: null, checked_at: null, next_check_at: null },
          outcome,
          Date.now(),
        );
        if (!record.entitlement?.valid) {
          return {
            outcome: 'rejected',
            reason: record.entitlement?.reason ?? null,
            status: await status(),
          };
        }

        try {
          await store.write(record);
        } catch (error) {
          log(`Could not save the license key: ${format(error)}`);
          return {
            outcome: 'save_failed',
            reason: null,
            status: await status(),
          };
        }
        lastAttempt = { key, failed: false };
        await schedule();
        return { outcome: 'activated', reason: null, status: await status() };
      }),

    check: async () => {
      await refresh(true);
      return status();
    },

    remove: () =>
      serialize(async () => {
        if (source === 'env') {
          throw new Error('The license key is set by LOCALSINK_LICENSE_KEY.');
        }
        await store.remove();
        lastAttempt = null;
        clearTimeout(timer);
        return status();
      }),

    close: () => {
      closed = true;
      clearTimeout(timer);
      aborter.abort();
    },
  };
}
