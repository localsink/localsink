import { format } from 'node:util';

import { z } from 'zod';

/** Where licenses are validated when LOCALSINK_LICENSING_URL is not set. */
export const DEFAULT_LICENSING_URL = 'https://licensing.localsink.io';

const TIMEOUT_MS = 10_000;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The origin to send license keys to. HTTPS only, except plain HTTP on
 * loopback for a local `wrangler dev`. The key travels in the request body, so
 * anything that could leak or redirect it (credentials, a path, a query) is
 * rejected rather than silently dropped.
 */
export function resolveLicensingOrigin(input = DEFAULT_LICENSING_URL): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid licensing URL "${input}".`);
  }
  const secure =
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (
    !secure ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(
      `Invalid licensing URL "${input}": expected an https:// origin such as ${DEFAULT_LICENSING_URL}.`,
    );
  }
  return url.origin;
}

// The licensing service's POST /v1/validate responses (licensing repo,
// src/routes/validate.ts). Only the fields localsink uses; the rest are
// stripped. Its timestamps are epoch seconds.
const validSchema = z.object({
  valid: z.literal(true),
  customer: z.string(),
  seats: z.number().int(),
  expires_at: z.number(),
});

const invalidSchema = z.object({
  valid: z.literal(false),
  reason: z.enum(['expired', 'revoked', 'not_found']),
  customer: z.string().optional(),
  expires_at: z.number().nullable().optional(),
});

const responseSchema = z.union([validSchema, invalidSchema]);

/**
 * What a check established. `indeterminate` covers everything that isn't a
 * well-formed answer from the service — network failure, timeout, a non-200,
 * an unexpected body — and must never change what localsink believes about
 * the key. Timestamps are epoch milliseconds.
 */
export type CheckOutcome =
  | { kind: 'valid'; customer: string; seats: number; expiresAt: number }
  | {
      kind: 'rejected';
      reason: 'expired' | 'revoked' | 'not_found';
      customer: string | null;
      expiresAt: number | null;
    }
  | { kind: 'indeterminate'; detail: string };

export interface CheckKeyOptions {
  origin: string;
  key: string;
  userAgent: string;
  signal: AbortSignal;
}

/**
 * One POST /v1/validate. The body is the key and nothing else; version and
 * platform travel only in the user agent, which is all the privacy notice
 * covers.
 */
export async function checkKey(
  options: CheckKeyOptions,
): Promise<CheckOutcome> {
  let response: Response;
  try {
    response = await fetch(`${options.origin}/v1/validate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': options.userAgent,
      },
      body: JSON.stringify({ key: options.key }),
      // A redirect would re-send the key somewhere nobody configured.
      redirect: 'error',
      signal: AbortSignal.any([
        options.signal,
        AbortSignal.timeout(TIMEOUT_MS),
      ]),
    });
  } catch (error) {
    return { kind: 'indeterminate', detail: describe(error) };
  }

  // Determinate answers — including "expired" and "revoked" — are always 200.
  // Anything else is the service or the network failing, not a verdict.
  if (response.status !== 200) {
    return {
      kind: 'indeterminate',
      detail: `HTTP ${String(response.status)}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { kind: 'indeterminate', detail: describe(error) };
  }

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: 'indeterminate', detail: 'unexpected response body' };
  }

  const answer = parsed.data;
  if (answer.valid) {
    return {
      kind: 'valid',
      customer: answer.customer,
      seats: answer.seats,
      expiresAt: answer.expires_at * 1000,
    };
  }
  return {
    kind: 'rejected',
    reason: answer.reason,
    customer: answer.customer ?? null,
    expiresAt:
      answer.expires_at === undefined || answer.expires_at === null
        ? null
        : answer.expires_at * 1000,
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : format(error);
}
