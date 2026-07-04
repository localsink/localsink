import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';

import App from './App.tsx';

// Filters live in the URL (?service=api,auth&level=error&q=slow+query) so a
// view is refresh-proof and shareable, and each browser tab can hold its own
// filter combo. Multi-value facets are comma-joined to keep URLs readable.
export type LogSearch = {
  service?: string | undefined;
  level?: string | undefined;
  q?: string | undefined;
};

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

const rootRoute = createRootRoute();

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): LogSearch => ({
    service: nonEmptyString(search['service']),
    level: nonEmptyString(search['level']),
    q: nonEmptyString(search['q']),
  }),
  component: App,
});

const routeTree = rootRoute.addChildren([indexRoute]);

// history is injectable so specs can run on createMemoryHistory.
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history ? { history } : {}) });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
