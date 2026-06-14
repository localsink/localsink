# @localsink/http

Low-level HTTP primitives for sending logs to a localsink server.

> Most consumers should use [`@localsink/sdk`](../sdk) (or one of the framework transports: [`@localsink/pino`](../pino), [`@localsink/winston`](../winston), [`@localsink/console`](../console)). Use `@localsink/http` directly only when you need bare-metal control over the request.

## Install

```sh
pnpm add @localsink/http
```

```sh
npm install @localsink/http
```

```sh
yarn add @localsink/http
```

## Usage

```ts
import { sendLog, DEFAULT_URL } from '@localsink/http';

await sendLog(`${DEFAULT_URL}/api/logs`, {
  service_name: 'my-app',
  timestamp: Date.now(),
  level: 'info',
  message: 'request handled',
});
```

## API

### `sendLog(endpoint, payload): Promise<void>`

POSTs `payload` as JSON to `endpoint`. Returns a promise that always resolves to `void` — **never rejects, never throws** — so a missing or misbehaving localsink can't take down the host application.

- 3-second request timeout via `AbortSignal.timeout(3000)`.
- Non-2xx responses, network errors, and JSON serialization errors are all swallowed silently.
- `payload` is typed as `IngestPayload` from [`@localsink/contract`](../contract).

### `DEFAULT_URL`

The string `http://localhost:3000` — the default base URL used by every official localsink client.

### `TransportOptionsSchema` / `TransportOptions`

The Zod schema (and inferred TypeScript type) for `{ serviceName: string, url?: string }`.
