import type { LogRow } from '@localsink/contract';

export type AttrPair = { key: string; value: string };

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  // JSON.stringify returns undefined for functions/symbols; keep the string
  // contract intact so the chip never renders a bare undefined.
  return JSON.stringify(value) ?? 'undefined';
}

// Flatten a log's attributes into key/value pairs for the chip strip.
export function attrPairs(log: LogRow): AttrPair[] {
  if (!log.attributes) return [];
  return Object.entries(log.attributes).map(([key, value]) => ({
    key,
    value: formatValue(value),
  }));
}
