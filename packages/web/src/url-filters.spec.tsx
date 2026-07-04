import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { ThemeProvider } from './components/theme-provider.tsx';
import { createAppRouter } from './router.ts';

// Filters are URL state: the search params drive the backend query, and
// interactions write back to the URL. Memory history pins the starting URL.

async function renderAt(url: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [url] }),
  );
  const screen = await render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider defaultTheme="dark">
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { screen, router };
}

test('a level filter in the URL narrows the rendered logs', async () => {
  const { screen } = await renderAt('/?level=error');

  await expect.element(screen.getByText('charge declined')).toBeInTheDocument();
  // audit-level row filtered out by ?level=error
  await expect
    .element(screen.getByText('role granted: admin to usr_9'))
    .not.toBeInTheDocument();
});

test('typing a search writes q back to the URL and narrows rows', async () => {
  const { screen, router } = await renderAt('/');
  await expect
    .element(screen.getByText('role granted: admin to usr_9'))
    .toBeInTheDocument();

  await screen.getByPlaceholder('Search logs…').fill('slow query');

  await expect.poll(() => router.state.location.search.q).toBe('slow query');
  await expect
    .element(screen.getByText('slow query detected'))
    .toBeInTheDocument();
  // The unfiltered page also contains the row above, so only this row's
  // disappearance proves the narrowed response actually rendered.
  await expect
    .element(screen.getByText('role granted: admin to usr_9'))
    .not.toBeInTheDocument();
});
