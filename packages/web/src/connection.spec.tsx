import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import App from './App.tsx';
import { ThemeProvider } from './components/theme-provider.tsx';
import { worker } from './mocks/browser.ts';

// Connectivity is derived from the logs poll (failureCount), so these specs
// drive it by making the MSW logs handler fail like a downed backend.
// test-setup.ts resets the override between tests.

const logsFailure = http.get('/api/logs', () => HttpResponse.error());

async function renderApp() {
  return await render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider defaultTheme="dark">
        <App />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

test('an unreachable backend escalates reconnecting → offline', async () => {
  worker.use(logsFailure);
  const screen = await renderApp();

  await expect
    .element(screen.getByText('Reconnecting to the localsink backend…'))
    .toBeInTheDocument();

  // Retry clicks are failed attempts too; the third consecutive failure
  // flips to offline. The 5s poll is the fallback if a click's refetch
  // got deduped — hence the generous timeout.
  await screen.getByRole('button', { name: 'Retry now' }).click();
  await screen.getByRole('button', { name: 'Retry now' }).click();

  await expect
    .element(screen.getByText("Can't reach the localsink backend."), {
      timeout: 7000,
    })
    .toBeInTheDocument();
});

test('a successful retry clears the banner and renders logs', async () => {
  worker.use(logsFailure);
  const screen = await renderApp();

  await expect
    .element(screen.getByText('Reconnecting to the localsink backend…'))
    .toBeInTheDocument();

  // Backend "comes back": drop the failure override, retry immediately.
  worker.resetHandlers();
  await screen.getByRole('button', { name: 'Retry now' }).click();

  await expect
    .element(screen.getByText('role granted: admin to usr_9'))
    .toBeInTheDocument();
  expect(
    screen.getByText('Reconnecting to the localsink backend…').query(),
  ).toBeNull();
});
