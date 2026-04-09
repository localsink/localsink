import type { IngestPayload } from './types.js';

export function sendLog(endpoint: string, payload: IngestPayload): void {
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {
    // localsink being down must never affect the application
  });
}
