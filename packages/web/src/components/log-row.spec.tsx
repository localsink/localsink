import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';

import type { LogRow as LogRowData } from '@localsink/contract';

import type { LevelStyle } from '../lib/levels.ts';
import { LogRow } from './log-row.tsx';

const sample: LogRowData = {
  id: 1,
  service_name: 'api-gateway',
  timestamp: 1_700_000_000_000,
  level: 'error',
  message: 'boom happened',
  trace_id: null,
  span_id: null,
  logger: null,
  error: null,
  attributes: { region: 'us-east-1' },
};

const levelStyle: LevelStyle = {
  color: 'var(--ls-error)',
  background: 'var(--ls-error-bg)',
  rank: 4,
};

test('renders the level badge and the message', async () => {
  const { getByText } = await render(
    <LogRow
      log={sample}
      serviceColor="var(--ls-svc-1)"
      levelStyle={levelStyle}
      open={false}
      onToggle={() => undefined}
    />,
  );

  await expect.element(getByText('error')).toBeInTheDocument();
  await expect.element(getByText('boom happened')).toBeInTheDocument();
});
