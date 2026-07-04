import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { LogRow } from '@localsink/contract';

import { fetchLogs } from '../lib/api.ts';
import type { LogQuery } from '../lib/api.ts';

// Live-tail buffer (docs/ui-requirements.md "Live tail vs. history"): the
// first fetch seeds the buffer with the latest page, then every poll asks
// only for rows above the id high-water mark (after_id, id ASC) and appends.
// A failed poll leaves the watermark untouched, so the next success
// naturally backfills whatever accumulated during the outage.
const POLL_MS = 1000;

// Bounded scrollback: drop-oldest beyond this cap. A few thousand plain grid
// rows render fine; the cap exists so an overnight tail doesn't grow the DOM
// forever.
const MAX_ROWS = 1000;

type TailState = {
  filtersKey: string;
  rows: LogRow[];
  watermark: number | null;
};

export function useLogTail(filters: LogQuery) {
  // Consecutive failed polls, counted in the queryFn because TanStack's
  // failureCount resets at the start of every refetch — it can't see
  // failures *across* polls.
  const [failures, setFailures] = useState(0);

  // Whether the list should stay glued to the live edge. Owned here rather
  // than by the list because the tail itself will react to it (arrivals get
  // held back while unpinned — the "↓ N new" behavior).
  const [pinned, setPinned] = useState(true);

  // The buffer lives in a ref, not query data: successive polls *accumulate*
  // into it, while TanStack only ever sees the latest snapshot returned from
  // the queryFn.
  const stateRef = useRef<TailState>({
    filtersKey: '',
    rows: [],
    watermark: null,
  });

  const query = useQuery({
    queryKey: ['logs', filters],
    queryFn: async () => {
      // New filters mean a new tail: reset, re-seed, and jump back to the
      // live edge — the old scroll position belongs to the old result set.
      const filtersKey = JSON.stringify(filters);
      if (stateRef.current.filtersKey !== filtersKey) {
        stateRef.current = { filtersKey, rows: [], watermark: null };
        setPinned(true);
      }
      const state = stateRef.current;
      try {
        if (state.watermark === null) {
          // Seed: the latest page arrives newest-first; store oldest→newest.
          // An empty database seeds watermark 0 so every future row matches.
          const page = await fetchLogs(filters);
          state.rows = page.data.toReversed();
          state.watermark = state.rows.at(-1)?.id ?? 0;
        } else {
          // Tail: drain everything above the watermark. has_more means the
          // response was truncated by limit — re-fetch immediately instead
          // of waiting a tick, so the tail catches up after a gap.
          let hasMore = true;
          while (hasMore) {
            const page = await fetchLogs({
              ...filters,
              after_id: state.watermark,
            });
            const last = page.data.at(-1);
            if (last !== undefined) {
              state.rows = [...state.rows, ...page.data].slice(-MAX_ROWS);
              state.watermark = last.id;
            }
            hasMore = page.has_more;
          }
        }
        setFailures(0);
        return state.rows;
      } catch (error) {
        setFailures((count) => count + 1);
        throw error;
      }
    },
    // The previous buffer stays visible while a filter change re-seeds.
    placeholderData: keepPreviousData,
    // The poll interval is already the retry loop.
    retry: false,
    refetchInterval: POLL_MS,
  });

  return {
    logs: query.data ?? [],
    failures,
    refetch: query.refetch,
    pinned,
    setPinned,
  };
}
