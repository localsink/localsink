import type { LogRow } from '@localsink/contract';

function formatValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Flatten a log's attributes into `key=value` strings for the chip strip.
export function attrPairs(log: LogRow): string[] {
  if (!log.attributes) return [];
  return Object.entries(log.attributes).map(
    ([key, value]) => `${key}=${formatValue(value)}`,
  );
}
