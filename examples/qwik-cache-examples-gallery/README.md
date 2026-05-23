# Qwik Cache Examples Gallery

Root gallery for the cache-registry prototype examples.

```bash
pnpm -C examples/qwik-cache-examples-gallery dev:all
```

Then open:

```txt
http://127.0.0.1:4300/
```

The gallery starts each example app on a stable local port and links to it with context.

The example UIs use the Tailwind CDN from each app's `src/root.tsx`, so there is no
Tailwind build step for local exploration.

## Query Modes

Each demo supports the same query knobs for comparing cold/mock-loading behavior
with stable cached behavior:

```txt
?demo=mock-loading&run=<unique-id>&delay=900
?demo=cached&run=stable&delay=0
```

Use `demo=mock-loading` with a fresh `run` value to force unique resource inputs
and visible async loading paths. Use `demo=cached` with `run=stable` to keep the
same cache keys across reloads and partial/component requests.

The gallery cards include both links so you can jump directly into either mode.
