import type { LogRow } from '@localsink/contract';

export type AttrPair = { key: string; value: string };

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Flatten a log's attributes into key/value pairs for the chip strip.
export function attrPairs(log: LogRow): AttrPair[] {
  if (!log.attributes) return [];
  return Object.entries(log.attributes).map(([key, value]) => ({
    key,
    value: formatValue(value),
  }));
}
