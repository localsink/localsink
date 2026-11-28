# @localsink/console

Forward `console.*` calls to a running localsink server.

Start a localsink server with `npx localsink`; see the
[main README](https://github.com/localsink/localsink#readme) for setup.

Patches `console.log`, `error`, `warn`, `info`, `debug`, and `trace` so each call is also POSTed to localsink. The original method still writes to stdout/stderr — nothing is suppressed.

## Install

```sh
npm install @localsink/console
```

Requires Node.js 24 or later.

## Usage

```ts
import { localsink } from '@localsink/console';

const uninstall = localsink({
  serviceName: 'my-app',
  url: 'http://localhost:3000', // optional, this is the default
});

console.log('hello world');
console.error(new TypeError('boom'));

// on shutdown — restores console and resolves once in-flight logs are sent
await uninstall();
```

The first `Error` argument is lifted into the structured `error` field (`message`, `stack`, `type`); all arguments are joined into the `message` via `node:util.format` (so `%s` / `%d` specifiers work).

## Options

| Option        | Type     | Default                 | Description                          |
| ------------- | -------- | ----------------------- | ------------------------------------ |
| `serviceName` | `string` | —                       | **Required.** Identifies the source. |
| `url`         | `string` | `http://localhost:3000` | Base URL of the localsink server.    |

The options type is exported as `TransportOptions` for TypeScript callers.

## Notes

- **Idempotent.** A second `localsink(...)` call warns and returns a no-op uninstaller — only the first install takes effect.
- **Silent on failure.** Network errors and non-2xx responses are swallowed; the logger never throws or interrupts your program's control flow.
- The patched methods forward asynchronously and do not block the calling code.
