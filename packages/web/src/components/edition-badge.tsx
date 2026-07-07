import { cn } from '../lib/utils.ts';

// EditionGlyph SVGs reused verbatim from the design handoff (option-refined.jsx,
// sanctioned reuse); only the knockout stroke token is retargeted to --ls-bg-2.
function EditionGlyph({ licensed }: { licensed: boolean }) {
  if (licensed) {
    return (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
        className="text-[var(--ls-accent)]"
      >
        <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z" />
        <path
          d="M9 12l2 2 4-4"
          fill="none"
          stroke="var(--ls-bg-2)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-80"
    >
      <circle cx="12" cy="7.5" r="2.7" />
      <path d="M7.5 18v-1a4.5 4.5 0 0 1 9 0v1" />
      <circle cx="4.6" cy="9" r="2.05" />
      <path d="M2 17.4v-.5a3.3 3.3 0 0 1 4-3.2" />
      <circle cx="19.4" cy="9" r="2.05" />
      <path d="M22 17.4v-.5a3.3 3.3 0 0 0-4-3.2" />
    </svg>
  );
}

type Edition = 'community' | 'licensed';

// Edition marker (refined.css .r-edition). Defaults to community — there is no
// licensing backend in v1.
export function EditionBadge({ edition = 'community' }: { edition?: Edition }) {
  const licensed = edition === 'licensed';
  const label = licensed ? 'Licensed' : 'Community Edition';
  return (
    <span
      title={label}
      className={cn(
        'flex flex-none items-center gap-[7px] font-mono text-[11px] tracking-[0.03em] whitespace-nowrap select-none',
        licensed
          ? 'text-[color-mix(in_oklch,var(--ls-accent),var(--ls-fg)_22%)]'
          : 'text-[var(--ls-fg-faint)]',
      )}
    >
      <EditionGlyph licensed={licensed} />
      <span>{label}</span>
    </span>
  );
}
