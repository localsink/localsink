import { DetailBody } from '@/components/detail-body.tsx';
import { LogRow } from '@/components/log-row.tsx';
import { ScrollArea } from '@/components/ui/scroll-area.tsx';
import { Fragment } from 'react';
import type { CSSProperties } from 'react';

import type { LogRow as LogRowData } from '@localsink/contract';

import type { LevelStyle } from '../lib/levels.ts';

// CSSProperties widened to carry the --lvlc custom property the detail border
// reads (refined.css .r-detail).
type StyleVars = CSSProperties & Record<`--${string}`, string>;

type LogListProps = {
  logs: LogRowData[];
  colorFor: (service: string) => string;
  levelStyleFor: (level: string) => LevelStyle;
  openIds: Set<number>;
  onToggle: (id: number) => void;
};

export function LogList({
  logs,
  colorFor,
  levelStyleFor,
  openIds,
  onToggle,
}: LogListProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
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
  );
}
