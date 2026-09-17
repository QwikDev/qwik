# Whole-app LinkedPlan JSON artifact
Type: grilling
Status: resolved
Blocked by:

## Question

The build writes the server `LinkedPlan` as a JSON asset (Q10 yes). Decide: file name and vite
option; environments (server only, or browser too); what the file carries (`implementations`
table, payload source text, diagnostics, `complete` flag) and what it omits; ID portability
(reuse `library-plan.ts` module-ID relocation?); the gate: `generateJsSsr` from the
deserialized, deep-frozen file in a fresh process must be byte-equal to the in-memory run.
Where the gate lives (pipeline unit vs qwik-vite unit) and which fixtures seed it.

## Answer

Resolved 2026-09-17 (Varixo; Q2 and Q6 amended from the recommendation).

- **Trigger and names**: `linkedPlan: true` on the qwik vite plugin writes a pair of build assets beside the
  bundles: `q-linked-plan.server.json` and `q-linked-plan.browser.json`, each taken from the corresponding live
  plan of the `createLinkedApp()` host (ticket 04), so builds and artifacts never disagree.
- **Contents**: the `LinkedPlan` verbatim (modules with `source.code`, `types`, `normalizationMap`,
  `implementations`, `diagnostics`, `complete`, `specialization`); the only transformation is relocation of
  module paths to root-relative paths (deterministic, readable) reusing the `library-plan.ts` relocation, with
  `sourceRoot` stripped.
- **Completeness**: fail closed. An artifact is written only from a `complete: true` link; with `linkedPlan`
  on, an incomplete link fails the build. What fails completeness is ticket 18.
- **Gate**: each artifact is proven by its own generator in a fresh process. Compiler unit
  `linked-plan-artifact.unit.ts`: link the snapshot-fixture batch complete for both environments, serialize,
  and in a child Node process read + validate + deep-freeze + `generateJsSsr` (server) / `generateJsCsr`
  (browser); byte-equal to the in-process run; a shuffled module order yields a byte-identical artifact.
  qwik-vite `linked-build.unit.ts` repeats the check over its real Rolldown app builds.
- **Versioning**: every envelope (module, linked, library) resets to `version: 1` under one shared
  `PLAN_SCHEMA_VERSION`; nothing is released. Bumped together on any schema change.
- **Reader**: `readLinkedPlan(source)` ships in the compiler, mirroring `readLibraryPlan`; the gate uses it and
  the native-contract spec (ticket 14) documents its checks as the reader contract.
