import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar.tsx';
import { CheckIcon } from 'lucide-react';

import type { LogMeta } from '@localsink/contract';

import type { LevelStyle } from '../lib/levels.ts';
import { cn } from '../lib/utils.ts';

const FAINT = 'var(--ls-fg-faint)';

// Connection status dot — uses the semantic --ls-ok green (independent of the
// brand accent) with the radiating ls-pulse ring.
function PulseDot() {
  return (
    <span className="size-[9px] shrink-0 animate-ls-pulse rounded-full bg-[var(--ls-ok)] [--ls-status:var(--ls-ok)]" />
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
      className={cn(
        'relative mb-[2px] flex cursor-pointer items-center gap-[9px] overflow-hidden rounded-[8px] px-[10px] py-[7px] text-[13px]',
        active
          ? 'text-[var(--ls-fg)]'
          : 'text-[var(--ls-fg-dim)] hover:text-[var(--ls-fg)]',
      )}
      onClick={onClick}
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
}: AppSidebarProps) {
  const services = meta?.services ?? [];
  // Severity facets ordered most-severe first; unrecognized levels (rank -1)
  // fall to the bottom.
  const levels = (meta?.levels ?? []).toSorted(
    (a, b) => levelStyleFor(b).rank - levelStyleFor(a).rank,
  );

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="flex-row items-center gap-[9px] px-4 pt-[17px] pb-[15px]">
        <PulseDot />
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

      <SidebarFooter className="flex-row items-center gap-[9px] border-t border-[var(--ls-border-soft)] px-[18px] py-[13px] font-mono text-[12px] text-[var(--ls-fg-dim)]">
        <span>live tail</span>
        <span className="ml-auto flex items-center gap-[7px] text-[var(--ls-ok)]">
          <PulseDot />
          tailing
        </span>
      </SidebarFooter>
    </Sidebar>
  );
}
