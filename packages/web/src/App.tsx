import { AppSidebar } from '@/components/app-sidebar.tsx';
import { LogList } from '@/components/log-list.tsx';
import { ModeToggle } from '@/components/mode-toggle.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar.tsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { LogMeta, LogRow } from '@localsink/contract';

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

function toggleInSet(prev: Set<string>, key: string): Set<string> {
  const next = new Set(prev);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// Shell: fetch from the MSW backend and render the faceted sidebar + grid.
// Facet selection and search drive the query (OR within a group, AND across).
export default function App() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [meta, setMeta] = useState<LogMeta | null>(null);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    new Set(),
  );
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  // Shape-of-DB metadata (facet values) is fetched once.
  useEffect(() => {
    let active = true;
    async function loadMeta() {
      const result = await fetchMeta();
      if (active) setMeta(result);
    }
    void loadMeta();
    return () => {
      active = false;
    };
  }, []);

  // Logs re-fetch whenever the filters change; a flag drops stale responses.
  useEffect(() => {
    let active = true;
    async function loadLogs() {
      const params: LogQuery = {};
      if (selectedServices.size > 0)
        params.service_name = [...selectedServices];
      if (selectedLevels.size > 0) params.level = [...selectedLevels];
      const trimmed = query.trim();
      if (trimmed !== '') params.q = trimmed;
      const page = await fetchLogs(params);
      if (active) setLogs(page.data);
    }
    void loadLogs();
    return () => {
      active = false;
    };
  }, [selectedServices, selectedLevels, query]);

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
      />
      <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex h-[52px] flex-none items-center gap-3 border-b border-[var(--ls-border-soft)] px-5">
          <SidebarTrigger />
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </header>
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
