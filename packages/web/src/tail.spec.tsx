import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import type { LogPage, LogRow } from '@localsink/contract';
import { sampleLogs } from '@localsink/contract/fixtures';

import { ThemeProvider } from './components/theme-provider.tsx';
import { worker } from './mocks/browser.ts';
import { createAppRouter } from './router.ts';

// The tail hook seeds from the latest page, then polls after_id above its
// watermark and appends arrivals. This simulates a backend where a new row
// shows up after the initial load: an override serves the after_id polls,
// everything else falls through to the default handlers.

async function renderApp() {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: ['/'] }),
  );
  return await render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider defaultTheme="dark">
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

test('a row arriving after the initial page appends into the list', async () => {
  const template = sampleLogs.at(-1);
  if (template === undefined) throw new Error('fixtures are empty');
  const fresh: LogRow = {
    ...template,
    id: Math.max(...sampleLogs.map((log) => log.id)) + 1,
    timestamp: template.timestamp + 1000,
    message: 'freshly emitted tail row',
  };
  worker.use(
    http.get('/api/logs', ({ request }) => {
      const afterId = new URL(request.url).searchParams.get('after_id');
      // Initial (seed) request falls through to the default handler.
      if (afterId === null) return undefined;
      const body: LogPage = {
        data: fresh.id > Number(afterId) ? [fresh] : [],
        next_cursor: null,
        has_more: false,
      };
      return HttpResponse.json(body);
    }),
  );

  const screen = await renderApp();

  // Seed page rendered first…
  await expect
    .element(screen.getByText('role granted: admin to usr_9'))
    .toBeInTheDocument();
  // …then the next poll (≤1s away) delivers the new row.
  await expect
    .element(screen.getByText('freshly emitted tail row'), { timeout: 5000 })
    .toBeInTheDocument();

  // Terminal ordering: the arrival renders *below* the previous newest row.
  const previousNewest = screen
    .getByText('role granted: admin to usr_9')
    .element()
    .getBoundingClientRect();
  const arrival = screen
    .getByText('freshly emitted tail row')
    .element()
    .getBoundingClientRect();
  expect(arrival.top).toBeGreaterThan(previousNewest.top);

  // Pinned by default: the viewport tracks the bottom as rows append.
  await expect
    .poll(() => {
      const viewport = screen.container.querySelector(
        '[data-slot="scroll-area-viewport"]',
      );
      if (viewport === null) return Number.NaN;
      return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    })
    .toBeLessThanOrEqual(4);
});

test('scrolling up holds arrivals behind a "N new" pill; the pill flushes them', async () => {
  // Short window so the fixture rows overflow the list — there has to be
  // somewhere to scroll up to.
  await page.viewport(1024, 400);

  // One brand-new row per poll, ids walking upward from the fixtures.
  let nextId = Math.max(...sampleLogs.map((log) => log.id)) + 1;
  const template = sampleLogs.at(-1);
  if (template === undefined) throw new Error('fixtures are empty');
  worker.use(
    http.get('/api/logs', ({ request }) => {
      const afterId = new URL(request.url).searchParams.get('after_id');
      if (afterId === null) return undefined;
      const row: LogRow = {
        ...template,
        id: nextId,
        timestamp: template.timestamp + nextId * 1000,
        message: `tail row ${nextId}`,
      };
      nextId += 1;
      const body: LogPage = { data: [row], next_cursor: null, has_more: false };
      return HttpResponse.json(body);
    }),
  );

  const screen = await renderApp();
  await expect
    .element(screen.getByText('role granted: admin to usr_9'))
    .toBeInTheDocument();

  // Scroll to the top: releases the pin, so arrivals divert to pending.
  const viewport = screen.container.querySelector(
    '[data-slot="scroll-area-viewport"]',
  );
  if (viewport === null) throw new Error('scroll viewport not found');
  viewport.scrollTop = 0;

  const pill = screen.getByRole('button', { name: /new$/ });
  await expect.element(pill, { timeout: 5000 }).toBeInTheDocument();

  // Rows delivered after the unpin sit in pending, not in the list.
  const held = nextId - 1;
  await expect
    .element(screen.getByText(`tail row ${String(held)}`))
    .not.toBeInTheDocument();

  // The pill flushes pending into the list and re-pins to the bottom.
  await pill.click();
  await expect
    .element(screen.getByText(`tail row ${String(held)}`))
    .toBeInTheDocument();
  await expect
    .poll(
      () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
    )
    .toBeLessThanOrEqual(4);
});
