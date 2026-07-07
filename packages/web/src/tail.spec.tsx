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

test('scrolling to the top loads older history pages without jumping', async () => {
  // Window short enough that a 10-row page overflows the list (so there is
  // a top to scroll to), pages small enough that 21 fixtures span three.
  await page.viewport(1024, 360);

  // Same cursor semantics as the real handler; tail polls report nothing
  // new. The default 50-row page would swallow all fixtures whole.
  const PAGE = 10;
  const sorted = sampleLogs.toSorted(
    (a, b) => b.timestamp - a.timestamp || b.id - a.id,
  );
  worker.use(
    http.get('/api/logs', ({ request }) => {
      const params = new URL(request.url).searchParams;
      if (params.get('after_id') !== null) {
        const body: LogPage = { data: [], next_cursor: null, has_more: false };
        return HttpResponse.json(body);
      }
      let start = 0;
      const cursor = params.get('cursor');
      if (cursor !== null) {
        const ts = Number(cursor.split(':')[0]);
        const id = Number(cursor.split(':')[1]);
        const index = sorted.findIndex(
          (log) => log.timestamp < ts || (log.timestamp === ts && log.id < id),
        );
        start = index < 0 ? sorted.length : index;
      }
      const paged = sorted.slice(start, start + PAGE + 1);
      const hasMore = paged.length > PAGE;
      const data = paged.slice(0, PAGE);
      const lastRow = data.at(-1);
      const body: LogPage = {
        data,
        next_cursor:
          hasMore && lastRow ? `${lastRow.timestamp}:${lastRow.id}` : null,
        has_more: hasMore,
      };
      return HttpResponse.json(body);
    }),
  );

  const newest = sorted.at(0);
  const oldest = sorted.at(-1);
  const firstOnPageTwo = sorted.at(PAGE);
  if (!newest || !oldest || !firstOnPageTwo) throw new Error('need fixtures');

  const screen = await renderApp();
  await expect.element(screen.getByText(newest.message)).toBeInTheDocument();
  // Older pages aren't loaded yet.
  await expect
    .element(screen.getByText(firstOnPageTwo.message))
    .not.toBeInTheDocument();

  const viewport = screen.container.querySelector(
    '[data-slot="scroll-area-viewport"]',
  );
  if (viewport === null) throw new Error('scroll viewport not found');

  // Hit the top: the next history page prepends…
  viewport.scrollTop = 0;
  await expect
    .element(screen.getByText(firstOnPageTwo.message), { timeout: 5000 })
    .toBeInTheDocument();
  // …and scroll compensation pushed the viewport off 0 by the prepended
  // height, so the reading position held.
  await expect.poll(() => viewport.scrollTop).toBeGreaterThan(0);

  // Keep hitting the top until the beginning of history is in.
  await expect
    .poll(
      () => {
        viewport.scrollTop = 0;
        return screen.getByText(oldest.message).query() !== null;
      },
      { timeout: 5000 },
    )
    .toBe(true);
});

// ~21 sequential page loads against an ever-larger list — genuinely slow.
test(
  'deep history slides the window; "↓ live" re-seeds at the live edge',
  {
    timeout: 45000,
  },
  async () => {
    await page.viewport(1024, 360);

    const template = sampleLogs.at(-1);
    if (template === undefined) throw new Error('fixtures are empty');
    // 1,200 synthetic rows — walking history past MAX_ROWS (1,000) must
    // evict the live edge instead of growing the DOM forever.
    const TOTAL = 1200;
    const all: LogRow[] = Array.from({ length: TOTAL }, (_, index) => ({
      ...template,
      id: index + 1,
      timestamp: 1_750_000_000_000 + (index + 1) * 1000,
      message: `window row ${String(index + 1)}`,
    }));
    const sorted = all.toSorted(
      (a, b) => b.timestamp - a.timestamp || b.id - a.id,
    );
    worker.use(
      http.get('/api/logs', ({ request }) => {
        const params = new URL(request.url).searchParams;
        const limit = Number(params.get('limit') ?? 50);
        const afterId = params.get('after_id');
        if (afterId !== null) {
          const matching = all.filter((row) => row.id > Number(afterId));
          const body: LogPage = {
            data: matching.slice(0, limit),
            next_cursor: null,
            has_more: matching.length > limit,
          };
          return HttpResponse.json(body);
        }
        let start = 0;
        const cursor = params.get('cursor');
        if (cursor !== null) {
          const ts = Number(cursor.split(':')[0]);
          const id = Number(cursor.split(':')[1]);
          const index = sorted.findIndex(
            (log) =>
              log.timestamp < ts || (log.timestamp === ts && log.id < id),
          );
          start = index < 0 ? sorted.length : index;
        }
        const paged = sorted.slice(start, start + limit + 1);
        const hasMore = paged.length > limit;
        const data = paged.slice(0, limit);
        const lastRow = data.at(-1);
        const body: LogPage = {
          data,
          next_cursor:
            hasMore && lastRow ? `${lastRow.timestamp}:${lastRow.id}` : null,
          has_more: hasMore,
        };
        return HttpResponse.json(body);
      }),
    );

    const screen = await renderApp();
    await expect
      .element(screen.getByText('window row 1200'))
      .toBeInTheDocument();

    const viewport = screen.container.querySelector(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport === null) throw new Error('scroll viewport not found');

    // Walk into history until the window slides past the cap and detaches —
    // the pill flips to its detached "↓ live" form.
    await expect
      .poll(
        () => {
          viewport.scrollTop = 0;
          return screen.getByText('↓ live').query() !== null;
        },
        { timeout: 40000 },
      )
      .toBe(true);
    // The live edge really left the DOM.
    await expect
      .element(screen.getByText('window row 1200'))
      .not.toBeInTheDocument();

    // Jump back: re-seeds at the live edge, pinned to the bottom.
    await screen.getByText('↓ live').click();
    await expect
      .element(screen.getByText('window row 1200'), { timeout: 5000 })
      .toBeInTheDocument();
    await expect
      .poll(
        () =>
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
      )
      .toBeLessThanOrEqual(4);
  },
);

test('the footer toggle pauses polling entirely and resumes with a catch-up', async () => {
  // One brand-new row per poll — nextId doubles as a poll counter, so a
  // frozen nextId proves the poll schedule actually stopped.
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
  await expect.element(screen.getByText('tailing')).toBeInTheDocument();

  await screen.getByText('tailing').click();
  await expect.element(screen.getByText('▸ paused')).toBeInTheDocument();

  // Two poll intervals with no after_id request: the schedule is stopped.
  const before = nextId;
  await new Promise((resolve) => setTimeout(resolve, 2500));
  expect(nextId).toBe(before);

  // Resume: immediate refetch drains what "arrived" while paused.
  await screen.getByText('▸ paused').click();
  await expect.element(screen.getByText('tailing')).toBeInTheDocument();
  await expect
    .element(screen.getByText(`tail row ${String(before)}`), { timeout: 5000 })
    .toBeInTheDocument();
});
