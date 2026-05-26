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

## Production Preview

Use production builds when measuring cache behavior or comparing cold and cached
response timing:

```bash
pnpm -C examples/qwik-cache-examples-gallery prod:all
```

That command builds every example with `qwik build preview`, then starts each
app with `vite preview` on the same ports used by `dev:all`.

You can also split the steps:

```bash
pnpm -C examples/qwik-cache-examples-gallery build:all
pnpm -C examples/qwik-cache-examples-gallery preview:all
```

Run `dev:all` for fast iteration. Run `prod:all` for performance checks.

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
