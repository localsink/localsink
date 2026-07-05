import { DetailBody } from '@/components/detail-body.tsx';
import { LogRow } from '@/components/log-row.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

import type { LogRow as LogRowData } from '@localsink/contract';

import type { LevelStyle } from '../lib/levels.ts';

// CSSProperties widened to carry the --lvlc custom property the detail border
// reads (refined.css .r-detail).
type StyleVars = CSSProperties & Record<`--${string}`, string>;

// How close to the bottom edge still counts as "at the bottom". A couple of
// px absorbs fractional scroll positions; anything larger would swallow a
// deliberate one-notch scroll up.
const AT_BOTTOM_EPSILON_PX = 4;

// How close to the top edge starts a history load, and how close to the
// bottom starts a forward refill while detached. Generous on purpose:
// firing a page early makes reaching either edge feel seamless.
const NEAR_TOP_PX = 60;
const NEAR_BOTTOM_PX = 60;

// Scroll anchors captured right before a window load fires: the first and
// last row's positions. After the rows change, whichever anchor row
// survived tells us how far the content around the viewport moved.
type ArmedAnchors = {
  firstId: string;
  firstTop: number;
  lastId: string;
  lastTop: number;
};

function measureAnchors(viewport: HTMLElement): ArmedAnchors | null {
  const firstEl = viewport.querySelector('[data-log-id]');
  if (!(firstEl instanceof HTMLElement)) return null;
  const lastEl = firstEl.parentElement?.lastElementChild;
  if (!(lastEl instanceof HTMLElement)) return null;
  return {
    firstId: firstEl.dataset['logId'] ?? '',
    firstTop: firstEl.offsetTop,
    lastId: lastEl.dataset['logId'] ?? '',
    lastTop: lastEl.offsetTop,
  };
}

type LogListProps = {
  // Oldest→newest; renders terminal-style with the newest row at the bottom.
  logs: LogRowData[];
  colorFor: (service: string) => string;
  levelStyleFor: (level: string) => LevelStyle;
  openIds: Set<number>;
  onToggle: (id: number) => void;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  // Arrivals held back while unpinned; > 0 shows the "↓ N new" jump pill.
  pendingCount: number;
  // Live edge evicted by deep history browsing; pill becomes "↓ live".
  detached: boolean;
  onJumpToLive: () => void;
  // Fired when the viewport nears the top — loads the next history page.
  onLoadOlder: () => void;
  // Fired when the viewport nears the bottom — refills while detached.
  onLoadNewer: () => void;
};

export function LogList({
  logs,
  colorFor,
  levelStyleFor,
  openIds,
  onToggle,
  pinned,
  onPinnedChange,
  pendingCount,
  detached,
  onJumpToLive,
  onLoadOlder,
  onLoadNewer,
}: LogListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Anchors armed by the scroll handler just before it requests a window
  // load; consumed (and cleared) by the layout effect below.
  const armedRef = useRef<ArmedAnchors | null>(null);
  // Rows identity from the previous layout pass: the unpin state change
  // re-renders before the loaded rows commit, and that no-op pass must not
  // consume the armed anchors.
  const prevLogsRef = useRef<LogRowData[] | null>(null);

  // Scrolling away from the bottom releases the pin ("don't yank them
  // down"); scrolling back to the bottom re-acquires it. Programmatic
  // re-pins land exactly at the bottom, so this is a no-op for them.
  // Nearing the top asks for older history; nearing the bottom asks for a
  // forward refill (both self-guarded upstream, so repeated firing while
  // the user hovers near an edge is cheap). Anchors are measured at the
  // moment a load is requested — the DOM can't change between the request
  // and the rows committing, so they can't go stale.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return undefined;
    const handleScroll = () => {
      const bottomGap =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      onPinnedChange(bottomGap <= AT_BOTTOM_EPSILON_PX);
      if (viewport.scrollTop <= NEAR_TOP_PX) {
        armedRef.current = measureAnchors(viewport);
        onLoadOlder();
      }
      if (bottomGap <= NEAR_BOTTOM_PX) {
        armedRef.current = measureAnchors(viewport);
        onLoadNewer();
      }
    };
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [onPinnedChange, onLoadOlder, onLoadNewer]);

  // While pinned, stay glued to the bottom as rows append. Otherwise, after
  // a window load commits, re-align the viewport so the reading position
  // holds: whichever armed anchor row survived the trim reports how far the
  // surrounding content moved (prepends push the last row down; top-trims
  // pull it up; the first row covers the bottom-trim case where the last
  // row was evicted). Native scroll anchoring is disabled on the viewport —
  // this layout effect (post-DOM, pre-paint) is the only compensator.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const rowsChanged = logs !== prevLogsRef.current;
    prevLogsRef.current = logs;
    if (pinned) {
      if (logs.length > 0) viewport.scrollTop = viewport.scrollHeight;
      armedRef.current = null;
      return;
    }
    if (!rowsChanged) return;
    const armed = armedRef.current;
    armedRef.current = null;
    if (armed === null) return;
    const lastEl = viewport.querySelector(`[data-log-id="${armed.lastId}"]`);
    const firstEl = viewport.querySelector(`[data-log-id="${armed.firstId}"]`);
    if (lastEl instanceof HTMLElement) {
      viewport.scrollTop += lastEl.offsetTop - armed.lastTop;
    } else if (firstEl instanceof HTMLElement) {
      viewport.scrollTop += firstEl.offsetTop - armed.firstTop;
    }
  }, [pinned, logs]);

  return (
    <div className="relative min-h-0 flex-1">
      <ScrollArea className="h-full" viewportRef={viewportRef}>
        <div className="px-2 py-1">
          {logs.length === 0 ? (
            <div className="p-6 font-mono text-[var(--ls-fg-faint)]">
              no logs match the current filters
            </div>
          ) : (
            logs.map((log) => {
              const open = openIds.has(log.id);
              const levelStyle = levelStyleFor(log.level);
              const detailStyle: StyleVars = { '--lvlc': levelStyle.color };
              return (
                // data-log-id doubles as the scroll-anchor handle.
                <div key={log.id} data-log-id={log.id}>
                  <LogRow
                    log={log}
                    serviceColor={colorFor(log.service_name)}
                    levelStyle={levelStyle}
                    open={open}
                    onToggle={() => {
                      onToggle(log.id);
                    }}
                  />
                  {open ? (
                    <div
                      className="mt-[2px] mr-[14px] mb-[10px] ml-[142px] rounded-r-[8px] border-l-2 border-l-[var(--lvlc,var(--ls-border))] bg-[var(--ls-bg-2)] px-[15px] py-[11px] font-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap text-[var(--ls-fg-dim)]"
                      style={detailStyle}
                    >
                      <div className="mb-[9px] border-b border-[var(--ls-border-soft)] pb-[9px] break-words whitespace-pre-wrap text-[var(--ls-fg)]">
                        {log.message}
                      </div>
                      <DetailBody log={log} />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      {pendingCount > 0 || detached ? (
        <button
          type="button"
          onClick={onJumpToLive}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-primary px-3.5 py-1 font-mono text-[11.5px] font-semibold text-primary-foreground shadow-md transition-[filter] hover:brightness-110"
        >
          {/* Detached: no honest count exists (arrivals aren't buffered),
              so the pill is just the way back to the live edge. */}
          {detached ? '↓ live' : `↓ ${String(pendingCount)} new`}
        </button>
      ) : null}
    </div>
  );
}
