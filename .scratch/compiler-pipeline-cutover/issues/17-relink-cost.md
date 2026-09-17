# Cost of a full whole-app relink and regenerate
Type: research
Status: resolved
Blocked by:

## Question

For the dev host design (ticket 04): with all `ModulePlan`s cached, what does one
`linkPlans(complete:true)` + `generateJsSsr`/`generateJsCsr` cost at app scale? Measure on
`packages/docs/src` (~343 tsx) and `e2e/qwik-e2e/apps` (~436 tsx): wall time for analyse (all,
once), link, generate, per environment; split out the type-results TypeScript program creation;
report p50 of 5 runs. Also measure the per-module incomplete path (`transformModules`) for one
file for comparison.

## Answer

- Whole-app relink+regenerate with cached plans: **docs (333 files) ≈257 ms server / 231 ms browser; e2e (401 files) ≈333 / 304 ms** (p50 of 5; link 150–255 ms, generate 60–80 ms). Cold analyse of everything adds ≈440–450 ms (0.5–0.7 ms/file p50).
- **≈100 ms of every link is the TypeScript program** (`createDeclaredResultReader` → `ts.createProgram` + checker, rebuilt from scratch per link, lazily on the first contract query — no switch); with contracts stripped link drops to 57 ms (docs) / 130 ms (e2e). Rest of link is `render-results` `readBinding`/`evaluate` (e2e-heavy).
- Generate is cheap and flat: ≈35 µs per emitted module (2 039 / 2 229 modules), `magic-string` + emit-chunk, nothing dominant.
- `complete:true` fails on both sets (9 / 77 `non-portable-export` diagnostics, all from modules that carry a diagnostic, e.g. `render.tsx` dom-nesting); numbers are `complete:false`, which runs the identical code path since the flag only gates diagnostics before `linkRenderResults`.
- Per-module compat `transformModules`: ≈1 ms (0.5 KB file) to 3–6 ms (2–3 KB, 20–30 QRLs) per environment, i.e. a full relink is ≈50–300× one module transform. Findings: `research/17-relink-cost.md`.
