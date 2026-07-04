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

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

export async function fetchLogs(query: LogQuery = {}): Promise<LogPage> {
  const search = buildQuery(query);
  const body = await getJson(`/api/logs${search ? `?${search}` : ''}`);
  return logPageSchema.parse(body);
}

export async function fetchMeta(): Promise<LogMeta> {
  return logMetaSchema.parse(await getJson('/api/logs/meta'));
}
