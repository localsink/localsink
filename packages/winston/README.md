# @localsink/winston

[Winston](https://github.com/winstonjs/winston) transport that forwards logs to a running localsink server.

## Install

```sh
pnpm add winston @localsink/winston
```

```sh
npm install winston @localsink/winston
```

```sh
yarn add winston @localsink/winston
```

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

## Notes

- `transport.close()` waits for in-flight requests to settle before emitting `finish`, so calling `logger.close()` during graceful shutdown is safe.
