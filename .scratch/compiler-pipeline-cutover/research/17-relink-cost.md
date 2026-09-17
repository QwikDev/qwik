# Cost of a full whole-app relink and regenerate

Ticket: `.scratch/compiler-pipeline-cutover/issues/17-relink-cost.md`
Date: 2026-09-17

## Method

- Machine: 16 threads, 31 GB, Node v26.3.1, TypeScript 5.9.3, oxc-parser 0.120.0, vitest 4.1.10
  (`npx vitest run --root . <file>` from the repo root, one temporary unit file under
  `packages/compiler/pipeline/tests/`, deleted afterwards — `git status` shows only `.scratch/`).
- Sets: **docs** = `packages/docs/src/**/*.tsx` (343 files, 10 rejected by research 16 skipped →
  333); **e2e** = `e2e/qwik-e2e/apps/**/*.tsx` skipping `node_modules/dist/.native/lib/server/build`
  (410 files, 9 rejected skipped → 401). Paths repo-relative.
- Steps, all in one process, wall time via `performance.now()`:
  1. `analyseModule({path, code}, {transpileTs: true, rootDir: <repo>})` once per file
     (`pipeline/analyse/analyse-module.ts:57`). 0 throws in either set.
  2. `ResolverSnapshot` = copy of `resolveInputEdges`
     (`pipeline/compat/transform-modules.ts:82-116`), except that bare specifiers **and** relative
     specifiers that do not land in the set are marked `ResolutionKind.External` instead of
     `Unresolved` (the compat helper marks everything unresolved, which `complete:true` rejects at
     `link-plans.ts:570/582`). Entries = one `EntryKind.Module` per file, `exposeExports: true`.
  3. `linkPlans(plans, entries, {environment, mode: BuildMode.Dev, stripExports: []}, resolver,
     {claims:[],policies:[],emissions:[]}, complete)` for Server and Browser.
  4. `generateJsSsr` / `generateJsCsr` on the linked plan, `{outputSourceMaps:false, rootDir}`.
  5. 3+4 repeated 5×; p50 and max reported (rep 0 includes JIT warm-up, visible in the max).
  6. Type isolation, see below.
  7. `transformModules` (compat, `mode:'dev'`, `transpileTs/Jsx`) on the p50-by-bytes file and the
     p90-by-bytes file of each set, 5× SSR and 5× CSR.
- CPU profiles: `node:inspector` `Profiler` started/stopped in-process around analyse (all), link
  (rep 1) and generate (rep 1) per set/environment; raw `.cpuprofile` files + `prof.mjs` summariser
  and the JSON results (`bench-all.json` = clean run used for the tables, `bench-all2/3.json` =
  runs with the in-process profiler on rep 1, `complete-fail-*.txt`) are in the scratchpad.

### `complete:true` does not pass on either set — numbers are `complete:false`

Every `complete:true` link returned `LinkResultKind.Failed` (docs 9 diagnostics, e2e 77), all
code `non-portable-export`, all from the modules that research 16 lists as "accepted with
diagnostics" (`signals.tsx` 48, `render.tsx` 25, `streaming/{streaming,demo}.tsx` 2+2 for e2e;
`modular-forms/index.tsx` 3, `react/{counter-two-islands-host,children}/react.tsx` 3,
`algolia-search/index.tsx` 1 plus 2 × `Unable to link "./react": non-portable-export` for docs). A
plan that carries a diagnostic has no portable exports, so an `exposeExports` entry over it (or an
import of it) is a hard error under `complete:true`. The fallback `complete:false` runs the same
code path — the `complete` flag only gates diagnostics (`link-plans.ts:486,570,582,602`) and the
failure return at `:602` happens **before** `linkRenderResults`/`linkContent`, i.e. before the
expensive part — so the incomplete numbers are the cost a passing complete link would have.
Externals are not visited, so there is no hidden cost from the 439/667 bare edges either.

## Results (p50 of 5 runs, ms; max in parentheses)

### docs — 333 files, 415 KB source, 2 098 QRLs, 390 declared type contracts in 155 modules

