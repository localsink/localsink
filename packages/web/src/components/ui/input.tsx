import { cn } from '@/lib/utils.ts';
import { Input as InputPrimitive } from '@base-ui/react/input';
import type { ComponentProps } from 'react';

// Restyled to the handoff search bar (styles.css .ls-search): 42px tall,
// --ls-bg-2 surface, 9px radius, Geist Mono 13.5px, faint placeholder, accent
// focus ring at ~18%. This is the app's only input, so the look lives here.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-[42px] w-full min-w-0 rounded-[9px] border border-input bg-[var(--ls-bg-2)] px-[14px] py-0 font-mono text-[13.5px] text-foreground transition-colors outline-none placeholder:text-[var(--ls-fg-faint)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
