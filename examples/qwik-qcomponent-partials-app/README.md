# Qwik qcomponent Partials App

This example focuses on when `?qcomponent=` is useful as a standalone partial endpoint.

It keeps the normal authoring model:

```tsx
component$(fn);
server$(fn);
useAsync$(serverFn, props);
<Suspense>;
```

The server-only cache config registers two components:

- `ProductCard`: a reusable product card partial.
- `PricingBadge`: a small price widget that can be fetched independently.

These are separate from full page SSR. The endpoint returns a complete Qwik-rendered component
container so the cached result keeps Qwik metadata with the HTML.

## Run

From the repository root:

```sh
pnpm build.qwik-router
pnpm exec tsc -p examples/qwik-qcomponent-partials-app/tsconfig.json
pnpm exec vite --config examples/qwik-qcomponent-partials-app/vite.config.ts --mode ssr --host 127.0.0.1 --port 4175
```

Then, in another terminal:

```sh
pnpm --dir examples/qwik-qcomponent-partials-app partials http://127.0.0.1:4175/
```

Expected shape:

```txt
useCase=card component=ProductCard request=1 status=200 componentCache=miss matched=true bytes=...
useCase=card component=ProductCard request=2 status=200 componentCache=hit matched=true bytes=...
useCase=price-widget component=PricingBadge request=1 status=200 componentCache=miss matched=true bytes=...
useCase=price-widget component=PricingBadge request=2 status=200 componentCache=hit matched=true bytes=...
```
