---
'@qwik.dev/core': major
'@qwik.dev/router': major
---

`ErrorBoundary` now ships from `@qwik.dev/core` instead of `@qwik.dev/router`. The `useErrorBoundary()` hook is removed — `<ErrorBoundary>` is the single error-boundary surface. `<ErrorBoundary>` requires enabling the experimental `errorBoundary` feature (`qwikVite({ experimental: ['errorBoundary'] })`).

- `ErrorBoundary` catches errors thrown during SSR and CSR.
- An error is handled by the closest boundary (its own subtree), instead of every boundary reacting to the global `qerror` event.
- `fallback$` is now required and receives `(error, reset)`; `error` is always an `Error` (a non-Error throw is wrapped, keeping the raw value on `error.cause` in dev) and the fallback returns `JSXOutput`. Calling `reset()` clears the error and re-attempts the children (works for both client-caught and SSR render errors).
- New optional `onError$` side-effect (logging/telemetry), fired once per caught error with `(error, info)`: `error` is the original `Error` instance (a non-Error throw arrives wrapped with the raw value as `cause`), and `info` carries the error `phase` and `boundaryId`.
- In production the error is redacted to a generic message + a stable `digest` before it reaches the client, so internal details never leak; the original error still reaches `onError$` and server logs. Customize what the client sees with the server-only `transformError` render option on `renderToStream`/`renderToString` (return an `Error`, or the redacted generic is used).
- If the `fallback$` chunk itself fails to load, a built-in fallback is shown, and unhandled rejections are routed to `logError`.