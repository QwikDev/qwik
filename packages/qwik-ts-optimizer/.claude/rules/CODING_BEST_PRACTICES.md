# Coding conventions

Conventions for TS code in this project. These are scoped to *how we
write the optimizer*, not generic JavaScript advice — for the project's
architectural shape and phase structure see OPTIMIZER.md, for workflow
see METHODOLOGIES.md, for the test oracle see CONVERGENCE_FAILURES.md.

These are constraints, not suggestions. "Liberties constrain,
constraints liberate" — the tighter the rules, the less time is spent
re-deciding the same questions and the more consistent the codebase
becomes. When a rule below conflicts with a quick-and-natural way of
writing something, the rule wins.

## Type discipline

The type system is the design surface. Code in this project is
TypeScript that happens to run, not JavaScript that happens to
type-check. The two end up shaped very differently.

### Types come first, implementation follows.

When writing a new function or module, the type signatures are written
first — inputs, outputs, intermediate shapes — and the implementation is
constrained to fit them. The signatures are the design; if they are
awkward or imprecise, the implementation will be too.

A signature like `(input: string, opts?: any) => any` is a non-design
and is not acceptable. A signature like
`(input: SourceText, opts: ExtractOptions) => Result<ExtractedSegment[], ExtractionError>`
is a design the implementation must live up to.

### Illegal states are unrepresentable.

If two fields can never be set at the same time, the type does not
allow them to be set at the same time. If a value goes through phases
(unparsed → parsed → analyzed → emitted), each phase is its own type.
If a function only makes sense after some validation has happened, it
takes the validated type, not the raw one.

The test: by reading the type alone, can you tell what state the value
is in? If no, the type is doing less than it must.

Discriminated unions are the primary tool. This shape:

```typescript
type Extraction =
  | { phase: 'extracted'; body: string; loc: SourceRange }
  | { phase: 'analyzed'; body: string; loc: SourceRange; captures: CaptureName[] }
  | { phase: 'emitted'; output: EmittedSegment };
```

is correct. This shape:

```typescript
type Extraction = {
  body?: string;
  loc?: SourceRange;
  captures?: CaptureName[];
  output?: EmittedSegment;
  phase: string;
};
```

is not. The first form is checkable: a function that takes an
`Extraction & { phase: 'analyzed' }` cannot be called with an
un-analyzed one. The second form is documentation in field names and
prayer at runtime.

### Every variant union has exhaustive dispatch.

For any `switch` or pattern match on a discriminated union, the default
arm asserts exhaustiveness:

```typescript
default: {
  const _exhaustive: never = node;
  throw new Error(`unhandled node type: ${(node as { type?: string }).type}`);
}
```

The `never` assignment is the compile-time guarantee — when a new
variant is added upstream, the compiler points at every site that needs
updating. The runtime throw is the second line of defense for cases
where types lie (FFI, third-party data).

Silently falling through on unknown variants is the worst class of bug
in a compiler: it produces wrong output that looks right. This rule has
no exceptions.

Plain `switch` on a discriminant compiles to a fast jump table and is
the default for AST dispatch. Reach for a pattern-matching library only
when the pattern is genuinely complex (nested destructuring,
multi-discriminant, guards) and the `switch` form is becoming
unreadable. The hot path through the visitor uses plain `switch`.

### Identifier-shaped strings are branded.

If two values are both `string` but mean different things — a symbol
name and a hash, a file path and an import specifier, a display name
and a canonical filename — the compiler cannot help when they get
swapped. They are branded.

```typescript
export type SymbolName = string & { readonly __brand: 'SymbolName' };
export type Hash = string & { readonly __brand: 'Hash' };
export type DisplayName = string & { readonly __brand: 'DisplayName' };
export type CanonicalFilename = string & { readonly __brand: 'CanonicalFilename' };
export type Origin = string & { readonly __brand: 'Origin' };
export type CtxName = string & { readonly __brand: 'CtxName' };
export type RelativePath = string & { readonly __brand: 'RelativePath' };
```

New identifier domains get new brands. The cost is one smart
constructor where the value is born; the benefit is the compiler
refuses to let `(symbol, hash)` be called with arguments swapped.

The `ExtractionResult` metadata table in OPTIMIZER.md lists the fields
where this matters in the current codebase.

### Wide types are not allowed.

`string` is almost never the right type. If the value is one of a known
set of strings, it is a string literal union:
`'lib' | 'segment' | 'inline' | 'hoist'`. If it is a name in a domain,
it is a brand. If it is unvalidated input, it is `unknown` (see below)
or a `RawInput` brand until validation refines it.

Same for `number`. `number` is rarely the right type — `LineNumber`,
`ByteOffset`, `JsxKeyCounterValue` carry meaning that `number` does
not. Every `string` or `number` in a signature is examined to see if
something more specific is meant. It usually is.

### `any` is never the right answer.

`any` is a hole in the type system. There is no situation in this
codebase where `any` is correct. Any introduction of `any` is treated
as a bug to be fixed, not a tradeoff to be accepted.

