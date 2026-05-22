# Qwik Partial Navigation App

This example shows the lightweight SPA-router idea for `?qcomponent=`.

The app renders a normal Qwik route shell. When a user clicks a product tab, the client fetches a
registered `ProductPagePartial` component over `?qcomponent=ProductPagePartial` and places the
returned HTML from the JSON partial envelope into a partial outlet.

This is intentionally small. It demonstrates the transport shape:

```txt
client route shell
-> POST ?qcomponent=ProductPagePartial
-> server renders and caches the registered component envelope
-> server returns { html, component, cache, resources }
-> client swaps the payload HTML into an outlet and can inspect cache/resource metadata
```

The full production version still needs router-level integration for nested resumability, focus,
history, prefetching, invalidation, and partial batching. This example is a practical sketch of the
navigation model. The JSON payload is still a standalone qcomponent envelope; it does not claim full
in-page resumable subtree insertion.

## Run

From the repository root:

```sh
pnpm build.qwik-router
pnpm exec tsc -p examples/qwik-partial-navigation-app/tsconfig.json
pnpm exec vite --config examples/qwik-partial-navigation-app/vite.config.ts --mode ssr --host 127.0.0.1 --port 4176
```

Then open [http://127.0.0.1:4176/](http://127.0.0.1:4176/) and click the product buttons.

For a terminal-only check:

```sh
pnpm --dir examples/qwik-partial-navigation-app partials http://127.0.0.1:4176/
```

Expected shape:

```txt
page=keyboard request=1 status=200 componentCache=miss payloadCache=miss resources=... matched=true bytes=...
page=keyboard request=2 status=200 componentCache=hit payloadCache=hit resources=... matched=true bytes=...
page=mouse request=1 status=200 componentCache=miss payloadCache=miss resources=... matched=true bytes=...
page=mouse request=2 status=200 componentCache=hit payloadCache=hit resources=... matched=true bytes=...
```
