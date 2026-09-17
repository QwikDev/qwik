# Self-referential assignment in render results: diagnostic or fixpoint
Type: grilling
Status: resolved
Blocked by:

## Question

`link/render-results.ts` overflows the stack on `x.value = x.value.filter(...)` (research 16, four
real-app files) because `evaluate` and `readBinding` recurse through the binding's own assignment.
Decide: treat a self-referential assignment as a fixpoint (the value's kind set is closed under its
own mutation, which the monotone query design already implies for cycles) or diagnose it. The fix
lands in `evaluate` after the responsibility-map split. Also decide the general rule for any query
cycle through an assignment, not only `.filter`.

## Answer

Resolved 2026-09-17 (Varixo accepted; research 27 supplied the shape).

- **Rule**: a query cycle through an assignment is a fixpoint, never a diagnostic. A binding's kind set is the
  least fixed point over its initializer and every write; the re-entry cache returns the partial result.
- **Fix**: in `readBinding` (lands in `evaluate.ts` after the split), guard the infix growth the reproduction
  found: same binding, same head and tail, strictly longer middle (`writePrefix ++ [method, #return] ++ suffix`)
  answers `Unknown`; plus a small hard depth cap on the query path as backstop, so any unbounded growth
  collapses to `Unknown` instead of overflowing.
- **Reporting**: silent. `Unknown` is the documented conservative answer; the cost is a content range instead of a
  text effect.
- **Proof**: research 27's five minimal inputs become `render-results.unit.ts` cases (finite `Unknown` or precise
  kind), the control `{items.value}` keeps its kind, and the cutover sweep covers the four real-app files.