| step | Server | Browser |
| --- | ---: | ---: |
| analyse, all files once (single run) | 454 (p50/file 0.73, max/file 16.5) | same plans |
| link (`complete:false`, types on) | **177** (353) | **159** (184) |
| link with `source.types` stripped | 57 (65) | 59 (67) |
| type reader create + 1 query (isolated) | 95 (118) | 90 (92) |
| generate (`generateJsSsr` / `generateJsCsr`) → 2 039 output modules | **80** (119) | **72** (87) |
| **link + generate** | **257** | **231** |
| analyse + link + generate (cold) | 711 | 685 |

Edges: 133 resolved in-set, 96 relative-but-outside-set (`.ts`, `.css`, `.mdx`, rejected files),
439 bare.

### e2e — 401 files, 395 KB source, 2 433 QRLs, 296 contracts in 130 modules

| step | Server | Browser |
| --- | ---: | ---: |
| analyse, all files once (single run) | 438 (p50/file 0.51, max/file 19.0) | same plans |
| link (`complete:false`, types on) | **254** (285) | **241** (291) |
| link with `source.types` stripped | 131 (136) | 128 (133) |
| type reader create + 1 query (isolated) | 104 (125) | 95 (100) |
| generate → 2 229 output modules | **79** (100) | **63** (76) |
| **link + generate** | **333** | **304** |
| analyse + link + generate (cold) | 771 | 742 |

Edges: 141 resolved, 87 missing-relative, 667 bare.

A second and third full run (`bench-all2/3.json`) reproduce these within ±10 % (docs link 175/148,
e2e link 266/238, generate 66–81).

### Per-module compat path (`transformModules`, one file, 5 runs each)

| set | file | bytes | QRLs | SSR ms | CSR ms |
| --- | --- | ---: | ---: | --- | --- |
| docs p50 | `packages/docs/src/routes/demo/react/counter-simple-hover/react.tsx` | 544 | 4 | 2.2, 1.3, 1.1, 1.0, 1.1 | 0.9, 0.9, 1.3, 0.9, 0.9 |
| docs p90 | `packages/docs/src/repl/ui/repl-output-modules.tsx` | 2 717 | 30 | 5.2, 6.0, 5.3, 6.2, 5.3 | 4.8, 4.2, 4.2, 4.9, 4.4 |
| e2e p50 | `e2e/qwik-e2e/apps/qwikrouter-test/src/routes/head-error/index.tsx` | 341 | 2 | 0.8, 0.7, 0.6, 0.6, 0.5 | 0.5, 0.6, 0.5, 0.5, 0.5 |
| e2e p90 | `e2e/qwik-e2e/apps/qwikrouter-test/src/components/header/header.tsx` | 2 118 | 20 | 4.3, 2.7, 3.2, 2.8, 2.8 | 2.8, 4.0, 2.8, 2.4, 2.5 |

The "median" file in both sets is tiny (≈0.5 KB); the p90 file is the more useful per-module
number: **≈3–6 ms** analyse+link+generate for a 2–3 KB / 20–30 QRL module, ≈1 ms for a small one.
For comparison the whole-app amortised cost is 0.8–1.0 ms/file for link+generate. Per module the
compat path never pays the TypeScript program (single-module link → the reader is created only if
that one module has a contract binding that is queried; with one 2 KB file that is ≈1 ms).

## Where the time goes (CPU self-time from the in-process profiles, profiler overhead excluded)

**Link** (`docs-server-link` 185 ms sampled / `e2e-server-link` 248 ms):

| bucket | docs | e2e |
| --- | ---: | ---: |
| `typescript` (`createProgram` parse+bind of all module sources + `lib.es5.d.ts`, checker queries) | 108 ms (58 %) | 103 ms (42 %) |
| `link/render-results.ts` (`readBinding` :301, `evaluate` :392) | 35 ms (19 %) | 90 ms (36 %) |
| `link/link-plans.ts` (edge/export resolution, `linkOperation`, `visitDecl`) | 12 ms | 11 ms |
| `link/type-results.ts` (`resultOf`, reader wrapper) | 4 ms | 12 ms |
| GC / native | 16 ms | 15 ms |
| `link-content`, `link-hooks`, `qrl-dependencies` | 5 ms | 11 ms |

