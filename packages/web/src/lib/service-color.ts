// Assign each service a slot in the --ls-svc-* palette in first-seen order.
const PALETTE_SIZE = 6;

export function buildServiceColorMap(services: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const service of services) {
    if (!map.has(service)) {
      map.set(service, `var(--ls-svc-${(map.size % PALETTE_SIZE) + 1})`);
    }
  }
  return map;
}
