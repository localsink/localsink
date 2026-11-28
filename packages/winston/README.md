# @localsink/winston

[Winston](https://github.com/winstonjs/winston) transport that forwards logs to a running localsink server.

Start a localsink server with `npx localsink`; see the
[main README](https://github.com/localsink/localsink#readme) for setup.

## Install

```sh
npm install winston @localsink/winston
```

Requires Node.js 24 or later.

`winston` is a peer dependency.

## Usage

```ts
import { createLogger, format } from 'winston';

import { LocalsinkTransport } from '@localsink/winston';

const logger = createLogger({
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new LocalsinkTransport({
      serviceName: 'my-app',
      url: 'http://localhost:3000', // optional, this is the default
      level: 'info', // standard winston transport option
    }),
  ],
});

logger.info('request handled', { traceId: 'abc123', userId: 42 });
logger.error('failed', { err: new Error('boom') });
```

`err` (or `error`) becomes the structured `error` field; `traceId`/`trace_id`, `spanId`/`span_id`, and `logger` are lifted to top-level columns; any remaining metadata ends up in `attributes` and is full-text searchable. A `timestamp` meta field is accepted as either a number (epoch ms) or an ISO string.

## Options

Standard `winston-transport` options (`level`, `format`, `silent`, …) are honored. localsink-specific options:

| Option        | Type     | Default                 | Description                          |
| ------------- | -------- | ----------------------- | ------------------------------------ |
| `serviceName` | `string` | —                       | **Required.** Identifies the source. |
| `url`         | `string` | `http://localhost:3000` | Base URL of the localsink server.    |

For TypeScript callers, `LocalsinkTransportOptions` is the constructor's full
options type — the localsink options above intersected with winston's own
`TransportStreamOptions`. `TransportOptions` (the localsink half alone) is also
exported.

## Notes

- `transport.close()` waits for in-flight requests to settle before emitting `finish`, so after `logger.close()`, wait for the transport's `finish` event before exiting.
- **Never throws.** Network errors and non-2xx responses are swallowed, and each request times out after three seconds, so localsink being down can't break your application.
