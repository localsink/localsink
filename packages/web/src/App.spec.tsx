import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import App from './App.tsx';

test('renders heading', async () => {
  const { getByText } = await render(<App />);
  await expect.element(getByText('localsink')).toBeInTheDocument();
});
