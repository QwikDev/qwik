# Qwik Cache Registry App

This is a small Qwik v2 example app for the server-function/component cache registry prototype.

It uses the normal authoring model:

```tsx
server$(fn);
component$(fn);
useAsync$(serverFn, props);
<Suspense>;
```

Cache participation is configured from `src/cache.server.ts`, which is imported only by the SSR entry.

## What this demonstrates

- `@qwik.dev/router/cache` as the server-only cache config entry.
- Configured `server$` resources with memory cache and request dedupe.
- Direct `useAsync$(getProduct, props)` as the optimized graph edge.
- Component cache intent configured centrally without changing `component$` authoring.
- `vary` relationships expressed with normal `server$` resources.
- A fetchable `?qcomponent=ProductCard` partial path that returns a standalone Qwik component
  envelope and reports `X-Qwik-Component-Cache`.

The page route still renders through normal Qwik SSR. The component partial endpoint is the safe first
slice for rendered component output caching because it caches a complete Qwik-rendered container with
its own serialized metadata instead of splicing raw HTML into an active page stream.

## Verify

From the repository root:

```sh
pnpm build.qwik-router
pnpm exec tsc -p examples/qwik-cache-registry-app/tsconfig.json --noEmit
```

To try the app manually after the local packages are built:

```sh
pnpm exec vite --config examples/qwik-cache-registry-app/vite.config.ts --mode ssr
```

Then, in another terminal:

```sh
pnpm --dir examples/qwik-cache-registry-app partial http://127.0.0.1:4174/ keyboard
```

Expected shape:

```txt
request=1 status=200 componentCache=miss hasProduct=true bytes=...
request=2 status=200 componentCache=hit hasProduct=true bytes=...
```
