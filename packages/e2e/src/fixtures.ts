import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page, Route } from '@playwright/test';

import { startBackend } from './backend.ts';
import type { Backend } from './backend.ts';

export type ConnState = 'connected' | 'reconnecting' | 'offline';

// Exact match, not a prefix: fault injection must not collaterally break the
// separate /api/logs/meta poll.
const isTailPoll = (url: URL): boolean => url.pathname === '/api/logs';

export class AppPage {
  readonly page: Page;
  // Stable handler reference so goOnline's unroute matches goOffline's route.
  private readonly abortPoll = (route: Route): Promise<void> =>
    route.abort('failed');
  readonly connectionStatus: Locator;
  readonly connectionBanner: Locator;
  readonly logRows: Locator;
  readonly search: Locator;
  readonly tailToggle: Locator;
  readonly jumpPill: Locator;
  readonly emptyState: Locator;
  readonly editionBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.connectionStatus = page.getByTestId('connection-status');
    this.connectionBanner = page.getByTestId('connection-banner');
    this.logRows = page.getByTestId('log-row');
    this.search = page.getByTestId('log-search');
    this.tailToggle = page.getByTestId('tail-toggle');
    // The jump pill ("↓ N new" / "↓ live"), a button with a down arrow.
    this.jumpPill = page.getByRole('button', { name: /↓/ });
    this.emptyState = page.getByText('no logs match the current filters');
    this.editionBadge = page.getByText('Community Edition');
  }

  // Serves both service and severity facets — the two label sets are disjoint.
  // exact:true so a service name doesn't also match a log row containing it.
  facet(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  rowWithText(text: string): Locator {
    return this.logRows.filter({ hasText: text });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.expectState('connected');
    await expect(this.logRows.first()).toBeVisible();
  }

  async expectState(
    state: ConnState,
    options?: { timeout?: number },
  ): Promise<void> {
    await expect(this.connectionStatus).toHaveAttribute(
      'data-state',
      state,
      options,
    );
  }

  // Preferred over context.setOffline, which doesn't reliably block loopback
  // requests.
  async goOffline(): Promise<void> {
    await this.page.route(isTailPoll, this.abortPoll);
  }

  async goOnline(): Promise<void> {
    await this.page.unroute(isTailPoll, this.abortPoll);
  }

  // Reaches "reconnecting" without escalating to "offline" — deterministic,
  // unlike racing setOffline against the consecutive-failure threshold.
  async failNextPolls(count: number): Promise<void> {
    let failed = 0;
    await this.page.route(isTailPoll, async (route) => {
      if (failed < count) {
        failed += 1;
        await route.abort('failed');
        // Not awaited (this runs inside the handler), so swallow the rejection
        // that unroute throws if the test ended and the page is already closing.
        if (failed >= count) {
          void this.page.unroute(isTailPoll).catch(() => undefined);
        }
        return;
      }
      await route.continue();
    });
  }
}

// Uses Playwright's own request context, which picks up the baseURL fixture
// below and so addresses this test's backend.
export async function ingestLog(
  request: APIRequestContext,
  log: { service_name: string; message: string; level?: string },
): Promise<void> {
  const response = await request.post('/api/logs', {
    data: { timestamp: Date.now(), level: 'info', ...log },
  });
  expect(response.status()).toBe(201);
}

export const test = base.extend<{ app: AppPage; backend: Backend }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads the destructuring pattern to infer fixture dependencies; `{}` declares "none"
  backend: async ({}, use) => {
    const backend = await startBackend();
    await use(backend);
    await backend.close();
  },

  // The backend serves the SPA as well as /api, so everything the page does is
  // genuinely same-origin against this test's own server — no interception.
  baseURL: async ({ backend }, use) => {
    await use(backend.url);
  },

  app: async ({ page }, use) => {
    await use(new AppPage(page));
  },
});

export { expect };
