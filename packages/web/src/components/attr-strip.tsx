import { Badge } from '@/components/ui/badge.tsx';

import type { AttrPair } from '../lib/attributes.ts';

// Message cell (refined.css .r-msgcell): the message takes priority; up to
// MAX_CHIPS attribute chips fill the remainder and a +N counter shows the rest.
// The attrs group carries a huge flex-shrink so it yields to the message, and
// chips truncate their own text — no layout measurement needed.

const MAX_CHIPS = 3;

function Chip({ pair }: { pair: AttrPair }) {
  return (
    <span className="min-w-0 max-w-[168px] truncate rounded-[5px] bg-[var(--ls-bg-3)] px-[7px] py-[2px] font-mono text-[10.5px] leading-[1.45] text-[var(--ls-fg-faint)]">
      {pair.key}=
      <b className="font-medium text-[var(--ls-fg-dim)]">{pair.value}</b>
    </span>
  );
}

type AttrStripProps = { message: string; pairs: AttrPair[] };

export function AttrStrip({ message, pairs }: AttrStripProps) {
  const shown = pairs.slice(0, MAX_CHIPS);
  const hidden = pairs.length - shown.length;

  return (
    <span className="relative flex min-w-0 items-center overflow-hidden">
      <span className="min-w-0 flex-[0_1_auto] truncate text-[var(--ls-fg)]">
        {message}
      </span>
      {pairs.length > 0 ? (
        <span className="ml-auto flex min-w-0 shrink-[9999] items-center gap-[6px] pl-[16px]">
          <span className="flex min-w-0 items-center gap-[5px] overflow-hidden">
            {/* Attribute keys are object keys, so they're unique per row. */}
            {shown.map((pair) => (
              <Chip key={pair.key} pair={pair} />
            ))}
          </span>
          {hidden > 0 ? (
            <Badge variant="counter" className="flex-none">
              +{hidden}
            </Badge>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
