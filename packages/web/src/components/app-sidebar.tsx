import type { ConnectionState } from '@/components/connection-banner.tsx';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar.tsx';
import { CheckIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

import type { LogMeta } from '@localsink/contract';

import type { LevelStyle } from '../lib/levels.ts';
import { activateOnKey, cn } from '../lib/utils.ts';

const FAINT = 'var(--ls-fg-faint)';

// CSSProperties widened for the --ls-status custom property the pulse reads.
type StyleVars = CSSProperties & Record<`--${string}`, string>;

// Pulse cadence (refined.css .ls-dot): connected slow, reconnecting fast,
// offline static.
type Pulse = 'slow' | 'fast' | 'none';
const PULSE_CLASS: Record<Pulse, string> = {
  slow: 'animate-ls-pulse',
  fast: 'animate-ls-pulse-fast',
  none: '',
};

// Connection status → dot color (semantic, independent of the brand accent),
// footer label, and pulse cadence.
const CONN_STATUS: Record<
  ConnectionState,
  { color: string; label: string; pulse: Pulse }
> = {
  connected: { color: 'var(--ls-ok)', label: 'tailing', pulse: 'slow' },
  reconnecting: {
    color: 'var(--ls-warn)',
    label: 'reconnecting…',
    pulse: 'fast',
  },
  offline: { color: 'var(--ls-error)', label: 'offline', pulse: 'none' },
};

// Status dot with the radiating ls-pulse ring (refined.css .ls-dot).
function StatusDot({ color, pulse }: { color: string; pulse: Pulse }) {
  const style: StyleVars = { background: color, '--ls-status': color };
  return (
    <span
      className={cn('size-[9px] shrink-0 rounded-full', PULSE_CLASS[pulse])}
      style={style}
    />
  );
}

// Visual facet checkbox (refined.css .r-check) — not an interactive control;
// the whole facet row handles the click. A spacer keeps the "all" row aligned.
function FacetCheck({ active, spacer }: { active: boolean; spacer?: boolean }) {
  if (spacer) {
    return (
      <span className="size-[14px] shrink-0 rounded-[4px] border-[1.5px] border-transparent" />
    );
  }
  return (
    <span
      className={cn(
        'flex size-[14px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors',
        active
          ? 'border-[var(--ls-accent)] bg-[var(--ls-accent)] text-[var(--ls-bg-2)]'
          : 'border-[var(--ls-border)]',
      )}
    >
      {active ? <CheckIcon strokeWidth={3} className="size-2.5" /> : null}
    </span>
  );
}

function FacetRow({
  active,
  dotColor,
  name,
  nameColor,
  spacer = false,
  onClick,
}: {
  active: boolean;
  dotColor: string;
  name: string;
  nameColor?: string;
  spacer?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={cn(
        'relative mb-[2px] flex cursor-pointer items-center gap-[9px] overflow-hidden rounded-[8px] px-[10px] py-[7px] text-[13px]',
        active
          ? 'text-[var(--ls-fg)]'
          : 'text-[var(--ls-fg-dim)] hover:text-[var(--ls-fg)]',
      )}
      onClick={onClick}
      onKeyDown={activateOnKey(onClick)}
    >
      {active ? (
        <span className="absolute top-[6px] bottom-[6px] left-0 w-[2px] rounded-[2px] bg-[var(--ls-accent)]" />
      ) : null}
      <FacetCheck active={active} spacer={spacer} />
      <span
        className="size-[9px] shrink-0 rounded-full"
        style={{ background: dotColor }}
      />
      <span
        className="min-w-0 flex-[0_1_auto] truncate font-mono"
        style={nameColor ? { color: nameColor } : undefined}
      >
        {name}
      </span>
    </div>
  );
}

// Group label only — clearing a group is the "all" row's job, so there is no
// separate clear button.
function GroupLabel({ label }: { label: string }) {
  return (
    <span className="block px-[6px] pt-[14px] pb-[8px] font-mono text-[10.5px] tracking-[0.14em] text-[var(--ls-fg-faint)] uppercase">
      {label}
    </span>
  );
}

type AppSidebarProps = {
  meta: LogMeta | null;
  colorFor: (service: string) => string;
  levelStyleFor: (level: string) => LevelStyle;
  selectedServices: Set<string>;
  selectedLevels: Set<string>;
  onToggleService: (service: string) => void;
  onToggleLevel: (level: string) => void;
  onClearServices: () => void;
  onClearLevels: () => void;
  conn: ConnectionState;
  paused: boolean;
  onToggleTail: () => void;
};

export function AppSidebar({
  meta,
  colorFor,
  levelStyleFor,
  selectedServices,
  selectedLevels,
  onToggleService,
  onToggleLevel,
  onClearServices,
  onClearLevels,
  conn,
  paused,
  onToggleTail,
}: AppSidebarProps) {
  const status = CONN_STATUS[conn];
  const connected = conn === 'connected';
  const live = connected && !paused;
  const services = meta?.services ?? [];
  // Severity facets ordered most-severe first; unrecognized levels (rank -1)
  // fall to the bottom.
  const levels = (meta?.levels ?? []).toSorted(
    (a, b) => levelStyleFor(b).rank - levelStyleFor(a).rank,
  );

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="flex-row items-center gap-[9px] px-4 pt-[17px] pb-[15px]">
        <StatusDot color={status.color} pulse={status.pulse} />
        <span className="font-mono text-[16px] font-semibold">localsink</span>
      </SidebarHeader>

      <SidebarContent className="px-3 py-0.5">
        <div>
          <GroupLabel label="Service" />
          <FacetRow
            active={selectedServices.size === 0}
            dotColor={FAINT}
            name="all"
            spacer
            onClick={onClearServices}
          />
          {services.map((service) => (
            <FacetRow
              key={service}
              active={selectedServices.has(service)}
              dotColor={colorFor(service)}
              name={service}
              onClick={() => {
                onToggleService(service);
              }}
            />
          ))}
        </div>

        <div>
          <GroupLabel label="Severity" />
          <FacetRow
            active={selectedLevels.size === 0}
            dotColor={FAINT}
            name="all"
            spacer
            onClick={onClearLevels}
          />
          {levels.map((level) => {
            const { color } = levelStyleFor(level);
            return (
              <FacetRow
                key={level}
                active={selectedLevels.has(level)}
                dotColor={color}
                name={level}
                nameColor={color}
                onClick={() => {
                  onToggleLevel(level);
                }}
              />
            );
          })}
        </div>
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'flex-row items-center gap-[9px] border-t border-[var(--ls-border-soft)] px-[18px] py-[13px] font-mono text-[12px] text-[var(--ls-fg-dim)]',
          connected && 'cursor-pointer hover:bg-[var(--ls-bg-hover)]',
        )}
        // Only a control while connected; otherwise it's inert text, so it
        // stays out of the tab order and off the a11y tree as a button.
        role={connected ? 'button' : undefined}
        tabIndex={connected ? 0 : undefined}
        aria-pressed={connected ? !paused : undefined}
        title={connected ? 'Toggle live tail' : undefined}
        onClick={() => {
          if (connected) onToggleTail();
        }}
        onKeyDown={connected ? activateOnKey(onToggleTail) : undefined}
      >
        {/* "{n} logs" here belongs to the counts feature (Beyond MVP, off
            by default) — until then the label is static and faint. */}
        <span className="text-[var(--ls-fg-faint)]">live tail</span>
        <span
          className="ml-auto flex items-center gap-[7px]"
          style={{ color: connected && paused ? FAINT : status.color }}
        >
          {conn === 'offline' ? null : (
            // Paused mutes the whole tail state: faint static dot, no pulse
            // (the pulse reads as "live"). The header dot keeps showing raw
            // connectivity.
            <StatusDot
              color={connected && paused ? FAINT : status.color}
              pulse={connected && paused ? 'none' : status.pulse}
            />
          )}
          {live ? 'tailing' : connected ? '▸ paused' : status.label}
        </span>
      </SidebarFooter>
    </Sidebar>
  );
}
