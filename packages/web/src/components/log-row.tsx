import { AttrStrip } from '@/components/attr-strip.tsx';
import { Badge } from '@/components/ui/badge.tsx';

import type { LogRow as LogRowData } from '@localsink/contract';

import { attrPairs } from '../lib/attributes.ts';
import type { LevelStyle } from '../lib/levels.ts';
import { activateOnKey } from '../lib/utils.ts';

// refined.css .r-row column track: disc | time | badge | service | message.
const COLS = 'grid-cols-[22px_104px_74px_132px_minmax(0,1fr)]';

const pad = (value: number, width = 2): string =>
  String(value).padStart(width, '0');

// Local wall-clock HH:MM:SS.mmm, matching the prototype's time column.
function formatTime(epochMs: number): string {
  const date = new Date(epochMs);
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())}:` +
    `${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

type LogRowProps = {
  log: LogRowData;
  serviceColor: string;
  levelStyle: LevelStyle;
  open: boolean;
  onToggle: () => void;
};

export function LogRow({
  log,
  serviceColor,
  levelStyle,
  open,
  onToggle,
}: LogRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      className={`group grid ${COLS} min-h-[33px] cursor-pointer items-center gap-[14px] rounded-[7px] px-3 py-[6px] font-mono text-[13px] hover:bg-[var(--ls-bg-hover)] data-[open=true]:bg-[var(--ls-bg-2)]`}
      data-open={open}
      onClick={onToggle}
      onKeyDown={activateOnKey(onToggle)}
    >
      <span className="text-center text-[var(--ls-fg-faint)] transition-transform group-data-[open=true]:rotate-90">
        ▸
      </span>
      <span className="text-[var(--ls-fg-faint)]">
        {formatTime(log.timestamp)}
      </span>
      <Badge
        variant="level"
        className="justify-self-start"
        style={{ background: levelStyle.background, color: levelStyle.color }}
      >
        {log.level}
      </Badge>
      <span className="flex min-w-0 items-center gap-2 overflow-hidden text-[var(--ls-fg-dim)]">
        <span
          className="size-[9px] shrink-0 rounded-full"
          style={{ background: serviceColor }}
        />
        <span className="min-w-0 truncate">{log.service_name}</span>
      </span>
      <AttrStrip message={log.message} pairs={attrPairs(log)} />
    </div>
  );
}
