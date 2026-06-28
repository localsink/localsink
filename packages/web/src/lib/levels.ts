// Levels are free-form (z.string(), stored raw on the server, surfaced via
// meta.levels). We recognize common severity synonyms across ecosystems and
// snap them onto the canonical palette; anything unrecognized is colored
// dynamically from a palette slot, exactly like services. The displayed label
// is ALWAYS the raw level string — never normalized.

export type Severity = 'trace' | 'debug' | 'info' | 'warn' | 'error';

// Higher = more severe; orders the severity facet list.
export const SEVERITY_RANK: Record<Severity, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

// Common level names → canonical severity (pino, winston npm + syslog, console).
const SYNONYMS: Record<string, Severity> = {
  trace: 'trace',
  silly: 'trace',
  debug: 'debug',
  fine: 'debug',
  verbose: 'debug',
  log: 'info',
  info: 'info',
  information: 'info',
  notice: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  err: 'error',
  fatal: 'error',
  crit: 'error',
  critical: 'error',
  alert: 'error',
  emerg: 'error',
  emergency: 'error',
  panic: 'error',
};

// Canonical severity for a raw level, or null when unrecognized.
export function matchSeverity(level: string): Severity | null {
  return SYNONYMS[level.toLowerCase()] ?? null;
}

export type LevelStyle = {
  color: string; // foreground (text + detail accent)
  background: string; // chip background
  rank: number; // facet ordering; unrecognized sort last (-1)
};

const PALETTE_SIZE = 6;

// Stable level → style map from the discovered level set, mirroring
// buildServiceColorMap. Recognized severities reuse their tuned --ls-* tokens;
// the rest get a palette slot (first-seen order) with a color-mixed chip.
export function buildLevelStyleMap(levels: string[]): Map<string, LevelStyle> {
  const map = new Map<string, LevelStyle>();
  let palette = 0;
  for (const level of levels) {
    if (map.has(level)) continue;
    const severity = matchSeverity(level);
    if (severity === null) {
      const color = `var(--ls-svc-${String((palette % PALETTE_SIZE) + 1)})`;
      palette += 1;
      map.set(level, {
        color,
        background: `color-mix(in oklch, ${color}, transparent 88%)`,
        rank: -1,
      });
    } else {
      map.set(level, {
        color: `var(--ls-${severity})`,
        background: `var(--ls-${severity}-bg)`,
        rank: SEVERITY_RANK[severity],
      });
    }
  }
  return map;
}
