import { cn } from '@/lib/utils.ts';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';

// Shared shape for the severity level chips (refined.css .r-badge): mono,
// uppercase, 10.5px/600, 2px 7px padding, 5px radius. These deliberately
// override the base cva classes — Badge wraps the whole cva output in cn()
// (tailwind-merge), so the later variant classes win over the base ones.
const levelChip =
  'h-auto rounded-[5px] px-[7px] py-[2px] font-mono text-[10.5px] leading-[1.45] font-semibold tracking-[0.04em] uppercase';

// Shared shape for the AttrStrip chips (refined.css .r-chip / .r-chip-more):
// same dims as the level chip but normal weight, no uppercase.
const attrChip =
  'h-auto rounded-[5px] px-[7px] py-[2px] font-mono text-[10.5px] leading-[1.45] font-medium normal-case tracking-normal';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary:
          'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost:
          'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
        info: `${levelChip} bg-[var(--ls-info-bg)] text-info`,
        warn: `${levelChip} bg-[var(--ls-warn-bg)] text-warn`,
        error: `${levelChip} bg-[var(--ls-error-bg)] text-error`,
        debug: `${levelChip} bg-[var(--ls-debug-bg)] text-debug`,
        trace: `${levelChip} bg-[var(--ls-trace-bg)] text-trace`,
        // Dynamic severity chip — shape only; color supplied via inline style
        // from buildLevelStyleMap (levels are discovered, not fixed).
        level: levelChip,
        // Attribute chip — grey: bg-3 surface, faint text.
        chip: `${attrChip} bg-[var(--ls-bg-3)] text-[var(--ls-fg-faint)]`,
        // +N overflow counter — accent green (color-mixed off --ls-accent).
        counter: `${attrChip} border-[color-mix(in_oklch,var(--ls-accent),transparent_70%)] bg-[color-mix(in_oklch,var(--ls-accent),transparent_88%)] text-[color-mix(in_oklch,var(--ls-accent),var(--ls-fg)_25%)]`,
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  });
}

export { Badge, badgeVariants };
