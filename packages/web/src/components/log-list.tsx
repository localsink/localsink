import { DetailBody } from '@/components/detail-body.tsx';
import { LogRow } from '@/components/log-row.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
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
  onJumpToLive: () => void;
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
  onJumpToLive,
}: LogListProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Scrolling away from the bottom releases the pin ("don't yank them
  // down"); scrolling back to the bottom re-acquires it. Programmatic
  // re-pins land exactly at the bottom, so this is a no-op for them.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return undefined;
    const handleScroll = () => {
      onPinnedChange(
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
          AT_BOTTOM_EPSILON_PX,
      );
    };
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [onPinnedChange]);

  // While pinned, stay glued to the bottom as rows append. Layout effect:
  // runs after the DOM update but before paint, so there's no flicker of
  // the pre-scroll position.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (pinned && viewport !== null && logs.length > 0) {
      viewport.scrollTop = viewport.scrollHeight;
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
                <Fragment key={log.id}>
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
                </Fragment>
              );
            })
          )}
        </div>
      </ScrollArea>
      {pendingCount > 0 ? (
        <button
          type="button"
          onClick={onJumpToLive}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-primary px-3.5 py-1 font-mono text-[11.5px] font-semibold text-primary-foreground shadow-md transition-[filter] hover:brightness-110"
        >
          ↓ {pendingCount} new
        </button>
      ) : null}
    </div>
  );
}
