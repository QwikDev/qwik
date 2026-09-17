# Dev builds: one live LinkedPlan with module swap-in
Type: grilling
Status: resolved
Blocked by:

## Question

Varixo's direction (Q9): link the whole app once in dev, then on each file change swap that
module's `ModulePlan` into the live `LinkedPlan` instead of relinking from scratch. Decide the
invalidation contract: which linked facts are per-module (safe to swap) and which are joins
(`needsId`, `waitForTasks`, `providesContextEffective`, `runtimeScope`, render results, type
results, content specialization) that must be re-derived for dependents; when a full relink is
forced; how this coexists with the per-module compat path that cutover starts on; what the HMR
boundary is for generated chunks. DESIGN.md said "no custom epochs until profiling demands";
this ticket decides whether that is now overridden. May graduate a prototype ticket.

## Answer

Resolved 2026-09-17 (Varixo accepted the recommended answers; research 17 supplied the numbers).

- **Unit**: `ModulePlan` cache per file. On change or first sight of a module: replace its plan, relink the
  whole app, regenerate, hash each generated module and invalidate only the sources whose output changed.
  No incremental joins; the linker stays pure. Justified by research 17: ≈250–330 ms per environment at
  docs/e2e scale, versus 1–6 ms per single-module transform.
- **Whole app in dev**: the set of modules seen so far, linked `complete: false`, plus an eager crawl from the
  SSR entry on the first request. Unknown facts that become known flip dependents' outputs; the hash diff
  catches that, no dependency bookkeeping.
- **The expensive join**: `link/type-results.ts` replaces the per-link `ts.createProgram` with a
  `LanguageService` over a versioned in-memory host so unchanged files reuse checker state (≈100 ms of every
  link today).
- **Vite invalidation**: hash-diff only; Vite's parent-invalidates-segment rule and full reload do the rest. No
  new HMR boundaries.
- **Environments**: one plan cache, two live `LinkedPlan`s (server, browser); every swap relinks both.
- **Per-module `transformModules`**: stays as the test-harness and library API entry only; dev and prod both go
  through the live host.
- **Ownership**: compiler-owned `createLinkedApp()` (plan cache, resolver snapshot, relink, output diff, no Vite
  types); thin qwik-vite adapter for load, crawl and invalidate; `linked-build.ts` shares it. Ticket 05's
  artifact is "serialize the live server plan".
- **Surfaced**: `complete: true` fails real apps because a module diagnostic becomes `non-portable-export`
  (on the map as fog; a linker rule, not this host's).
