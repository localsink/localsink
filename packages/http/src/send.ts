import type { IngestPayload } from './types.ts';

export function sendLog(
  endpoint: string,
  payload: IngestPayload,
): Promise<void> {
  try {
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })
      .then(() => undefined)
      .catch(() => undefined); // localsink being down must never affect the application
  } catch {
    // Serialization or other sync errors must also not affect the application
    return Promise.resolve();
  }
}
