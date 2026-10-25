import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import envPaths from 'env-paths';
import { z } from 'zod';

import { DEFAULT_LICENSING_URL } from './client.ts';

/**
 * What localsink last learned about a key from the licensing service. Epoch
 * milliseconds throughout.
 *
 * `valid: false` is final: the service answered, and the answer was no.
 * `reason` is null exactly when `valid` is true.
 */
export interface Entitlement {
  valid: boolean;
  reason: 'expired' | 'inactive' | 'revoked' | 'not_found' | null;
  customer: string | null;
  seats: number | null;
  expires_at: number | null;
}

/**
 * A key and everything known about it. `entitlement` is null until the
 * service has given a determinate answer; `next_check_at` is null once no
 * further automatic check is wanted.
 */
export interface LicenseRecord {
  key: string;
  entitlement: Entitlement | null;
  checked_at: number | null;
  next_check_at: number | null;
}

const entitlementSchema = z.object({
  valid: z.boolean(),
  reason: z.enum(['expired', 'inactive', 'revoked', 'not_found']).nullable(),
  customer: z.string().nullable(),
  seats: z.number().int().nullable(),
  expires_at: z.number().nullable(),
});

const fileSchema = z.object({
  version: z.literal(1),
  key: z.string().min(1),
  entitlement: entitlementSchema.nullable(),
  checked_at: z.number().nullable(),
  next_check_at: z.number().nullable(),
});

/**
 * Per-user, not per-project: the logs database lives in the working directory,
 * but a license follows the person. A licensing service other than production
 * (staging, a local `wrangler dev`) gets its own subdirectory, so its keys and
 * answers never mix with production's.
 */
export function licenseFilePath(
  origin: string,
  configDir = envPaths('localsink', { suffix: '' }).config,
): string {
  if (origin === DEFAULT_LICENSING_URL) {
    return join(configDir, 'license.json');
  }
  const { hostname, port } = new URL(origin);
  // `:` is not allowed in Windows directory names.
  const dir = port === '' ? hostname : `${hostname}-${port}`;
  return join(configDir, dir, 'license.json');
}

/**
 * The saved record, or null. A file that is missing, unreadable, not JSON or
 * the wrong shape reads as "no saved key" — the user pastes the key again —
 * rather than failing the server or being trusted.
 */
export async function readLicenseFile(
  path: string,
): Promise<LicenseRecord | null> {
  let json: unknown;
  try {
    json = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }

  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) return null;
  const { key, entitlement, checked_at, next_check_at } = parsed.data;
  return { key, entitlement, checked_at, next_check_at };
}

/** Owner-only: the file holds a bearer credential. */
export async function writeLicenseFile(
  path: string,
  record: LicenseRecord,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(
    path,
    `${JSON.stringify({ version: 1, ...record }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

export async function removeLicenseFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
