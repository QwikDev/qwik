# Qwik Cache Registry App

This is a small Qwik v2 example app for the server-function/component cache registry prototype.

It uses the normal authoring model:

```tsx
server$(fn);
component$(fn);
useAsync$(serverFn, props)<Suspense>;
```

Cache participation is configured from `src/cache.server.ts`, which is imported only by the SSR entry.

## What this demonstrates

- `@qwik.dev/router/cache` as the server-only cache config entry.
- Configured `server$` resources with memory cache and request dedupe.
- Direct `useAsync$(getProduct, props)` as the optimized graph edge.
- Component cache intent configured centrally without changing `component$` authoring.
- `vary` relationships expressed with normal `server$` resources.

The current prototype supports server-resource caching and registry metadata. Rendered component HTML caching still needs the next core runtime slice before this example can show component HTML cache hits from real Qwik SSR.

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
