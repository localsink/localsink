import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page, Route } from '@playwright/test';

export type ConnState = 'connected' | 'reconnecting' | 'offline';

// The live tail polls GET /api/logs (with a query string) once a second; the
// meta poll hits GET /api/logs/meta. This predicate matches only the tail poll,
// so fault injection can't collaterally break meta.
const isTailPoll = (url: URL): boolean => url.pathname === '/api/logs';

// Page object over the real SPA. Locators lean on roles/text plus the small set
// of data-testid anchors added to app source; helpers drive connectivity by
// intercepting the real polls (no MSW in the running app).
export class AppPage {
  readonly page: Page;
  // Stable handler reference so goOnline's unroute matches goOffline's route.
  private readonly abortPoll = (route: Route): Promise<void> =>
    route.abort('failed');
  readonly connectionStatus: Locator;
  readonly connectionBanner: Locator;
  readonly logList: Locator;
  readonly logRows: Locator;
  readonly search: Locator;
  readonly tailToggle: Locator;
  readonly jumpPill: Locator;
  readonly emptyState: Locator;
  readonly editionBadge: Locator;
  readonly retryButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.connectionStatus = page.getByTestId('connection-status');
    this.connectionBanner = page.getByTestId('connection-banner');
    this.logList = page.getByTestId('log-list');
    this.logRows = page.getByTestId('log-row');
    this.search = page.getByTestId('log-search');
    this.tailToggle = page.getByTestId('tail-toggle');
    // The jump pill ("↓ N new" / "↓ live"), a button with a down arrow.
    this.jumpPill = page.getByRole('button', { name: /↓/ });
    this.emptyState = page.getByText('no logs match the current filters');
    this.editionBadge = page.getByText('Community Edition');
    this.retryButton = page.getByRole('button', { name: 'Retry now' });
  }

  // Service and severity facet rows are both role=button named by the facet;
  // the two label sets are disjoint, so one accessor serves both. exact:true so
  // a service name doesn't also match a log row (whose name includes it).
  facet(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  // A row whose visible text contains the given substring (message/service).
  rowWithText(text: string): Locator {
    return this.logRows.filter({ hasText: text });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    // Wait until the first seed has rendered and connectivity has settled, so
    // specs start from a known-good state.
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

  // Persistently fail every tail poll — the app climbs to OFFLINE_AFTER and
  // shows the offline banner. Preferred over context.setOffline, which doesn't
  // reliably block loopback requests. goOnline lifts it and polling recovers.
  async goOffline(): Promise<void> {
    await this.page.route(isTailPoll, this.abortPoll);
  }

  async goOnline(): Promise<void> {
    await this.page.unroute(isTailPoll, this.abortPoll);
  }

  // Abort the next `count` tail polls, then stop intercepting so polling
  // recovers on its own — reaches "reconnecting" without escalating to
  // "offline" (which needs OFFLINE_AFTER=3 consecutive failures). Deterministic,
  // unlike racing setOffline against the threshold.
  async failNextPolls(count: number): Promise<void> {
    let failed = 0;
    await this.page.route(isTailPoll, async (route) => {
      if (failed < count) {
        failed += 1;
        await route.abort('failed');
        if (failed >= count) void this.page.unroute(isTailPoll);
        return;
      }
      await route.continue();
    });
  }
}

// POST a log through the same-origin proxy (Vite → backend). Defaults fill the
// required ingest fields; callers pass a unique service_name/message token so
// the row can't be confused with seeded data or another spec's ingest.
export async function ingestLog(
  request: APIRequestContext,
  log: { service_name: string; message: string; level?: string },
): Promise<void> {
  const response = await request.post('/api/logs', {
    data: { timestamp: Date.now(), level: 'info', ...log },
  });
  expect(response.status()).toBe(201);
}

export const test = base.extend<{ app: AppPage }>({
  app: async ({ page }, use) => {
    await use(new AppPage(page));
  },
});

export { expect };
