import { Badge } from '@/components/ui/badge.tsx';

import type { LogRow as LogRowData } from '@localsink/contract';

// refined.css .r-row column track: disc | time | badge | service | message.
const COLS = 'grid-cols-[22px_104px_74px_132px_minmax(0,1fr)]';

// Map a free-form server level onto a Badge severity variant; unknown levels
// fall back to the neutral debug chip. A switch narrows each case to its
// literal so no type assertion is needed.
type LevelVariant = 'info' | 'warn' | 'error' | 'debug' | 'trace';
function levelVariant(level: string): LevelVariant {
  switch (level) {
    case 'info':
    case 'warn':
    case 'error':
    case 'trace':
      return level;
    default:
      return 'debug';
  }
}

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
  open: boolean;
  onToggle: () => void;
};

export function LogRow({ log, serviceColor, open, onToggle }: LogRowProps) {
  return (
    <div
      className={`group grid ${COLS} min-h-[33px] cursor-pointer items-center gap-[14px] rounded-[7px] px-3 py-[6px] font-mono text-[13px] hover:bg-[var(--ls-bg-hover)] data-[open=true]:bg-[var(--ls-bg-2)]`}
      data-open={open}
      onClick={onToggle}
    >
      <span className="text-center text-[var(--ls-fg-faint)] transition-transform group-data-[open=true]:rotate-90">
        ▸
      </span>
      <span className="text-[var(--ls-fg-faint)]">
        {formatTime(log.timestamp)}
      </span>
      <Badge variant={levelVariant(log.level)} className="justify-self-start">
        {log.level}
      </Badge>
      <span className="flex min-w-0 items-center gap-2 overflow-hidden text-[var(--ls-fg-dim)]">
        <span
          className="size-[9px] shrink-0 rounded-full"
          style={{ background: serviceColor }}
        />
        <span className="min-w-0 truncate">{log.service_name}</span>
      </span>
      <span className="relative flex min-w-0 items-center overflow-hidden">
        <span className="min-w-0 flex-[0_1_auto] truncate text-[var(--ls-fg)]">
          {log.message}
        </span>
      </span>
    </div>
  );
}
