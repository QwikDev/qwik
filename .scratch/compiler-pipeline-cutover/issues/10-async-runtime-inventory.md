# What the core runtime already has for async rendering
Type: research
Status: resolved
Blocked by:

## Question

Inventory `packages/qwik/src/core` (and `server/`) for: Suspense (`createSuspense`,
`createSsrSuspense`, `<!d=` ranges, `$serializeNext$`, `q:sub`), Reveal, ErrorBoundary /
`useErrorBoundary`, thrown-promise handling, streaming writer and chunk boundaries, and what
`main` had for each (spec files under `packages/qwik/src/core/tests` on `main`, count and
names). Output: per feature — exists / partial / missing, entry symbols, and main's spec list.

## Answer

Findings: `research/10-async-runtime-inventory.md`.

1. Suspense/Reveal/streaming/`$serializeNext$`/`q:sub` runtime is complete on v3 (`dom/content/{content,suspense-ssr,reveal}.ts`, `server/ssr-render.ts`, `ssr-script-emitter.ts`, `container-context.ts`) with ~110 green unit its; ErrorBoundary and Resource/SSRStream are absent.
2. The pipeline has only the `OpKind.Suspense` schema plus two linker walkers; `lower-jsx` recognizes just `Slot`, so `<Suspense>`/`<Reveal>` compile to `createComponent(() => null)` — the "known Suspense red" (`task.spec.tsx:138`).
3. Legacy `generators/js/{csr,ssr}` (`emit-csr.ts:1189`, `emit-js.ts:1544`) already emit the exact `createSuspense`/`createSsrSuspense`/`createRevealGroup` ABI; the pipeline needs a producer in analyse and an emitter case per target.
4. Thrown-promise retry (`component.ts:103`, `retryOnPromise`) and async component results exist but lack corpus proof (main `render-promise.spec.tsx`, 4 its).
5. main corpus to port: `suspense.spec.tsx` 47, `error-boundary.spec.tsx` 122 (1 skip), `use-resource.spec.tsx` 9, `error-handling` 1, `error-provider` 4; v3 has none of these, only skipped placeholders in `deferred-features.spec.ts`.
