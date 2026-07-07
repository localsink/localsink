import type { CSSProperties } from 'react';

import { cn } from '../lib/utils.ts';

// CSSProperties widened for the --status custom property the Retry hover reads.
type StyleVars = CSSProperties & Record<`--${string}`, string>;

export type ConnectionState = 'connected' | 'reconnecting' | 'offline';

// Slim strip shown below the topbar only when not connected (refined.css
// .r-connbar); the log list stays visible beneath it.
const STATE = {
  reconnecting: {
    color: 'var(--ls-warn)',
    background: 'var(--ls-warn-bg)',
    message: 'Reconnecting to the localsink backend…',
    meta: 'retrying…',
    // Matches the sidebar's reconnecting cadence.
    pulseClass: 'animate-ls-pulse-fast',
  },
  offline: {
    color: 'var(--ls-error)',
    background: 'var(--ls-error-bg)',
    message: "Can't reach the localsink backend.",
    meta: 'showing last received logs · retrying every second',
    pulseClass: '',
  },
};

type ConnectionBannerProps = {
  conn: ConnectionState;
  onRetry?: () => void;
};

export function ConnectionBanner({ conn, onRetry }: ConnectionBannerProps) {
  if (conn === 'connected') return null;
  const state = STATE[conn];
  const dotStyle: StyleVars = {
    background: state.color,
    '--ls-status': state.color,
  };
  const actionStyle: StyleVars = { '--status': state.color };

  return (
    <div
      className="flex flex-none items-center gap-[11px] border-b border-l-2 border-b-[var(--ls-border-soft)] px-5 py-[9px] font-mono text-[12.5px]"
      style={{ borderLeftColor: state.color, background: state.background }}
    >
      <span
        className={cn('size-[8px] shrink-0 rounded-full', state.pulseClass)}
        style={dotStyle}
      />
      <span className="font-medium whitespace-nowrap text-[var(--ls-fg)]">
        {state.message}
      </span>
      <span className="min-w-0 truncate whitespace-nowrap text-[var(--ls-fg-faint)]">
        {state.meta}
      </span>
      <button
        type="button"
        onClick={onRetry}
        style={actionStyle}
        className="ml-auto flex-none cursor-pointer rounded-[7px] border border-[var(--ls-border)] bg-[var(--ls-bg-2)] px-[12px] py-[5px] font-mono text-[12px] whitespace-nowrap text-[var(--ls-fg)] hover:border-[var(--status)] hover:text-[var(--status)]"
      >
        Retry now
      </button>
    </div>
  );
}
