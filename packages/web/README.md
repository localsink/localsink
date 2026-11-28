# @localsink/web

The localsink web UI: a React + Vite single-page app for browsing, searching
and live-tailing logs.

This package isn't published. Its build is bundled into
[`localsink`](../localsink) and served from the same origin as the API, so
`npx localsink` is all users need. This README is for working on the UI.

## Stack

- **React 19** with the [React Compiler](https://react.dev/learn/react-compiler) (enabled via `react({ compiler: true })` in `vite.config.ts`, powered by `oxc-transform-react`)
- **Vite** for dev server and production build
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Vitest** in browser mode (Playwright / headless Chromium) for unit specs

## Develop

Run from anywhere in the workspace:

```sh
pnpm --filter @localsink/web dev      # vite dev server (default :5173)
pnpm --filter @localsink/web build    # produces dist/ for static serving
pnpm --filter @localsink/web preview  # vite preview of the production bundle
pnpm --filter @localsink/web test     # vitest in headless chromium
```

The dev server proxies `/api` and `/mcp` to a localsink server on `:3000`
(override with `VITE_API_TARGET`), so start one in another terminal with
`pnpm --filter localsink dev`. `pnpm --filter localsink seed` gives it sample
logs, and `pnpm --filter localsink emit` streams new ones for the live tail.

Browser-level end-to-end tests live in [`@localsink/e2e`](../e2e).
