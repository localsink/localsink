import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw/http';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import type { LicenseActivation, LicenseStatus } from '@localsink/contract';

import { LicenseDialog } from './components/license-dialog.tsx';
import { worker } from './mocks/browser.ts';
import { communityLicense } from './mocks/handlers.ts';

const KEY = '0f8fad5b-d9cb-469f-a165-70867728950e';

const licensed: LicenseStatus = {
  ...communityLicense,
  edition: 'licensed',
  source: 'file',
  customer: 'Acme',
  seats: 5,
  expires_at: Date.UTC(2027, 8, 26),
  checked_at: Date.UTC(2026, 8, 20),
  key_hint: '950e',
};

function serveStatus(status: LicenseStatus) {
  worker.use(http.get('/api/license', () => HttpResponse.json(status)));
}

// A modal dialog makes the rest of the page inert, badge included, so the
// badge is asserted on after closing it.
async function closeDialog(): Promise<void> {
  await userEvent.keyboard('{Escape}');
}

async function openDialog(status: LicenseStatus = communityLicense) {
  serveStatus(status);
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <LicenseDialog />
    </QueryClientProvider>,
  );
  const badge =
    status.edition === 'licensed' ? 'Licensed' : 'Community Edition';
  await screen.getByRole('button', { name: badge }).click();
  const dialog = screen.getByRole('dialog');
  await expect.element(dialog).toBeInTheDocument();
  return { screen, dialog };
}

test('Community Edition explains the editions and offers a key field and purchase link', async () => {
  const { dialog } = await openDialog();

  await expect
    .element(dialog.getByRole('heading', { name: 'Community Edition' }))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByText(/needs a commercial license/))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByLabelText('License key'))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByRole('link', { name: /Buy a commercial license/ }))
    .toHaveAttribute('href', 'https://localsink.io/pricing');
  await expect
    .element(dialog.getByRole('button', { name: 'Check now' }))
    .not.toBeInTheDocument();
});

test('activating a key flips the badge to Licensed', async () => {
  const sent: unknown[] = [];
  worker.use(
    http.put('/api/license', async ({ request }) => {
      sent.push(await request.json());
      const result: LicenseActivation = {
        outcome: 'activated',
        reason: null,
        status: licensed,
      };
      return HttpResponse.json(result);
    }),
  );
  const { screen, dialog } = await openDialog();

  await dialog.getByLabelText('License key').fill(`  ${KEY.toUpperCase()}`);
  await dialog.getByRole('button', { name: 'Activate' }).click();

  await expect.element(dialog.getByText('Acme')).toBeInTheDocument();
  await expect
    .element(dialog.getByRole('heading', { name: 'Licensed Edition' }))
    .toBeInTheDocument();
  await closeDialog();
  await expect
    .element(screen.getByRole('button', { name: 'Licensed' }))
    .toBeInTheDocument();
  expect(sent).toEqual([{ key: KEY }]);
});

test('something that is not a key is caught before it is sent', async () => {
  let requests = 0;
  worker.use(
    http.put('/api/license', () => {
      requests += 1;
      return HttpResponse.json({});
    }),
  );
  const { dialog } = await openDialog();

  await dialog.getByLabelText('License key').fill('not-a-key');
  await dialog.getByRole('button', { name: 'Activate' }).click();

  await expect
    .element(dialog.getByRole('alert'))
    .toHaveTextContent("That doesn't look like a license key.");
  expect(requests).toBe(0);
});

