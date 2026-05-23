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
