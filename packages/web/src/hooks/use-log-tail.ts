import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import type { LogRow } from '@localsink/contract';

import { fetchLogs } from '../lib/api.ts';
import type { LogQuery } from '../lib/api.ts';

// Live-tail buffer (docs/ui-requirements.md "Live tail vs. history"): the
// first fetch seeds the buffer with the latest page, then every poll asks
// only for rows above the id high-water mark (after_id, id ASC). While
// pinned to the bottom, arrivals append straight into the rows; while the
// user is scrolled up they collect in a pending buffer instead (polling
// never stops — connectivity is derived from it), surfaced as a count for
// the "↓ N new" pill and flushed when the user re-pins. A failed poll
// leaves the watermark untouched, so the next success naturally backfills
// whatever accumulated during the outage.
const POLL_MS = 1000;

// Bounded scrollback: drop-oldest beyond this cap. A few thousand plain grid
// rows render fine; the cap exists so an overnight tail doesn't grow the DOM
// forever. Rows only get trimmed while pinned — the pending buffer absorbs
// arrivals while the user is scrolled up, so their reading position never
// shifts.
const MAX_ROWS = 1000;

type TailState = {
  filtersKey: string;
  rows: LogRow[];
  pending: LogRow[];
  watermark: number | null;
  // Keyset cursor pointing below the oldest buffered row — the seed page's
  // next_cursor, then each history page's. null = the beginning is loaded.
  olderCursor: string | null;
  loadingOlder: boolean;
};

export function useLogTail(filters: LogQuery) {
  // Rows flow through React state (not the query result) because repinning
  // must flush the pending buffer synchronously, outside any fetch.
  const [rows, setRows] = useState<LogRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  // Consecutive failed polls, counted in the queryFn because TanStack's
  // failureCount resets at the start of every refetch — it can't see
  // failures *across* polls.
  const [failures, setFailures] = useState(0);

  // Whether the list should stay glued to the live edge. State for
  // rendering, mirrored into a ref so an in-flight poll can't act on a
  // stale value captured when it started.
  const [pinned, setPinnedState] = useState(true);
  const pinnedRef = useRef(true);

  // The explicit tail toggle (sidebar footer). Unlike the scroll-up
  // auto-pause — which keeps polling and buffers arrivals — pausing stops
  // the poll schedule entirely ("tail off: don't poll"). While paused,
  // connectivity is frozen at its last known value.
  const [paused, setPaused] = useState(false);

  const stateRef = useRef<TailState>({
    filtersKey: '',
    rows: [],
    pending: [],
    watermark: null,
    olderCursor: null,
    loadingOlder: false,
  });

  // Re-pinning (scroll-to-bottom or the pill) flushes pending arrivals into
  // the visible rows in the same tick.
  const setPinned = useCallback((next: boolean) => {
    pinnedRef.current = next;
    setPinnedState(next);
    const state = stateRef.current;
    if (next && state.pending.length > 0) {
      state.rows = [...state.rows, ...state.pending].slice(-MAX_ROWS);
      state.pending = [];
      setRows(state.rows);
      setPendingCount(0);
    }
  }, []);

  const query = useQuery({
    queryKey: ['logs', filters],
    queryFn: async () => {
      // New filters mean a new tail: reset, re-seed, and jump back to the
      // live edge — the old scroll position belongs to the old result set.
      // The old rows stay rendered until the seed below replaces them.
      const filtersKey = JSON.stringify(filters);
      if (stateRef.current.filtersKey !== filtersKey) {
        stateRef.current = {
          filtersKey,
          rows: [],
          pending: [],
          watermark: null,
          olderCursor: null,
          loadingOlder: false,
        };
        pinnedRef.current = true;
        setPinnedState(true);
        setPendingCount(0);
      }
      const state = stateRef.current;
      try {
        if (state.watermark === null) {
          // Seed: the latest page arrives newest-first; store oldest→newest.
          // An empty database seeds watermark 0 so every future row matches.
          const page = await fetchLogs(filters);
          state.rows = page.data.toReversed();
          state.watermark = state.rows.at(-1)?.id ?? 0;
          state.olderCursor = page.next_cursor;
          setRows(state.rows);
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
              if (pinnedRef.current) {
                state.rows = [...state.rows, ...page.data].slice(-MAX_ROWS);
                setRows(state.rows);
              } else {
                state.pending = [...state.pending, ...page.data].slice(
                  -MAX_ROWS,
                );
                setPendingCount(state.pending.length);
              }
              state.watermark = last.id;
            }
            hasMore = page.has_more;
          }
        }
        setFailures(0);
        // The buffers above are the real output; the query result is unused.
        return null;
      } catch (error) {
        setFailures((count) => count + 1);
        throw error;
      }
    },
    // The poll interval is already the retry loop.
    retry: false,
    refetchInterval: paused ? false : POLL_MS,
  });

  // Resuming refetches immediately — the watermark hasn't moved, so one
  // poll (with its has_more catch-up loop) drains everything that arrived
  // while paused. Pausing just stops the schedule.
  const toggleTail = () => {
    if (paused) void query.refetch();
    setPaused(!paused);
  };

  // History: prepend the page below the oldest buffered row (the existing
  // keyset cursor API). Fired from the list when the viewport nears the
  // top; self-guards against re-entry and against the beginning of history.
  // Terminal-scrollback semantics bound the DOM: once the buffer holds
  // MAX_ROWS, history stops loading (may overshoot by one page) — beyond
  // the scrollback you filter or search, not scroll. Trimming the far end
  // instead would evict the live edge and leave a gap on the way back down.
  const loadOlder = async () => {
    const state = stateRef.current;
    if (state.loadingOlder || state.olderCursor === null) return;
    if (state.rows.length >= MAX_ROWS) return;
    state.loadingOlder = true;
    try {
      const page = await fetchLogs({ ...filters, cursor: state.olderCursor });
      state.rows = [...page.data.toReversed(), ...state.rows];
      state.olderCursor = page.next_cursor;
      setRows(state.rows);
    } catch {
      // Keep the cursor; the next near-top scroll retries.
    } finally {
      state.loadingOlder = false;
    }
  };

  return {
    logs: rows,
    pendingCount,
    failures,
    refetch: query.refetch,
    pinned,
    setPinned,
    paused,
    toggleTail,
    loadOlder,
  };
}
