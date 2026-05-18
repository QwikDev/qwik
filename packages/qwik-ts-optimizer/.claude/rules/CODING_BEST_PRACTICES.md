# Coding conventions

Conventions for TS code in this project. These are scoped to *how we write
the optimizer*, not generic JavaScript advice — for the project's
architectural shape and phase structure see OPTIMIZER.md, for workflow see
METHODOLOGIES.md, for the test oracle see CONVERGENCE_FAILURES.md.

## Type discipline

### No `any`. No casts except at the OXC boundary.

Use discriminated unions (`{ type: 'X', ... } | { type: 'Y', ... }`) for
anything with variants. Narrow with `switch (node.type)` or — when the
pattern is genuinely complex (nested, multi-discriminant, guards) —
`ts-pattern`. Plain `switch` on a discriminant compiles to a fast jump
table; the hot path through the AST visitor should prefer it.

The two places casts are legitimate:
- Brand constructors (see below) — `s as UserId` inside a smart constructor.
- The OXC FFI surface, where types we've validated cross from `unknown`.

Everywhere else, an `as` is a code smell.

### Make exhaustiveness fail loudly.

For any `switch` or pattern match on a discriminated union, terminate with:

```typescript
default: {
  const _exhaustive: never = node;
  throw new Error(`unhandled node type: ${(node as { type?: string }).type}`);
}
```

The `never` assignment is the compile-time guarantee — when a new variant is
added upstream (e.g. an OXC AST node type), the compiler points at every
site that needs updating. The runtime throw is the load-bearing second
line of defense for the cases where types lie (FFI, third-party data).

Silently falling through on unknown variants is the worst class of bug in
a compiler: it produces wrong output that looks right.

### Brand identifier-shaped strings.

When the same `string` type carries values from disjoint domains, the
compiler can't help when they get swapped. Use branded types for any
identifier-like field that appears in the optimizer's interfaces:

```typescript
export type SymbolName = string & { readonly __brand: 'SymbolName' };
export type Hash = string & { readonly __brand: 'Hash' };
export type CanonicalFilename = string & { readonly __brand: 'CanonicalFilename' };
export type DisplayName = string & { readonly __brand: 'DisplayName' };
export type Origin = string & { readonly __brand: 'Origin' };
```

The cost is one constructor call where the value is born. The benefit is
that `symbolName` and `hash` can no longer be transposed in a function
signature without the compiler refusing.

The OPTIMIZER.md metadata table lists the fields where this matters.

## Error handling

### Errors are values returned, not exceptions thrown.

For anything that can fail recoverably, return a result type:

```typescript
type Result<A, E> = { ok: true; value: A } | { ok: false; error: E };
```

Thrown exceptions are reserved for **defects** — invariants we believe
cannot be violated (e.g. the `_exhaustive: never` case above). If we
throw, we are saying "this is a bug, not a runtime condition."

Diagnostics that map to SWC diagnostic codes (C02, C05, etc. — see
`==DIAGNOSTICS==` in snapshots) are recoverable errors and belong in
return types.

### The FFI boundary is where we validate.

Anything coming back from OXC or any other Rust component crosses an
untyped boundary at runtime — TypeScript can't enforce the type on the
other side. At that boundary, validate the shape (manually or with a
schema library) before letting the value flow into the rest of the
codebase. After the boundary, trust the types.

## AST handling

### Parse once. Reuse the AST.

After OXC parses input into an AST, every downstream pass operates on
that AST. **Never re-parse a subset of the input** to inspect a body, a
closure, or an attribute — the original AST already contains it. Per
OSS-353, closure AST nodes are threaded through `extractSegments` via a
`closureNodes` map exactly to avoid per-extraction re-parses.

If a downstream pass needs to look at a sub-tree, it gets handed the node
directly.

### Output is the magic-string accumulator, not a rebuilt AST.

We do not codegen by walking a target AST and printing. Per DESIGN.md, we
hold transformations as a virtual representation and apply them at the
end with magic-string. This avoids the printer-exhaustiveness trap and
keeps source maps trivial.

Mutation is confined to the `MagicString` instance during the write
phase. Transformation passes themselves produce values — descriptions
of edits, new metadata, new bindings — not mutations of shared state.

### `walk` once per tree.

Once we are inside a `walk`, we do not start a second `walk` over the
same subtree from a child handler. The outer walk will reach those nodes
itself; doing the work then is correct and cheaper.

If two passes both need to walk the AST, they either:
- Run in sequence as separate top-level walks, or
- Compose into one walk that gathers both sets of information.

### Enter gathers, exit acts.

When walking, the `enter` phase is information-gathering only — collect
captures, record positions, identify candidates. The `exit` phase is
where edits are emitted, segments are extracted, and decisions are
applied. This ordering is what makes per-node decisions visible to
their ancestors before the ancestor finalizes.

## Functions

### Pure functions returning new values.

Transformation passes are functions: input in, output out, no mutation
of shared state. The two exceptions are:

- The `MagicString` accumulator during the final write.
- Local mutation inside a function (a counter, a builder, an array being
  populated before return). Locality is the qualifier — a `let i = 0`
  inside a function body is not shared state.

If a function takes a context object and mutates fields on it, prefer
returning a new context (or a partial update) instead.

### Function length is not the metric.

A 60-line `switch` with one arm per AST node type is not a "long
function" — it's a flat function that handles all the cases in one
place. Splitting it into eleven two-line helpers obscures the
exhaustiveness check and forces the reader to chase indirection. Keep
flat dispatch flat.

What we do split out: distinct *operations*. The 9-phase sequencer in
`generateSegmentCode` is the model — each phase is its own named
function because each phase is its own concern.

## What this codebase does not do

A few patterns from broader JS/TS practice that we don't use, listed here
so Claude Code doesn't reach for them by default:

- **Class hierarchies for AST nodes or passes.** OXC's AST is data
  (discriminated unions). Passes are functions.
- **Visitor pattern in the Babel / OOP sense** (register handlers per
  type on a stateful visitor). We use plain recursive functions or
  oxc-walker with the enter/exit contract above.
- **`null`-as-absence.** Prefer `T | undefined` for optionality at the
  TS level. (Or a `Result` for failure.)
- **Throwing for control flow.** Errors are values.
- **Mutating shared context objects to communicate between passes.**
  Threading explicit values is verbose but visible.