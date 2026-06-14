# @localsink/sdk

Ergonomic client for sending logs to a localsink server programmatically.

If you are wiring up an existing logger, prefer [`@localsink/pino`](../pino), [`@localsink/winston`](../winston), or [`@localsink/console`](../console). Use this SDK directly for ad-hoc instrumentation or when building a custom transport.

## Install

```sh
pnpm add @localsink/sdk
```

```sh
npm install @localsink/sdk
```

```sh
yarn add @localsink/sdk
```

## Usage

```ts
import { createClient } from '@localsink/sdk';

const client = createClient({
  serviceName: 'my-app',
  url: 'http://localhost:3000', // optional, this is the default
});

await client.log({
  timestamp: Date.now(),
  level: 'info',
  message: 'request handled',
  trace_id: 'abc123',
  attributes: { userId: 42, route: '/checkout' },
});

await client.log({
  timestamp: Date.now(),
  level: 'error',
  message: 'failed to charge card',
  error: { message: 'stripe timeout', type: 'StripeError' },
});
```

## API

### `createClient(opts): LocalsinkClient`

`opts` is `{ serviceName: string, url?: string }` (validated by `TransportOptionsSchema`). Returns a client whose `log(input)` method POSTs to `<url>/api/logs`, automatically attaching `service_name` from `opts.serviceName`.

### `client.log(input): Promise<void>`

`input` is `LogInput` — every field of the wire `IngestPayload` except `service_name`:

| Field        | Type                                     | Notes                                           |
| ------------ | ---------------------------------------- | ----------------------------------------------- |
| `timestamp`  | `number`                                 | Epoch milliseconds.                             |
| `level`      | `string`                                 | Free-form (`info`, `error`, …); no enum.        |
| `message`    | `string`                                 | Required, but may be empty.                     |
| `trace_id`   | `string \| null`                         | Optional.                                       |
| `span_id`    | `string \| null`                         | Optional.                                       |
| `logger`     | `string \| null`                         | Optional, e.g. the upstream logger's name.      |
| `error`      | `{ message?, stack?, type?, … } \| null` | Structured error; arbitrary extra keys allowed. |
| `attributes` | `Record<string, unknown> \| null`        | Free-form structured data; FTS-searchable.      |

`log` resolves to `void` and **never rejects** — `@localsink/http` swallows transport failures so localsink being down can't break your application.