test.each([
  ['rejected', 'not_found', /That license key wasn't recognized/],
  ['rejected', 'inactive', /That commercial license is no longer active/],
  ['unreachable', null, /Couldn't reach the licensing server/],
  ['save_failed', null, /couldn't save it/],
] as const)(
  'reports a %s activation (%s)',
  async (outcome, reason, message) => {
    worker.use(
      http.put('/api/license', () => {
        const result: LicenseActivation = {
          outcome,
          reason,
          status: communityLicense,
        };
        return HttpResponse.json(result);
      }),
    );
    const { dialog } = await openDialog();

    await dialog.getByLabelText('License key').fill(KEY);
    await dialog.getByRole('button', { name: 'Activate' }).click();

    await expect
      .element(dialog.getByText(message))
      .toHaveAttribute('role', 'alert');
    await expect
      .element(dialog.getByRole('heading', { name: 'Community Edition' }))
      .toBeInTheDocument();
  },
);

test('Licensed shows the license and can check, replace and remove it', async () => {
  let checks = 0;
  worker.use(
    http.post('/api/license/check', () => {
      checks += 1;
      return HttpResponse.json(licensed);
    }),
    http.delete('/api/license', () => HttpResponse.json(communityLicense)),
  );
  const { screen, dialog } = await openDialog(licensed);

  await expect.element(dialog.getByText('Acme')).toBeInTheDocument();
  await expect.element(dialog.getByText('2027-09-26')).toBeInTheDocument();
  await expect.element(dialog.getByText('•••• 950e')).toBeInTheDocument();
  await expect
    .element(dialog.getByRole('link', { name: /Manage billing/ }))
    .toHaveAttribute('href', 'https://paddle.net');
  await expect
    .element(dialog.getByText(/subscription and billing are unchanged/))
    .toBeInTheDocument();

  await dialog.getByRole('button', { name: 'Check now' }).click();
  await expect.poll(() => checks).toBe(1);

  await dialog.getByRole('button', { name: 'Replace key' }).click();
  await expect
    .element(dialog.getByLabelText('New license key'))
    .toBeInTheDocument();

  await dialog
    .getByRole('button', { name: 'Remove from this computer' })
    .click();
  await expect
    .element(dialog.getByRole('heading', { name: 'Community Edition' }))
    .toBeInTheDocument();
  await closeDialog();
  await expect
    .element(screen.getByRole('button', { name: 'Community Edition' }))
    .toBeInTheDocument();
});

test('a key from LOCALSINK_LICENSE_KEY can only be checked', async () => {
  const { dialog } = await openDialog({ ...licensed, source: 'env' });

  await expect
    .element(dialog.getByText(/set by LOCALSINK_LICENSE_KEY/))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByRole('button', { name: 'Check now' }))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByRole('button', { name: 'Replace key' }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByRole('button', { name: 'Remove from this computer' }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByLabelText(/license key/i))
    .not.toBeInTheDocument();
});

test('a lapsed key invites a check after renewing, and a replacement', async () => {
  const { dialog } = await openDialog({
    ...licensed,
    edition: 'community',
    reason: 'expired',
    dead: true,
    seats: null,
    expires_at: Date.UTC(2026, 0, 1),
  });

  await expect
    .element(dialog.getByRole('status'))
    .toHaveTextContent(
      'Your license expired on 2026-01-01. Renewed? Check again.',
    );
  await expect
    .element(dialog.getByRole('button', { name: 'Check now' }))
    .toBeInTheDocument();
  await expect
    .element(dialog.getByLabelText('New license key'))
    .toBeInTheDocument();
});

test('an unreachable licensing server is shown without losing the license', async () => {
  const { screen, dialog } = await openDialog({
    ...licensed,
    unreachable: true,
  });

  await expect
    .element(dialog.getByText(/Couldn't reach the licensing server/))
    .toBeInTheDocument();
  await closeDialog();
  await expect
    .element(screen.getByRole('button', { name: 'Licensed' }))
    .toBeInTheDocument();
});

test('a non-production licensing server is named', async () => {
  const { dialog } = await openDialog({
    ...communityLicense,
    licensing_host: 'licensing-staging.localsink.io',
  });

  await expect
    .element(
      dialog.getByText('Licensing server: licensing-staging.localsink.io'),
    )
    .toBeInTheDocument();
});

test('the badge opens and closes the dialog from the keyboard', async () => {
  serveStatus(communityLicense);
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <LicenseDialog />
    </QueryClientProvider>,
  );
  const badge = screen.getByRole('button', { name: 'Community Edition' });
  await expect.element(badge).toBeInTheDocument();

  badge.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(screen.getByRole('dialog')).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
});