**Type-results isolation.** There is no switch: `createDeclaredResultReader`
(`pipeline/link/type-results.ts:11-24`) creates the `ts.Program` + `getTypeChecker()` lazily on the
first query of a binding that has a declared contract (`read ??= createReader(modules)`), and both
sets hit that on every link. Two measurements bracket it:

- **Stripped contracts** (`source.types = undefined` on cloned plans → the reader is never created;
  render-results treats those bindings as unknown, so this also removes some `evaluate` work):
  link drops from 177→57 (docs) and 254→131 (e2e), i.e. **the checker path is ≈120 ms ≈ 65 % of
  docs link and ≈120 ms ≈ 48 % of e2e link**.
- **Reader alone** (`createDeclaredResultReader(linked.plan.modules)` + one query, on the already
  linked modules): **≈90–105 ms** on both sets — that is `ts.createSourceFile` × (N modules + lib)
  + `createProgram` + binder + first checker touch. The remaining ≈15–30 ms of the stripped-vs-on
  gap is the per-query checker work (`getTypeAtLocation`, signatures, `resultOf` unions).

So the TypeScript program is a **fixed ≈100 ms per relink**, roughly independent of which module
changed and growing with total source size (docs and e2e have similar KB and similar cost). It is
also rebuilt from scratch on every `linkPlans` call — nothing caches `SourceFile`s across links
even though `module.source.types.code` is identical between relinks for unchanged modules.

**Analyse** (`docs-analyse` 451 ms / `e2e-analyse` 421 ms sampled): oxc `parseSync`+`jsonParseAst`
(AST deserialisation) 72/88 ms, `ast/bindings.ts` (`resolveReferences` :295, `collect` :137,
`collectChildren`) 85/91 ms, GC 60/53 ms, `segment-identity.ts` `hash64` 17/24 ms, `lower-jsx`
25/23 ms, `lower-function` 20/14 ms, `jsx-analysis` 17/10 ms, `results.ts` 14/13 ms,
`normalize.ts` (transpile) 4/4 ms. Analyse is ≈0.5–0.7 ms/file p50 with a 16–19 ms max
(`slot.tsx`-size files); it is the one phase that is per-file cacheable and already is in the dev
host design.

**Generate** (`e2e-server-gen` 79 ms / `e2e-browser-gen` 66 ms sampled): `js-ssr.ts`/`js-csr.ts`
17/10 ms, `emit-chunk.ts` 14/8 ms, `magic-string` 13/19 ms (`MagicString` constructor per output
module: 2 039–2 229 instances), `emit-component` 6/3, `names.ts` `createNameAllocator` 5/3, GC 8/7.
Nothing dominant; it is ≈35 µs per emitted module and scales with output module count (≈6 per
source file).

## Reading for ticket 04 (dev host)

- With all `ModulePlan`s cached, a **whole-app relink+regenerate is ≈0.25–0.35 s per environment**
  at 330–400 files (≈0.55–0.65 s for both environments, sequential), single-threaded, dominated
  by link not generate. Analyse of everything cold adds ≈0.45 s but is the cached part.
- Of the link cost, **≈100 ms is the TypeScript program rebuild** — the single largest fixed
  item and the obvious first optimisation (reuse `SourceFile`s / an incremental `ts.Program` keyed
  by `module.source.types.code`, or skip the reader when no *changed* module's contract set
  intersects the queried bindings). Without it, docs link is ≈57 ms and e2e ≈130 ms.
- The rest scales with app size roughly linearly (`render-results` is the e2e-heavy part: more
  QRLs and more self-referential writes to `evaluate`); at 10× the file count expect seconds,
  which is where an incremental/partial relink (relink only the reachable closure of the changed
  module) starts to matter. At the measured scale it does not.
- A per-module compat transform is 1–6 ms; a full relink is ≈50–300× that, still well inside an
  HMR budget at this app size.
- `complete:true` is not usable as the dev-host default until modules with diagnostics keep
  portable exports (or the host degrades those entries to `complete:false`); otherwise one
  `dom-nesting` warning in `render.tsx` fails the whole link with 25 `non-portable-export`
  errors.
