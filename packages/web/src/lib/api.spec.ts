import { expect, test } from 'vitest';

import { sampleLogs } from '@localsink/contract/fixtures';

import { fetchLogs, fetchMeta } from './api.ts';

// These drive the real api client against the MSW pseudo-backend (handlers.ts),
// so they cover filter/search/pagination/meta end-to-end. Expectations are
// derived from sampleLogs so the specs survive dataset edits. fetchLogs/fetchMeta
// run the contract zod schema, so a passing parse also asserts wire conformance.

const expectedServices = [
  ...new Set(sampleLogs.map((log) => log.service_name)),
];
const expectedLevels = [...new Set(sampleLogs.map((log) => log.level))];

test('meta reports totals and the distinct facet values', async () => {
  const meta = await fetchMeta();

  expect(meta.total).toBe(sampleLogs.length);
  expect(meta.services).toEqual(expectedServices);
  expect(meta.levels).toEqual(expectedLevels);
});

test('logs come back newest-first (timestamp DESC, id DESC)', async () => {
  const page = await fetchLogs({ limit: 100 });

  const keys = page.data.map((row) => [row.timestamp, row.id] as const);
  const sorted = [...keys].toSorted((a, b) => b[0] - a[0] || b[1] - a[1]);
  expect(keys).toEqual(sorted);
});

test('service_name filters to that service', async () => {
  const page = await fetchLogs({ service_name: ['api'], limit: 100 });

  expect(page.data.length).toBeGreaterThan(0);
  expect(page.data.every((row) => row.service_name === 'api')).toBe(true);
  expect(page.data.length).toBe(
    sampleLogs.filter((log) => log.service_name === 'api').length,
  );
});

test('multiple service_name values are OR-ed within the group', async () => {
  const two = expectedServices.slice(0, 2);
  const set = new Set(two);
  const page = await fetchLogs({ service_name: two, limit: 100 });

  expect(page.data.every((row) => set.has(row.service_name))).toBe(true);
  expect(page.data.length).toBe(
    sampleLogs.filter((log) => set.has(log.service_name)).length,
  );
});

test('level filters to that severity', async () => {
  const page = await fetchLogs({ level: ['error'], limit: 100 });

  expect(page.data.every((row) => row.level === 'error')).toBe(true);
  expect(page.data.length).toBe(
    sampleLogs.filter((log) => log.level === 'error').length,
  );
});

test('q narrows results to matching rows', async () => {
  const page = await fetchLogs({ q: 'slow query', limit: 100 });

  expect(page.data.length).toBeGreaterThan(0);
  expect(page.data.length).toBeLessThan(sampleLogs.length);
  expect(page.data.some((row) => row.message.includes('slow query'))).toBe(
    true,
  );
});

test('limit pages with a cursor that yields a disjoint next page', async () => {
  const page1 = await fetchLogs({ limit: 10 });
  expect(page1.data.length).toBe(10);
  expect(page1.has_more).toBe(true);

  const cursor = page1.next_cursor;
  if (cursor === null) throw new Error('expected a next_cursor');

  const page2 = await fetchLogs({ limit: 10, cursor });
  const firstPageIds = new Set(page1.data.map((row) => row.id));
  expect(page2.data.some((row) => firstPageIds.has(row.id))).toBe(false);
});