### Casts are reserved for two narrow purposes.

`as` casts are almost as dangerous as `any`. They are permitted in
exactly two places:

- **Brand constructors.** `s as UserId` inside the smart constructor
  `mkUserId(s: string): UserId`. The cast is the *point* of the
  constructor; everything outside it sees the branded type.
- **The OXC FFI surface**, where values cross from `unknown` after
  their shape has been validated at runtime.

Everywhere else, an `as` is a signal that the types are wrong and need
to be fixed, not bypassed. When a cast looks necessary, the question is
"what type should this be instead of the one I have?" — not "how do I
shut up the compiler?"

`as unknown as Foo` overrides two layers of type protection at once and
belongs only at FFI boundaries with a runtime validation immediately
before it. Its appearance anywhere else is a bug.

### `unknown` is the boundary type. `any` is not.

When data crosses from outside the type system (`JSON.parse`, FFI
return values, file contents), it is `unknown`. `unknown` forces the
caller to narrow before use, which is the whole point. `any` would
bypass it; that is why `any` is not used.

Narrowing is where validation lives. A function
`validateExtractedNode(input: unknown): Result<OxcNode, ValidationError>`
is the boundary's contract. Everything downstream of validation sees
the typed value.

### Protocols are encoded in types.

When code goes through a sequence of operations that must happen in a
specific order, the sequence is encoded in the types. The two-phase
walk protocol (enter gathers, exit acts) is enforced by having
`EnterContext` and `ExitContext` as distinct types, not by passing a
single mutable context and trusting the call order. A function that
tries to emit during enter does not compile.

This is harder than passing one shared mutable context, but the
compiler then enforces the protocol — and a compiler-enforced protocol
is the only kind that survives long-term.

### Mutability is opt-in, not the default.

Function parameters are `readonly` unless the function is explicitly a
builder. Array types are `readonly T[]` (or `ReadonlyArray<T>`) unless
mutation is intentional and local. Object types have `readonly` fields
unless the field is meant to change. `as const` is applied to literal
data that should not change after construction.

The purpose is not paranoia about mutation — it is that `readonly` is
information the compiler can use. A `readonly` parameter says "this
function does not mutate its input"; the compiler enforces that;
callers can rely on it.

The one allowed exception is the `MagicString` accumulator during the
write phase, which is explicitly mutable and explicitly local. No
other shared mutation is acceptable.

### Type relationships are expressed in the type system.

When two types are related (one is the input shape, the other is the
output; one is a key set, the other is a value lookup), the
relationship is expressed with generics, mapped types, or conditional
types rather than being written out twice and hoped to stay in sync:

```typescript
// Wrong: two types that must be kept in sync by hand.
type ExtractionInput = { type: string; loc: [number, number]; /* ... */ };
type ExtractionOutput = { name: string; symbolName: string; /* ... */ };

// Correct: relationship expressed in the type system.
type ExtractionResult<P extends ExtractionPhase> =
  P extends 'extracted' ? ExtractionBase
  : P extends 'analyzed' ? ExtractionBase & { captures: CaptureName[] }
  : P extends 'emitted'  ? ExtractionBase & { captures: CaptureName[]; output: string }
  : never;
```

Adding a field to `ExtractionBase` updates all three phases at once.
Drift is impossible because the types are derived, not duplicated.

The bar for adding genuine complexity here (recursive conditional
types, deeply nested mapped types) is high — they earn their place only
when the alternative is a bug-prone manual duplication. The simple
forms (generics, basic mapped types, conditional types one level deep)
are the default.

### `Partial<T>` is not a substitute for designing the input.

`Partial<T>` is occasionally the right type — config objects with
defaults, builder intermediate states. It is frequently a shortcut for
"I did not want to think about which fields are actually optional, so I
made all of them optional." That shortcut produces code where every
function defensively checks `if (x.foo)` for fields that are
conceptually required.

If a function needs some fields and not others, its parameter type is
exactly those fields — `Pick<T, 'a' | 'b'>` if extracting from an
existing type, or a fresh interface if not. Not
`Partial<EverythingTheCallerHas>`.

## Error handling

### Errors are values returned, not exceptions thrown.

For anything that can fail recoverably, the function returns a result
type:

```typescript
type Result<A, E> = { ok: true; value: A } | { ok: false; error: E };
```

Thrown exceptions are reserved for **defects** — invariants believed to
be unviolable (e.g. the `_exhaustive: never` case above). A `throw` is
a statement that this situation is a bug, not a runtime condition the
caller should handle.

Diagnostics that map to SWC diagnostic codes (C02, C05, etc. — see
`==DIAGNOSTICS==` in snapshots) are recoverable errors and belong in
return types.

### The FFI boundary is the validation point.

Anything coming back from OXC or any other Rust component crosses an
untyped boundary at runtime — TypeScript cannot enforce the type on the
other side. At that boundary, the shape is validated (manually or with
a schema library) before the value flows into the rest of the
codebase. After the boundary, the types are trusted.

## AST handling

### Parse once. Reuse the AST.

