import { delay } from 'msw';
import type { JsonBodyType } from 'msw';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';

import type { CheckKeyOptions } from './client.ts';
import {
  checkKey,
  DEFAULT_LICENSING_URL,
  resolveLicensingOrigin,
} from './client.ts';

const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e';
const USER_AGENT = 'localsink/1.2.3 (darwin; arm64)';
const VALIDATE = `${DEFAULT_LICENSING_URL}/v1/validate`;

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function answer(status: number, body: JsonBodyType) {
  server.use(
    http.post(VALIDATE, () =>
      typeof body === 'string'
        ? new HttpResponse(body, { status })
        : HttpResponse.json(body, { status }),
    ),
  );
}

function options(signal = new AbortController().signal): CheckKeyOptions {
  return {
    origin: DEFAULT_LICENSING_URL,
    key: KEY,
    userAgent: USER_AGENT,
    signal,
  };
}

describe('resolveLicensingOrigin', () => {
  it('defaults to production', () => {
    expect(resolveLicensingOrigin()).toBe('https://licensing.localsink.io');
  });

  it.each([
    [
      'https://licensing-staging.localsink.io',
      'https://licensing-staging.localsink.io',
    ],
    [
      'https://licensing-staging.localsink.io/',
      'https://licensing-staging.localsink.io',
    ],
    ['http://localhost:8787', 'http://localhost:8787'],
    ['http://127.0.0.1:8787', 'http://127.0.0.1:8787'],
    ['http://[::1]:8787', 'http://[::1]:8787'],
  ])('accepts %s', (input, origin) => {
    expect(resolveLicensingOrigin(input)).toBe(origin);
  });

  it.each([
    'not a url',
    'http://licensing.localsink.io',
    'ftp://licensing.localsink.io',
    'https://user:pass@licensing.localsink.io',
    'https://licensing.localsink.io/v1',
    'https://licensing.localsink.io/?x=1',
    'https://licensing.localsink.io/#x',
  ])('rejects %s', (input) => {
    expect(() => resolveLicensingOrigin(input)).toThrow(
      /Invalid licensing URL/,
    );
  });
});

describe('checkKey', () => {
  it('POSTs only the key, with version and platform in the user agent', async () => {
    let received: { body: unknown; userAgent: string | null } | undefined;
    server.use(
      http.post(VALIDATE, async ({ request }) => {
        received = {
          body: await request.json(),
          userAgent: request.headers.get('user-agent'),
        };
        return HttpResponse.json({ valid: false, reason: 'not_found' });
      }),
    );

    await checkKey(options());

    expect(received).toEqual({ body: { key: KEY }, userAgent: USER_AGENT });
  });

  it('maps a valid answer, converting seconds to milliseconds', async () => {
    answer(200, {
      valid: true,
      customer: 'Acme',
      seats: 5,
      plan: 'commercial',
      starts_at: 1_700_000_000,
      expires_at: 1_800_000_000,
      checked_at: 1_750_000_000,
    });
    await expect(checkKey(options())).resolves.toEqual({
      kind: 'valid',
      customer: 'Acme',
      seats: 5,
      expiresAt: 1_800_000_000_000,
    });
  });

  it('maps an expired answer', async () => {
    answer(200, {
      valid: false,
      reason: 'expired',
      customer: 'Acme',
      expires_at: 1_800_000_000,
    });
    await expect(checkKey(options())).resolves.toEqual({
      kind: 'rejected',
      reason: 'expired',
      customer: 'Acme',
      expiresAt: 1_800_000_000_000,
    });
  });

  it('maps an expired answer with no end date', async () => {
    answer(200, {
      valid: false,
      reason: 'expired',
      customer: 'Acme',
      expires_at: null,
    });
    await expect(checkKey(options())).resolves.toMatchObject({
      kind: 'rejected',
      expiresAt: null,
    });
  });

  it.each(['revoked', 'not_found'] as const)('maps %s', async (reason) => {
    answer(200, { valid: false, reason });
    await expect(checkKey(options())).resolves.toEqual({
      kind: 'rejected',
      reason,
      customer: null,
      expiresAt: null,
    });
  });

  it.each([
    ['a 400', 400, { valid: false, reason: 'malformed' }],
    ['a 500', 500, { error: 'boom' }],
    ['a 429', 429, 'slow down'],
    ['a 200 that is not JSON', 200, '<html>'],
    ['a 200 of the wrong shape', 200, { valid: 'yes' }],
    ["a 200 'malformed' verdict", 200, { valid: false, reason: 'malformed' }],
  ])('treats %s as indeterminate', async (_label, status, body) => {
    answer(status, body);
    await expect(checkKey(options())).resolves.toMatchObject({
      kind: 'indeterminate',
    });
  });

  it('treats a network failure as indeterminate', async () => {
    server.use(http.post(VALIDATE, () => HttpResponse.error()));
    await expect(checkKey(options())).resolves.toMatchObject({
      kind: 'indeterminate',
    });
  });

  it('treats an aborted request as indeterminate', async () => {
    server.use(
      http.post(VALIDATE, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const aborter = new AbortController();
    const pending = checkKey(options(aborter.signal));
    aborter.abort();
    await expect(pending).resolves.toMatchObject({ kind: 'indeterminate' });
  });
});
