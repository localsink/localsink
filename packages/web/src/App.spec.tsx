import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { ThemeProvider } from './components/theme-provider.tsx';
import { createAppRouter } from './router.ts';

test('renders logs fetched from the backend', async () => {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
  );
  const { getByText } = await render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider defaultTheme="dark">
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );

  // Always-present main-column chrome → App mounted.
  await expect.element(getByText('Community Edition')).toBeInTheDocument();

  // Newest sample log lands in the first page → proves the MSW data path
  // (meta + logs fetched and rendered into the grid).
  await expect
    .element(getByText('role granted: admin to usr_9'))
    .toBeInTheDocument();
});
