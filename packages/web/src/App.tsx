import { AppSidebar } from '@/components/app-sidebar.tsx';
import { ConnectionBanner } from '@/components/connection-banner.tsx';
import type { ConnectionState } from '@/components/connection-banner.tsx';
import { EditionBadge } from '@/components/edition-badge.tsx';
import { LogList } from '@/components/log-list.tsx';
import { ModeToggle } from '@/components/mode-toggle.tsx';
import { Topbar } from '@/components/topbar.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar.tsx';
import { useDebouncedCallback } from '@tanstack/react-pacer';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';

import { useLogTail } from './hooks/use-log-tail.ts';
import { fetchMeta } from './lib/api.ts';
import type { LogQuery } from './lib/api.ts';
import { buildLevelStyleMap } from './lib/levels.ts';
import type { LevelStyle } from './lib/levels.ts';
import { buildServiceColorMap } from './lib/service-color.ts';

const FALLBACK_LEVEL_STYLE: LevelStyle = {
  color: 'var(--ls-fg-faint)',
  background: 'var(--ls-bg-3)',
  rank: -1,
};

// Meta (facet counts) refreshes slower than the 1s log tail — new services
// and levels appearing within a few seconds is plenty.
const META_POLL_MS = 5000;
// Search keystrokes settle before the URL (and thus the tail's query key)
// changes — every distinct `q` tears down and re-seeds the whole tail, so
// writing per keystroke would fire a seed fetch per character.
const SEARCH_DEBOUNCE_MS = 250;
// Consecutive failures before the banner escalates reconnecting → offline.
const OFFLINE_AFTER = 3;

function toggleInSet(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// Comma-joined URL form of a facet set; undefined drops the param entirely.
function joinSet(set: Set<string>): string | undefined {
  return set.size > 0 ? [...set].join(',') : undefined;
}

const routeApi = getRouteApi('/');

// Shell: query the backend and render the faceted sidebar + grid.
// Facet selection and search drive the query (OR within a group, AND across).
export default function App() {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  // Filters are URL state (see router.ts): read from the search params,
  // written back via navigate. Sets are the working shape in components.
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  // No manual memoization here or below: the React Compiler (vite + vitest
  // run the same babel preset) caches these; queryKey stability additionally
  // never depends on identity — TanStack hashes keys structurally.
  const selectedServices = new Set(search.service?.split(',') ?? []);
  const selectedLevels = new Set(search.level?.split(',') ?? []);
  const query = search.q ?? '';

  // The input renders a local draft; the URL (the source of truth the tail
  // queries by) follows after the debounce. When q changes from outside
  // (back/forward, shared link) the draft re-syncs — state adjusted during
  // render (react.dev "adjusting state when a prop changes"), not in an
  // effect, so there's no extra committed frame with the stale draft.
  const [searchDraft, setSearchDraft] = useState(query);
  const [draftBase, setDraftBase] = useState(query);
  if (draftBase !== query) {
    setDraftBase(query);
    setSearchDraft(query);
  }
  const writeSearch = useDebouncedCallback(
    (value: string) => {
      // replace, not push — typing shouldn't spam the history stack.
      void navigate({
        to: '.',
        search: (prev) => ({ ...prev, q: value === '' ? undefined : value }),
        replace: true,
      });
    },
    { wait: SEARCH_DEBOUNCE_MS },
  );

  const filters: LogQuery = {};
  if (selectedServices.size > 0) filters.service_name = [...selectedServices];
  if (selectedLevels.size > 0) filters.level = [...selectedLevels];
  const trimmedQuery = query.trim();
  if (trimmedQuery !== '') filters.q = trimmedQuery;

  const metaQuery = useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => fetchMeta(signal),
    retry: false,
    refetchInterval: META_POLL_MS,
  });
  const tail = useLogTail(filters);
  const { failures } = tail;

  const meta = metaQuery.data ?? null;
  // Oldest→newest, straight from the tail buffer — the list renders
  // terminal-style with the newest row at the bottom.
  const logs = tail.logs;

  // Connectivity derived from the logs poll — no separate health ping.
  const conn: ConnectionState =
    failures === 0
      ? 'connected'
      : failures < OFFLINE_AFTER
        ? 'reconnecting'
        : 'offline';

  const retry = () => {
    void tail.refetch();
    void metaQuery.refetch();
  };

  const colorMap = buildServiceColorMap(meta?.services ?? []);
  const colorFor = (service: string): string =>
    colorMap.get(service) ?? 'var(--ls-fg-faint)';

  const levelStyleMap = buildLevelStyleMap(meta?.levels ?? []);
  const levelStyleFor = (level: string): LevelStyle =>
    levelStyleMap.get(level) ?? FALLBACK_LEVEL_STYLE;

  const toggle = (id: number): void => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Facet changes push history entries (back/forward steps through views).
  const toggleService = (service: string): void => {
    const next = joinSet(toggleInSet(selectedServices, service));
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, service: next }),
    });
  };
  const toggleLevel = (level: string): void => {
    const next = joinSet(toggleInSet(selectedLevels, level));
    void navigate({ to: '.', search: (prev) => ({ ...prev, level: next }) });
  };
  const clearServices = (): void => {
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, service: undefined }),
    });
  };
  const clearLevels = (): void => {
    void navigate({
      to: '.',
      search: (prev) => ({ ...prev, level: undefined }),
    });
  };

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar
        meta={meta}
        colorFor={colorFor}
        levelStyleFor={levelStyleFor}
        selectedServices={selectedServices}
        selectedLevels={selectedLevels}
        onToggleService={toggleService}
        onToggleLevel={toggleLevel}
        onClearServices={clearServices}
        onClearLevels={clearLevels}
        conn={conn}
        paused={tail.paused}
        onToggleTail={tail.toggleTail}
      />
      <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex h-[52px] flex-none items-center gap-3 border-b border-[var(--ls-border-soft)] px-5">
          <SidebarTrigger />
          <Topbar
            meta={meta}
            selectedServices={selectedServices}
            selectedLevels={selectedLevels}
            levelStyleFor={levelStyleFor}
          />
          <div className="ml-auto flex items-center gap-3">
            <EditionBadge />
            <ModeToggle />
          </div>
        </header>
        <ConnectionBanner conn={conn} onRetry={retry} />
        <LogList
          logs={logs}
          colorFor={colorFor}
          levelStyleFor={levelStyleFor}
          openIds={openIds}
          onToggle={toggle}
          pinned={tail.pinned}
          onPinnedChange={tail.setPinned}
          pendingCount={tail.pendingCount}
          detached={tail.detached}
          onJumpToLive={tail.jumpToLive}
          onLoadOlder={() => {
            void tail.loadOlder();
          }}
          onLoadNewer={() => {
            void tail.loadNewer();
          }}
        />
        <div className="flex-none border-t border-[var(--ls-border-soft)] px-5 pt-3 pb-4">
          <Input
            value={searchDraft}
            onChange={(event) => {
              setSearchDraft(event.target.value);
              writeSearch(event.target.value);
            }}
            placeholder="Search logs…"
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
