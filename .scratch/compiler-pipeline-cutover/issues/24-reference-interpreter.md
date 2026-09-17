# Reference interpreter: scope, home, and the HTML oracle
Type: grilling
Status: resolved
Blocked by:

## Question

Ticket 07 makes a test-only reference interpreter the proof of IR fidelity: it evaluates the linked
server plan for the fixture registry (ticket 11) and must produce HTML identical to `generateJsSsr`.
Decide: which plan surface it evaluates (render ops, IR expressions, statement IR, `FnBody`, lanes; what
it refuses), how it gets the runtime pieces it cannot reimplement (state serialization, wire escaping,
event wiring: call the real core runtime through the same ABI the generated JS calls, or reimplement),
where it lives (`pipeline/tests/interpreter/` vs a `conformance/` sibling of layer0), and how a fixture
opts in (every registry fixture by default, allowlist for refusals). `conformance/layerA/interpret-plan.ts`
(1346 lines, old plan format) is the precedent to mine before deletion.

## Answer

Resolved 2026-09-17 (Varixo accepted all).

- **Scope**: evaluates the whole linked server plan: programs and every op (element, text hole, content,
  branch, collection, component, slot/projection, Suspense, ErrorBoundary, lanes), setup ops, IR expressions,
  statement IR, `FnBody`, resolving QRL bodies from the plan. Refuses loudly any `Js` hole and any variant
  outside the vocabulary, the same set a native engine refuses.
- **Runtime**: calls the real core runtime through the ABI the generated JS calls and renders through the real
  `renderToString`; reimplements only the generator's dispatch; evaluates IR with native JavaScript operators.
- **Home**: `packages/compiler/conformance/interpreter/`, beside `layer0`, under the `compiler` vitest project,
  never bundled.
- **Gate**: every registry fixture by default, hand-kept refusal allowlist that shrinks; byte-equal container
  HTML including the state script versus the `generateJsSsr` module rendered through the same `renderToString`.
  Allowlists reference the spec sections.
- **Old interpreter**: not ported; rewritten against the linked-plan schema, git history as reference.
