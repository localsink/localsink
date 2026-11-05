import { once } from 'node:events';
import { createServer } from 'node:http';

/**
 * A stand-in for the licensing service's POST /v1/validate, over real HTTP on
 * loopback — the one non-HTTPS origin localsink accepts. It answers every
 * request with whatever `answer` currently holds and records each request
 * body, so a test can assert both what localsink sent and that it sent
 * nothing at all.
 */
export interface FakeLicensing {
  origin: string;
  /** Raw request bodies, oldest first. */
  requests: string[];
  answer: (body: unknown) => void;
  close: () => Promise<void>;
}

export async function startFakeLicensing(): Promise<FakeLicensing> {
  let answer: unknown = { valid: false, reason: 'not_found' };
  const requests: string[] = [];

  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      requests.push(body);
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(answer));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('The fake licensing service did not bind a port.');
  }

  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    requests,
    answer: (body) => {
      answer = body;
    },
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}
