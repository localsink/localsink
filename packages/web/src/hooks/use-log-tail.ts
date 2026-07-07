import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { LogRow } from '@localsink/contract';
import { encodeCursor } from '@localsink/contract';

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
//
// History is a *sliding window* over the stream: scrolling near the top
// prepends the previous keyset page (cursor API), and once the buffer
// exceeds MAX_ROWS the live edge is evicted from the bottom — the tail is
// then "detached". Scrolling back down refills forward (after_id pages,
// trimming the top) until it catches the live edge and re-attaches; the
// pill turns into a plain "↓ live" jump that re-seeds instead.
const POLL_MS = 1000;

// Bounded DOM: the window never holds more than MAX_ROWS (give or take one
// in-flight page). Which end gets trimmed depends on the direction the
// window is moving.
const MAX_ROWS = 1000;

type TailState = {
  filtersKey: string;
  rows: LogRow[];
  pending: LogRow[];
  watermark: number | null;
  // Keyset cursor pointing below the oldest buffered row — the seed page's
  // next_cursor, then each history page's. null = the beginning is loaded.
  olderCursor: string | null;
  // Live edge evicted by deep history browsing; loadNewer refills forward.
  detached: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
};

function freshState(filtersKey: string): TailState {
  return {
    filtersKey,
    rows: [],
    pending: [],
    watermark: null,
    olderCursor: null,
    detached: false,
    loadingOlder: false,
    loadingNewer: false,
  };
}

export function useLogTail(filters: LogQuery) {
  // Rows flow through React state (not the query result) because repinning
  // must flush the pending buffer synchronously, outside any fetch.
  const [rows, setRows] = useState<LogRow[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [detached, setDetachedState] = useState(false);

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

  const stateRef = useRef<TailState>(freshState(''));

  // Resets swap in a whole new state object; anything still in flight holds
  // the orphaned one. Every async path re-checks identity after awaiting
  // and bails if it lost — that's the entire concurrency story here.
  const resetState = (filtersKey: string) => {
    stateRef.current = freshState(filtersKey);
    pinnedRef.current = true;
    setPinnedState(true);
    setPendingCount(0);
    setDetachedState(false);
  };

  // Re-pinning (scroll-to-bottom or the pill) flushes pending arrivals into
  // the visible rows in the same tick.
  const setPinned = (next: boolean): void => {
    pinnedRef.current = next;
    setPinnedState(next);
    const state = stateRef.current;
    if (next && state.pending.length > 0) {
      state.rows = [...state.rows, ...state.pending].slice(-MAX_ROWS);
      state.pending = [];
      setRows(state.rows);
      setPendingCount(0);
    }
  };

  const query = useQuery({
    queryKey: ['logs', filters],
    queryFn: async ({ signal }) => {
      // New filters mean a new tail: reset, re-seed, and jump back to the
      // live edge — the old scroll position belongs to the old result set.
      // The old rows stay rendered until the seed below replaces them.
      const filtersKey = JSON.stringify(filters);
      if (stateRef.current.filtersKey !== filtersKey) {
        resetState(filtersKey);
      }
      const state = stateRef.current;
      try {
        if (state.watermark === null) {
          // Seed: the latest page arrives newest-first; store oldest→newest.
          // An empty database seeds watermark 0 so every future row matches.
          const page = await fetchLogs(filters, signal);
          if (stateRef.current !== state) return null;
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
            const page = await fetchLogs(
              { ...filters, after_id: state.watermark },
              signal,
            );
            if (stateRef.current !== state) return null;
            const last = page.data.at(-1);
            if (last !== undefined) {
              if (state.detached) {
                // The window is deep in history: the poll only proves
                // liveness and advances the watermark. The rows below get
                // refilled by loadNewer or a jump-to-live reseed.
              } else if (pinnedRef.current) {
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
        // An abort is supersession (filter change, unmount), not an outage —
        // it must not nudge the banner toward "reconnecting".
        if (!signal.aborted) setFailures((count) => count + 1);
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

  // History: prepend the page below the oldest buffered row. Fired from the
  // list when the viewport nears the top; self-guards against re-entry and
  // against the beginning of history. Exceeding MAX_ROWS slides the window:
  // the bottom (live edge) is evicted and the tail detaches.
  const loadOlder = async () => {
    const state = stateRef.current;
    if (state.loadingOlder || state.olderCursor === null) return;
    state.loadingOlder = true;
    try {
      const page = await fetchLogs({ ...filters, cursor: state.olderCursor });
      if (stateRef.current !== state) return;
      if (page.data.length > 0) {
        state.rows = [...page.data.toReversed(), ...state.rows];
        if (state.rows.length > MAX_ROWS) {
          state.rows = state.rows.slice(0, MAX_ROWS);
          state.pending = [];
          state.detached = true;
          setPendingCount(0);
          setDetachedState(true);
        }
        setRows(state.rows);
      }
      state.olderCursor = page.next_cursor;
    } catch {
      // Keep the cursor; the next near-top scroll retries.
    } finally {
      state.loadingOlder = false;
    }
  };

  // Forward refill while detached: fetch the after_id page above the
  // window's bottom edge, trimming the top to stay bounded. When a page
  // comes back non-truncated the window has caught the live edge — the
  // tail re-attaches and normal appends resume.
  const loadNewer = async () => {
    const state = stateRef.current;
    if (state.loadingNewer || !state.detached) return;
    const bottom = state.rows.at(-1);
    if (bottom === undefined) return;
    state.loadingNewer = true;
    try {
      const page = await fetchLogs({ ...filters, after_id: bottom.id });
      if (stateRef.current !== state) return;
      const lastId = state.rows.at(-1)?.id ?? -1;
      const fresh = page.data.filter((row) => row.id > lastId);
      if (fresh.length > 0) {
        state.rows = [...state.rows, ...fresh];
        if (state.rows.length > MAX_ROWS) {
          state.rows = state.rows.slice(-MAX_ROWS);
          // The old top rows are gone; re-point the history cursor just
          // below the new top so the next loadOlder stays gapless.
          const top = state.rows.at(0);
          if (top !== undefined) {
            state.olderCursor = encodeCursor(top);
          }
        }
        setRows(state.rows);
      }
      if (!page.has_more) {
        state.detached = false;
        setDetachedState(false);
        const last = state.rows.at(-1);
        if (
          last !== undefined &&
          (state.watermark === null || last.id > state.watermark)
        ) {
          state.watermark = last.id;
        }
      }
    } catch {
      // The next near-bottom scroll retries.
    } finally {
      state.loadingNewer = false;
    }
  };

  // The pill. Attached: flush pending and glue to the bottom. Detached:
  // flushing would splice rows onto a gap, so re-seed at the live edge
  // instead — same path as a filter change.
  const jumpToLive = () => {
    if (stateRef.current.detached) {
      resetState(stateRef.current.filtersKey);
      void query.refetch();
    } else {
      setPinned(true);
    }
  };

  return {
    logs: rows,
    pendingCount,
    detached,
    failures,
    refetch: query.refetch,
    pinned,
    setPinned,
    paused,
    toggleTail,
    loadOlder,
    loadNewer,
    jumpToLive,
  };
}
