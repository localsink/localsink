import type { LogMeta } from '@localsink/contract';

import type { LevelStyle } from '../lib/levels.ts';

// Breadcrumb summary of the active facets (refined.css .r-bc). Mirrors the
// prototype's summarizeFacet: all / a, b / a, b +N, preserving facet order.
function summarizeFacet(selected: Set<string>, order: string[]): string {
  if (selected.size === 0) return 'all';
  const items = order.filter((value) => selected.has(value));
  if (items.length <= 2) return items.join(', ');
  return `${items.slice(0, 2).join(', ')} +${String(items.length - 2)}`;
}

type TopbarProps = {
  meta: LogMeta | null;
  selectedServices: Set<string>;
  selectedLevels: Set<string>;
  levelStyleFor: (level: string) => LevelStyle;
};

export function Topbar({
  meta,
  selectedServices,
  selectedLevels,
  levelStyleFor,
}: TopbarProps) {
  const services = meta?.services ?? [];
  const levels = meta?.levels ?? [];
  // A single selected level tints its summary with the level color.
  const singleLevel =
    selectedLevels.size === 1 ? ([...selectedLevels][0] ?? null) : null;

  return (
    <span className="flex min-w-0 items-center gap-2 truncate font-mono text-[13.5px] text-[var(--ls-fg)]">
      <span className="text-[var(--ls-fg-faint)]">service:</span>
      <span>{summarizeFacet(selectedServices, services)}</span>
      {selectedLevels.size > 0 ? (
        <>
          <span className="text-[var(--ls-fg-faint)]">›</span>
          <span
            style={
              singleLevel
                ? { color: levelStyleFor(singleLevel).color }
                : undefined
            }
          >
            {summarizeFacet(selectedLevels, levels)}
          </span>
        </>
      ) : null}
    </span>
  );
}
