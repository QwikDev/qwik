# Build constants and stripping in the linker
Type: grilling
Status: resolved
Blocked by:

## Question

Group 15 remainder plus the "linker folding depth" fog: DESIGN rule 2 gives the linker constant folding,
guard selection, pruning and export stripping; today it is a 1:1 materializer with `Predicate` and
`FoldContext` in the schema and no `build-constant` IR leaf. Decide for the live-plan host: which
constants fold at link (`isServer`, `isBrowser`, `isDev` by `Specialization`), what a residual `isDev`
becomes, whether folded-away arms are pruned from reachability, the stripping policies
(`stripCtxName`, `regCtxName`, `stripEventHandlers`, server-only exclusion) as plugin policies vs core
fields, and the proof: the "constants sweep" fixture family and the recognition of every payload
carrier. Library-mode transform of custom `$` APIs, manifests/chunk graphs and cold browser resume stay
fog until this lands.

## Answer

Resolved 2026-09-17 (Varixo; Q1 amended to include `import.meta.env`).

- **Constants**, two sources, one folding machinery (`Predicate` guards on setup ops, render ops and QRL uses;
  `build-constant` IR leaf in expression position, added now): (1) derived from `Specialization`: `isServer`,
  `isBrowser`, `isDev` from `@qwik.dev/core/build` and the aliases `import.meta.env.SSR` (= `isServer`),
  `import.meta.env.DEV` (= `isDev`), `import.meta.env.PROD` (= not `isDev`); (2) host-defined: any other
  `import.meta.env.<NAME>` or `define`d global folds when qwik-vite supplies its value in
  `Specialization.constants` (strings and booleans from Vite env and `define`); with no value it stays a
  hole, reported under `jsHoles: 'forbid'`.
- **Folding**: in the linker's materialize phase by `Specialization`. A decided guard inlines the kept arm and
  drops the other; the dropped arm's QRLs become `delivery: omit` and leave reachability and the artifact. JS
  generators replace the constant's range with the literal (`AssemblyKind.ConstantFold`). A residual guard
  exists only for `BuildMode.Unknown` (the neutral library plan); a complete artifact never contains one
  (spec invariant).
- **Policies**: host-supplied `Specialization.strip = { exports, ctxName, regCtxName, eventHandlers }`, filled by
  qwik-vite as today, applied at link to `LinkedQrl.delivery` (`stripped`, `register`, `reference`) and to
  export removal. `PluginSnapshot` is deleted (claims and emissions went to `native$`, policies here).
- **Proof**: a `constants-sweep` fixture family across every payload carrier (setup statement, render
  expression, QRL body, hook body, module helper) × server/browser × dev/prod with plan snapshots; one
  fixture per `delivery` kind; real-app gate on the prod client artifact: zero `stripped` bodies in output
  text, zero `server$` bodies in client chunks.
