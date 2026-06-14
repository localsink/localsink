# @localsink/contract

Shared [Zod](https://zod.dev) schemas and TypeScript types for the localsink wire protocol — the single source of truth for what client and server agree to send and receive.

The server uses these schemas to validate incoming requests and to type its responses. SDKs and transports use them to type their inputs and to decode responses.

## Install

```sh
pnpm add @localsink/contract
```

```sh
npm install @localsink/contract
```

```sh
yarn add @localsink/contract
```

## Usage

```ts
import {
  ingestPayloadSchema,
  type IngestPayload,
  type LogPage,
} from '@localsink/contract';

const payload: IngestPayload = ingestPayloadSchema.parse({
  service_name: 'my-app',
  timestamp: Date.now(),
  level: 'info',
  message: 'request handled',
  attributes: { userId: 42 },
});

const res = await fetch('http://localhost:3000/api/logs?level=error&limit=20');
const page = (await res.json()) as LogPage;
```

## Schemas

| Schema                | Type            | Used for                                              |
| --------------------- | --------------- | ----------------------------------------------------- |
| `ingestPayloadSchema` | `IngestPayload` | Body of `POST /api/logs`                              |
| `logsQuerySchema`     | `LogFilter`     | Query string of `GET /api/logs` (filter + pagination) |
| `logRowSchema`        | `LogRow`        | A single log; items in `LogPage.data`                 |
| `logPageSchema`       | `LogPage`       | Response of `GET /api/logs`                           |
| `logMetaSchema`       | `LogMeta`       | Response of `GET /api/logs/meta`                      |

`logsQuerySchema` enforces that `cursor`, `offset`, and `after_id` are pairwise mutually exclusive — passing any two raises a validation error.
