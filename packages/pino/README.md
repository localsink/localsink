# @localsink/pino

[Pino](https://github.com/pinojs/pino) transport that forwards logs to a running localsink server.

Built on [`pino-abstract-transport`](https://github.com/pinojs/pino-abstract-transport) and designed to run in a worker thread via [`pino.transport`](https://getpino.io/#/docs/transports).

## Install

```sh
pnpm add pino @localsink/pino
```

```sh
npm install pino @localsink/pino
```

```sh
yarn add pino @localsink/pino
```

`pino` is a peer dependency.

## Usage

```ts
import pino from 'pino';

const transport = pino.transport({
  target: '@localsink/pino',
  options: {
    serviceName: 'my-app',
    url: 'http://localhost:3000', // optional, this is the default
  },
});

const logger = pino(transport);

logger.info({ traceId: 'abc123', userId: 42 }, 'request handled');
logger.error({ err: new Error('boom') }, 'failed');
```

Numeric pino levels (`10`–`60`) are mapped to `trace`/`debug`/`info`/`warn`/`error`/`fatal`. The `err` (or `error`) property becomes the structured `error` field; `traceId`/`trace_id`, `spanId`/`span_id`, and `logger` are lifted to top-level columns; any remaining bindings (e.g. `userId`) end up in `attributes` and are full-text searchable.

## Options

| Option        | Type     | Default                 | Description                          |
| ------------- | -------- | ----------------------- | ------------------------------------ |
| `serviceName` | `string` | —                       | **Required.** Identifies the source. |
| `url`         | `string` | `http://localhost:3000` | Base URL of the localsink server.    |

## Notes

- Pino runs `target` transports in a worker thread, so `options` must be JSON-serializable — pass plain values only, no functions or class instances.
- Pending requests are awaited on transport `close()`, so logs in flight at shutdown are not lost.
