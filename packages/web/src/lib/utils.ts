import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import type { KeyboardEvent } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Keyboard parity for a `role="button"` div: fire the same action on
// Enter/Space (and swallow Space's default page scroll) so the terminal-styled
// rows stay operable without a mouse. Pair with `tabIndex={0}`.
export function activateOnKey(
  handler: () => void,
): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}
