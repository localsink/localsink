import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import { AttrStrip } from './attr-strip.tsx';

test('renders the message and caps overflow with a +N counter', async () => {
  const pairs = ['a', 'b', 'c', 'd', 'e'].map((key, index) => ({
    key,
    value: String(index + 1),
  }));
  const { getByText } = await render(
    <AttrStrip message="request handled" pairs={pairs} />,
  );

  await expect.element(getByText('request handled')).toBeInTheDocument();
  // MAX_CHIPS = 3 are shown, so two are hidden behind the counter.
  await expect.element(getByText('+2')).toBeInTheDocument();
});