After OXC parses input into an AST, every downstream pass operates on
that AST. A subset of the input is never re-parsed to inspect a body, a
closure, or an attribute — the original AST already contains it. Per
OSS-353, closure AST nodes are threaded through `extractSegments` via a
`closureNodes` map exactly to avoid per-extraction re-parses.

If a downstream pass needs to look at a sub-tree, it is handed the node
directly.

### Output is the magic-string accumulator, not a rebuilt AST.

Codegen is not done by walking a target AST and printing. Per
DESIGN.md, transformations are held as a virtual representation and
applied at the end with magic-string. This avoids the
printer-exhaustiveness trap and keeps source maps trivial.

Mutation is confined to the `MagicString` instance during the write
phase. Transformation passes themselves produce values — descriptions
of edits, new metadata, new bindings — not mutations of shared state.

### `walk` runs once per tree.

Once inside a `walk`, a second `walk` is not started over the same
subtree from a child handler. The outer walk reaches those nodes
itself; doing the work then is correct and cheaper.

If two passes both need to walk the AST, they either run in sequence as
separate top-level walks, or compose into one walk that gathers both
sets of information.

### Enter gathers. Exit acts.

The `enter` phase of a walk is information-gathering only — collect
captures, record positions, identify candidates. The `exit` phase is
where edits are emitted, segments are extracted, and decisions are
applied. This ordering is what makes per-node decisions visible to
their ancestors before the ancestor finalizes.

## Functions

### Pure functions returning new values.

Transformation passes are functions: input in, output out, no mutation
of shared state. The two exceptions are:

- The `MagicString` accumulator during the final write.
- Local mutation inside a function (a counter, a builder, an array
  being populated before return). Locality is the qualifier — a
  `let i = 0` inside a function body is not shared state.

A function that takes a context object and mutates fields on it is
refactored to return a new context (or a partial update) instead.

### Function length is not the metric.

A 60-line `switch` with one arm per AST node type is not a "long
function" — it is a flat function that handles all the cases in one
place. Splitting it into eleven two-line helpers obscures the
exhaustiveness check and forces the reader to chase indirection. Flat
dispatch stays flat.

What is split out: distinct *operations*. The 9-phase sequencer in
`generateSegmentCode` is the model — each phase is its own named
function because each phase is its own concern.

### No nested ternaries.

A single ternary is fine: `const x = cond ? a : b`. Stacking them is
not: `const x = cond1 ? cond2 ? a : b : c` forces the reader to unwind
operator precedence to figure out which branch produces which value,
and that effort scales worse than line count.

Rule: at most one `?:` per expression. For two-or-more conditions,
write a `let` + procedural `if` block. Each guard then reads top-to-
bottom as its own statement, and the path through the code is visible
without precedence reasoning:

```typescript
// Not this:
const devOptionsForCall = jsxBodyOptions.devOptions
  ? jsxBodyOptions.source != null
    ? { ...jsxBodyOptions.devOptions, sourcePosition: {...} }
    : jsxBodyOptions.devOptions
  : undefined;

// This:
let devOptionsForCall = jsxBodyOptions.devOptions;
if (devOptionsForCall && jsxBodyOptions.source != null) {
  devOptionsForCall = {
    ...devOptionsForCall,
    sourcePosition: { ... },
  };
}
```

The same applies when a single-level ternary's branches contain large
inline object literals — even one level deep, if either operand is a
multi-line expression, prefer the procedural form. Inline ternaries are
for single-line, single-condition selection.

## What this codebase does not do

A few patterns from broader JS/TS practice that are not used here,
listed so Claude Code does not reach for them by default:

- **Class hierarchies for AST nodes or passes.** OXC's AST is data
  (discriminated unions). Passes are functions.
- **Visitor pattern in the Babel / OOP sense** (register handlers per
  type on a stateful visitor). Plain recursive functions or oxc-walker
  with the enter/exit contract above are used instead.
- **`null` as absence.** `T | undefined` is used for optionality at the
  TS level. (Or a `Result` for failure.)
- **Throwing for control flow.** Errors are values.
- **Mutating shared context objects to communicate between passes.**
  Threading explicit values is more verbose and more visible. The
  visibility is the point.
- **Defensive `any` or `as` casts to make the compiler stop
  complaining.** When the compiler is complaining, the types are
  wrong; they get fixed, not bypassed.

# Code Parsing and AST Handling

## Should only ever parse once.

Once you have an AST from parsing, always reuse it instead reparsing a
subset of the original raw input.

## Avoid `walk`ing more than once.

Once you are walking an AST you should avoid actively walking
additional subtrees as this is duplicated work — the `walk` will
eventually make it to that subtree. Once there, any logic that was
being implemented can be executed now.

## Consider the `enter` phase of a `walk` as information gathering only.

When walking an AST, the enter phase should be used to gather all the
information needed to make changes but should not implement any changes
itself. That should be part of the exit phase.

## Consider the `exit` phase the working phase.

The `exit` phase of the walk is where we take all the information
gathered during the `enter` phase and make the appropriate changes,
segment extractions, etc.
