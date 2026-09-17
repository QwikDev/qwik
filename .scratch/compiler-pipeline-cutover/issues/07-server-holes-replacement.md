# What replaces each server-reachable Js body
Type: grilling
Status: resolved
Blocked by:

## Question

No-holes wins on the server side (Q3a). For each producer from ticket 06 decide: lower to IR
(which node, new or existing), or require a plugin claim, or keep as Js for JS-only builds and
fail the link under a native target. Define the native-target link diagnostic (code, message,
where it is raised) and the gate that proves the artifact from ticket 05 has zero Js bodies on
the server reachability set for the e2e apps. Browser-reachable bodies stay JS text.

Research 06 adds a fourth kind, `ExprKind.Js` (480 hits), and shows `SetupKind.Js` is the statement hole (`if`/`try`/`return`/assignment). DESIGN's "no statement IR" and the no-holes rule collide here; decide the statement form, the expression-IR widening order (which `ExprKind.Js` producers are cheapest to lower), and drop the orphan payloads `lowerComputedExpressionValue`/`lowerInlineExpressionValue` push when IR wins.

## Answer

Resolved 2026-09-17 (Varixo accepted; research 06 and 19 supplied the inventory and the order).

- **Partition**: server-reachable = whatever the linker's use-edge reachability reaches from a server root:
  setup statements, render expressions, `useComputed$`/`useTask$`/`useSerializer$`/custom-hook callback
  bodies, module-level helpers reached from render, lifted local functions called during setup. All
  client-only code (element `on*$` handlers, `useVisibleTask$`, `sync$`, `$()` nested under them) stays JS text
  forever. Computed at link time, never per file.
- **IR beside text**: a lowered body carries its IR *and* its authored range. JS generators keep slicing
  authored text (group 1's "authored JavaScript stays JavaScript" holds, snapshots stay byte-stable);
  native readers use the IR. IR fidelity is proven by a **reference interpreter in tests** evaluating the
  LinkedPlan for the fixture corpus and requiring HTML identical to `generateJsSsr` (precedent:
  `conformance/layerA/interpret-plan.ts`).
- **Expression vocabulary**, in order of yield: (0) `localReadIr` returns IR for const/mutable/signal/store/
  loop locals and module bindings, not only row-index/prop-member (>50 % of holes); (1) literals, object/
  array, then the operators the value-ir already names (unary, binary, logical, conditional, template,
  index, optional chain); (2) calls: `qwik:` internal-plugin ops for the small stdlib surface actually seen
  (`String`, `JSON.stringify`, `console.log`, `.map/.filter/.join`, `Math.*`), `DefCall` for a module-local
  function whose body lowers, `PluginCall` for a claimed import (router `$`-family markers are claims by
  construction); (3) `await` as an expression node carrying the `_await` restoration point, allowed only
  inside `FnBody`. Anything else is a hole.
- **Statement IR**: structured subset only: block, `if`/`else`, `try`/`catch`/`finally`, `return`, `throw`,
  expression statement, assignment to a local / a `.value` / a store member, plus the existing declaration
  arms. Loops and `switch` stay refused. `SetupKind.Js` → `SetupKind.Statement` beside its range.
- **Function bodies**: one `FnBody { params, statements }` for computed, task, hook and lifted-function
  bodies (the `lowerKeyBody` envelope). Delete dead schema: `TaskBody`, `TaskStep`, `QrlBodyKind.Task`,
  `HookBodyKind.Js`. Drop the orphan payloads pushed when IR wins.
- **Switch**: the analyser keeps producing holes; `Specialization.jsHoles: 'allow' | 'forbid'`; under
  `forbid` the linker emits `js-hole` (construct + range) for every server-reachable hole and it fails
  completeness (taint rule: ticket 18). Ticket 05's artifact gate runs `forbid` over the e2e apps. The
  always-text payloads (parameter patterns, props parts, dynamic css, module helpers) fold into the same IR
  and switch.
