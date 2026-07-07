import { logMetaSchema, logPageSchema } from '@localsink/contract';
import type { LogMeta, LogPage } from '@localsink/contract';

export type LogQuery = {
  service_name?: string[];
  level?: string[];
  q?: string;
  limit?: number;
  cursor?: string;
  after_id?: number;
};

function buildQuery(query: LogQuery): string {
  const params = new URLSearchParams();
  for (const service of query.service_name ?? []) {
    params.append('service_name', service);
  }
  for (const level of query.level ?? []) {
    params.append('level', level);
  }
  if (query.q) params.set('q', query.q);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.after_id !== undefined) {
    params.set('after_id', String(query.after_id));
  }
  return params.toString();
}

// signal comes from TanStack Query's queryFn context so superseded fetches
// (filter change, unmount) abort at the network layer instead of racing on.
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal: signal ?? null });
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

export async function fetchLogs(
  query: LogQuery = {},
  signal?: AbortSignal,
): Promise<LogPage> {
  const search = buildQuery(query);
  const body = await getJson(`/api/logs${search ? `?${search}` : ''}`, signal);
  return logPageSchema.parse(body);
}

export async function fetchMeta(signal?: AbortSignal): Promise<LogMeta> {
  return logMetaSchema.parse(await getJson('/api/logs/meta', signal));
}
