import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import App from './App.tsx';
import { ThemeProvider } from './components/theme-provider.tsx';

test('renders logs fetched from the backend', async () => {
  const { getByText } = await render(
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>,
  );

  // Always-present main-column chrome → App mounted.
  await expect.element(getByText('Community Edition')).toBeInTheDocument();

  // Newest sample log lands in the first page → proves the MSW data path
  // (meta + logs fetched and rendered into the grid).
  await expect
    .element(getByText('role granted: admin to usr_9'))
    .toBeInTheDocument();
});
