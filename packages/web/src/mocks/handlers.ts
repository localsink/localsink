import { http, HttpResponse } from 'msw';

import type { LogMeta, LogPage, LogRow } from '@localsink/contract';
import { decodeCursor, encodeCursor } from '@localsink/contract';
import { sampleLogs } from '@localsink/contract/fixtures';

const DEFAULT_LIMIT = 50;

// Repeated or comma-separated params (matches the contract's multiValueFilter).
function multiValue(params: URLSearchParams, key: string): Set<string> {
  return new Set(
    params
      .getAll(key)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter((value) => value !== ''),
  );
}

// Substring stand-in for the server's SQLite FTS5 `q`. Good enough for dev/tests;
// the real query semantics live in the real backend, not here.
function searchBlob(log: LogRow): string {
  const parts = [log.service_name, log.level, log.message];
  if (log.error?.message) parts.push(log.error.message);
  if (log.error?.type) parts.push(log.error.type);
  if (log.error?.stack) parts.push(log.error.stack);
  if (log.attributes) {
    for (const [key, value] of Object.entries(log.attributes)) {
      parts.push(
        `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
      );
    }
  }
  return parts.join(' ').toLowerCase();
}

function applyFilters(params: URLSearchParams): LogRow[] {
  const services = multiValue(params, 'service_name');
  const levels = multiValue(params, 'level');
  const q = params.get('q')?.trim().toLowerCase() ?? '';
  const from = params.get('from');
  const to = params.get('to');

  return sampleLogs.filter((log) => {
    if (services.size > 0 && !services.has(log.service_name)) return false;
    if (levels.size > 0 && !levels.has(log.level)) return false;
    if (from !== null && log.timestamp < Number(from)) return false;
    if (to !== null && log.timestamp >= Number(to)) return false;
    if (q !== '' && !searchBlob(log).includes(q)) return false;
    return true;
  });
}

export const handlers = [
  http.get('/api/logs', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get('limit') ?? DEFAULT_LIMIT);

    // after_id mode (live tail): id ASC above the watermark, next_cursor
    // stays null — the client derives its next watermark from data.at(-1).id.
    const afterId = params.get('after_id');
    if (afterId !== null) {
      const matching = applyFilters(params)
        .filter((log) => log.id > Number(afterId))
        .toSorted((a, b) => a.id - b.id);
      const page: LogPage = {
        data: matching.slice(0, limit),
        next_cursor: null,
        has_more: matching.length > limit,
      };
      return HttpResponse.json(page);
    }

    // Newest first (timestamp DESC, id DESC), matching the real default order.
    const filtered = applyFilters(params).toSorted(
      (a, b) => b.timestamp - a.timestamp || b.id - a.id,
    );

    let start = 0;
    const cursorParam = params.get('cursor');
    if (cursorParam !== null) {
      const cursor = decodeCursor(cursorParam);
      const index = filtered.findIndex(
        (log) =>
          log.timestamp < cursor.timestamp ||
          (log.timestamp === cursor.timestamp && log.id < cursor.id),
      );
      start = index < 0 ? filtered.length : index;
    }
    const offset = params.get('offset');
    if (offset !== null) start = Number(offset);

    const paged = filtered.slice(start, start + limit + 1);
    const hasMore = paged.length > limit;
    const data = paged.slice(0, limit);
    const last = data.at(-1);

    const page: LogPage = {
      data,
      next_cursor: hasMore && last ? encodeCursor(last) : null,
      has_more: hasMore,
    };
    return HttpResponse.json(page);
  }),

  http.get('/api/logs/meta', () => {
    const timestamps = sampleLogs.map((log) => log.timestamp);
    const meta: LogMeta = {
      total: sampleLogs.length,
      services: [...new Set(sampleLogs.map((log) => log.service_name))],
      levels: [...new Set(sampleLogs.map((log) => log.level))],
      loggers: [
        ...new Set(
          sampleLogs
            .map((log) => log.logger)
            .filter((logger) => logger !== null),
        ),
      ],
      timestamp_range:
        timestamps.length > 0
          ? { min: Math.min(...timestamps), max: Math.max(...timestamps) }
          : null,
    };
    return HttpResponse.json(meta);
  }),

  http.get('/api/logs/:id', ({ params }) => {
    const id = Number(params['id']);
    const log = sampleLogs.find((entry) => entry.id === id);
    if (!log) {
      return HttpResponse.json(
        { error: `Log with ID ${String(id)} not found.` },
        { status: 404 },
      );
    }
    return HttpResponse.json(log);
  }),
];
