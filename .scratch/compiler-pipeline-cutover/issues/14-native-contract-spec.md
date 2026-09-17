# One native-contract spec over LinkedPlan
Type: grilling
Status: resolved
Blocked by:

## Question

Replace specs 01/02/03/07/08/09 with one spec anchored to `pipeline/schema`: the artifact
envelope and version, the reachability rule, the no-Js-on-server invariant, the engine
responsibilities that stay (freeze specs 04/05/06 by reference), what an engine must fail
loudly on, and the conformance the compiler side provides (layer0 goldens, the fresh-process
regeneration gate, the variant-coverage gate). Decide title, location, and which parts of the
old specs are carried verbatim. Fix the v2/v3 version drift in DESIGN.md at the same time.

## Answer

Resolved 2026-09-17 (Varixo accepted all).

- **Title and place**: `packages/compiler/specs/linked-plan.md`, "Linked plan: the engine contract", replacing
  01/02/03/07/08/09. `specs/README.md` becomes a four-line index: this spec, the three freeze specs (renamed to
  their titles: state serialization, wire contract, JS semantics profile), the outlook. Number prefixes go.
- **Sections** (one screen each, rules plus the gate that enforces them): 1 envelope and artifacts (ticket 05);
  2 completeness (18); 3 reachability and holes (07); 4 IR vocabulary with every variant listed and
  "fail loudly on anything not here" (07); 5 render ops incl. Suspense, Reveal groups, ErrorBoundary, lanes,
  in-order propagation (08, 09); 6 engine responsibilities by reference to the freeze specs; 7 conformance the
  compiler provides: layer0 goldens, fresh-process regeneration, variant-coverage allowlist, plan snapshots,
  reference interpreter as HTML oracle (07, 11); 8 plugins as direction (claims, `implementations`).
- **Carried verbatim**: spec 07's QRL invocation convention and request lifecycle (as the reference engine's
  ABI), spec 09's plugin kinds and dependency convention, spec 08's layer0 description. Not carried: spec
  07's "no interpreter" shape (engine shape stays open), anything anchored to `src/` paths.
- **Ownership**: a schema PR that adds or removes a variant must touch the spec's variant tables; the
  variant-coverage allowlist references the spec section.
- **Timing**: written when tickets 05 and 07 land in code; until then DESIGN.md and this map carry the contract.
