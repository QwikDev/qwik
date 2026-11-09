# Preloader test app

A JS streaming test bench: one route per case, 40 filler collapsibles around each fixture, and the
preloader set to `{ ssrPreloads: 0, maxIdlePreloads: 1 }` so speculative preloads go one at a time.
Add `?maxIdlePreloads=<n>` to a page's URL to load it with another limit.
`/all-at-once/` renders every fixture; those with visible tasks sit below the fold, so only
`visible/above` runs its visible tasks at load.

- `pnpm generate` rewrites the filler collapsibles and the setup × primitive fixtures from
  `scripts/generate.ts`. Edit the script, not the generated files.
- `pnpm preview` builds the app and serves it over HTTPS (HTTP/2). Build core with `pnpm build.core`
  first: a dev core build splits core into other chunks. Accept the self-signed
  certificate, open DevTools Network with 3G throttling and the cache disabled, then click a
  fixture's trigger while preloads still run.

The Playwright suite that counts round trips against this app lives in `e2e/preloader-e2e`.
