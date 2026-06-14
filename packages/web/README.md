# @localsink/web

React + Vite SPA for browsing, searching, and live-tailing logs from a localsink server.

> **Status: in active development.** The product design — architecture, polling-based live tail, URL-as-state, terminal-style bounded scrollback, and the "no in-app tab strip" decision — is settled and documented in [docs/ui-requirements.md](../../docs/ui-requirements.md). The implementation is being built against that blueprint.

## Stack

- **React 19** with the [React Compiler](https://react.dev/learn/react-compiler) (wired via `babel-plugin-react-compiler` in `vite.config.ts`)
- **Vite** for dev server and production build
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Vitest** in browser mode (Playwright / headless Chromium) for unit specs

The built bundle is intended to be served from the same origin as the API by the [`localsink`](../localsink) server, so all `/api/logs*` calls are same-origin in production.

## Develop

Run from anywhere in the workspace:

```sh
pnpm --filter @localsink/web dev      # vite dev server (default :5173)
pnpm --filter @localsink/web build    # produces dist/ for static serving
pnpm --filter @localsink/web preview  # vite preview of the production bundle
pnpm --filter @localsink/web test     # vitest in headless chromium
```

For full integration, start a localsink server in another terminal (see [`packages/localsink`](../localsink)) so the UI has an API to talk to.
