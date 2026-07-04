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
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { fetchLogs, fetchMeta } from './lib/api.ts';
import type { LogQuery } from './lib/api.ts';
import { buildLevelStyleMap } from './lib/levels.ts';
import type { LevelStyle } from './lib/levels.ts';
import { buildServiceColorMap } from './lib/service-color.ts';

const FALLBACK_LEVEL_STYLE: LevelStyle = {
  color: 'var(--ls-fg-faint)',
  background: 'var(--ls-bg-3)',
  rank: -1,
};

// Short-poll cadence; the ConnectionBanner copy ("retrying every 5s")
// describes this interval.
const POLL_MS = 5000;
// Consecutive failures before the banner escalates reconnecting → offline.
const OFFLINE_AFTER = 3;

function toggleInSet(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// Shell: query the backend and render the faceted sidebar + grid.
// Facet selection and search drive the query (OR within a group, AND across).
export default function App() {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(),
  );
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const filters = useMemo(() => {
    const params: LogQuery = {};
    if (selectedServices.size > 0) params.service_name = [...selectedServices];
    if (selectedLevels.size > 0) params.level = [...selectedLevels];
    const trimmed = query.trim();
    if (trimmed !== '') params.q = trimmed;
    return params;
  }, [selectedServices, selectedLevels, query]);

  // Consecutive failed log polls. Counted in the queryFn because TanStack's
  // failureCount resets at the start of every refetch (it only counts
  // retries within one fetch cycle), so it can't see failures *across* polls.
  const [failures, setFailures] = useState(0);

  // Both queries short-poll. retry: false — the 5s interval is already the
  // retry loop; internal retries would just delay the error surfacing.
  const metaQuery = useQuery({
    queryKey: ['meta'],
    queryFn: fetchMeta,
    retry: false,
    refetchInterval: POLL_MS,
  });
  // Logs re-fetch whenever the filters change (they're part of the query
  // key); the previous page stays visible while the new one loads, and the
  // last received page stays visible while the backend is unreachable.
  const logsQuery = useQuery({
    queryKey: ['logs', filters],
    queryFn: async () => {
      try {
        const page = await fetchLogs(filters);
        setFailures(0);
        return page;
      } catch (error) {
        setFailures((count) => count + 1);
        throw error;
      }
    },
    placeholderData: keepPreviousData,
    retry: false,
    refetchInterval: POLL_MS,
  });

  const meta = metaQuery.data ?? null;
  const logs = logsQuery.data?.data ?? [];

  // Connectivity derived from the logs poll — no separate health ping.
  const conn: ConnectionState =
    failures === 0
      ? 'connected'
      : failures < OFFLINE_AFTER
        ? 'reconnecting'
        : 'offline';

  const retry = () => {
    void logsQuery.refetch();
    void metaQuery.refetch();
  };

  const colorMap = useMemo(
    () => buildServiceColorMap(meta?.services ?? []),
    [meta],
  );
  const colorFor = useCallback(
    (service: string): string => colorMap.get(service) ?? 'var(--ls-fg-faint)',
    [colorMap],
  );

  const levelStyleMap = useMemo(
    () => buildLevelStyleMap(meta?.levels ?? []),
    [meta],
  );
  const levelStyleFor = useCallback(
    (level: string): LevelStyle =>
      levelStyleMap.get(level) ?? FALLBACK_LEVEL_STYLE,
    [levelStyleMap],
  );

  const toggle = useCallback((id: number): void => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleService = useCallback((service: string): void => {
    setSelectedServices((prev) => toggleInSet(prev, service));
  }, []);
  const toggleLevel = useCallback((level: string): void => {
    setSelectedLevels((prev) => toggleInSet(prev, level));
  }, []);
  const clearServices = useCallback(() => {
    setSelectedServices(new Set());
  }, []);
  const clearLevels = useCallback(() => {
    setSelectedLevels(new Set());
  }, []);

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
        />
        <div className="flex-none border-t border-[var(--ls-border-soft)] px-5 pt-3 pb-4">
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search logs…"
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
