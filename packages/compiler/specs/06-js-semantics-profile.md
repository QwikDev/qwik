# 06 — JS Semantics Profile

Status: freeze spec (pins the JavaScript-observable semantics every engine must reproduce).
Only semantics observable in emitted bytes are pinned — engines are otherwise free.

Each HIGH RISK item gets a dedicated Layer-0 conformance corpus
([08-conformance.md](./08-conformance.md)) generated from the JS engine before any native code is
written.

This document binds **both implementation layers** of an engine
([02-expression-ir.md](./02-expression-ir.md) defines the split): operator/coercion/number/JSON/
string semantics and the value domain are implemented in the **runtime core** (every IR node
evaluation depends on them); call-shaped ops (`toFixed`, `JSON.stringify`, `String()`, `Math.*`,
…) are implemented by **internal plugins**, which delegate to the core's primitives — one
number-formatter and one JSON writer per engine, never parallel implementations that can drift.
Conformance corpora test behavior regardless of which layer implements it.

## Numbers — HIGH RISK

- All arithmetic is IEEE-754 binary64 (`f64`). No integer fast paths that change observable
  results.
- Number→string is ECMA-262 `Number::toString` (7.1.12.1): shortest round-trip digits, exponent
  notation for magnitude ≥ 1e21 and < 1e-6, `-0` prints `"0"`.
- `0.1 + 0.2` must render `0.30000000000000004`.
- Known-good implementations: V8 (oracle), `ryu-js` crate (Boa's port) for Rust. Do not hand-roll
  and do not use the language's default float formatting (`format!("{}")` in Rust and Go's
  `strconv` differ from JS on exponent thresholds).
- Corpus: 10k doubles (bit patterns → expected strings), JS-generated.

## `toFixed` — HIGH RISK

ECMA-262 `Number.prototype.toFixed` algorithm, not native rounding: `(0.615).toFixed(2)` is
`"0.61"`. Ship the algorithm in the `qwik:number` internal plugin; corpus-tested.

## JSON bytes — HIGH RISK

Where an engine produces JSON that reaches the wire (state payloads, plan canonical form):

- Property order = JS own-property order: **integer-like keys in ascending numeric order first,
  then string keys in insertion order**. This bites any implementation using a plain
  insertion-ordered map when user state contains numeric-string keys.
- No spacing. ES2019 well-formed output (lone surrogates escaped as `\uXXXX`). ` `/` `
  are NOT escaped.
- Serdes-layer string rules (raw-vs-stringify, `</` rewriting) are in
  [04-state-serialization.md](./04-state-serialization.md) and take precedence inside state
  payloads.

## Strings

- JS string semantics are UTF-16: `.length` and indexing count UTF-16 code units.
- Policy: **well-formed UTF-16 only.** A lone surrogate reaching serialization is an error in
  every engine (including JS — a new fail-closed check), rather than requiring WTF-8 support in
  native engines. Phase 0 validation strengthened the case: today's JS output is already
  self-inconsistent — lone surrogates serialize raw in single state scripts but as `\udXXX`
  escapes in chunked ones (the emitter re-encodes chunks via `JSON.parse`/`JSON.stringify`; see
  [04-state-serialization.md](./04-state-serialization.md) "Chunked re-encoding trap").

## Coercion table (`String(v)` / template interpolation)

| input                                 | output                                                                                                                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undefined` / `null` in text position | empty text (matches today's emitted `value == null ? '' : String(value)`)                                                                                                                                            |
| boolean                               | `"true"` / `"false"`                                                                                                                                                                                                 |
| number                                | per Numbers above                                                                                                                                                                                                    |
| array                                 | comma-join of coerced elements; `null`/`undefined` elements → `''`                                                                                                                                                   |
| plain object                          | `"[object Object]"`                                                                                                                                                                                                  |
| Date                                  | **compile error under `nativeTarget`** (`native-date-tostring`) — per-language `Date.toString()` differs and the browser would repaint the JS format on first update; require `qwik:date.toISOString` or a formatter |
| function / symbol                     | unreachable (compile-time rejected)                                                                                                                                                                                  |

## Truthiness, equality, operators

- ToBoolean: JS-exact — falsy set is `false, 0, -0, NaN, '', null, undefined`.
- `===` / `!==`: strict equality incl. `NaN !== NaN`, `+0 === -0`; objects/arrays by reference.
- `==` / `!=`: full JS abstract equality **for primitive operands only**. An object/array/Date
  operand at runtime is an SSR error; the compiler warns (`native-loose-eq`) and suggests `===`.
  This replaces silently treating `==` as `===`.
- `+`: JS rules on primitives (string operand → concatenation, else numeric addition after
  ToNumber). Non-primitive operand → runtime error (same rationale as `==`).
- `??` distinguishes null/undefined from all other values; the value domain preserves the
  undefined/null distinction end-to-end.
- `typeof` returns the JS strings for the representable domain
  (`undefined boolean number string object function` — `function` only reachable for
  plugin-produced opaque values that declare it).
- Non-optional member/index access on null/undefined → runtime error (TypeError analogue);
  optional chaining yields undefined.

## Nondeterminism

`Math.random`, and `Date.now`/`qwik:date.now` in **render position** (text, attributes, branch
tests, collection sources, keys) are compile errors under `nativeTarget`
(`native-nondeterministic`): Suspense re-render waves evaluate render expressions more than once
per request. Both remain legal inside setup initializers (`op:'signal'`/`op:'store'`/`op:'const'`
init) and `TaskBody` steps, which run once per request.

## HTML escaping

Frozen in [05-wire-contract.md](./05-wire-contract.md), and it is **two layers**: dynamic values
escape `& < > " '` at render time, while compile-time statics arrive in the plan pre-escaped
with the _narrower_ `& < >` (+`"` in attributes, never `'`) profile — the same value produces
different bytes static vs dynamic, and engines must not "fix" either direction.

## Value domain (engine-internal, normative for observable behavior)

`undefined | null | boolean | f64 | string(UTF-16) | array | object(JS property order) | Date |
Signal | Store | Opaque`.

- `Signal`/`Store` are references into the request's state arena — first-class values (they can
  be passed as props, held in arrays, serialized as TypeIds 30/35). A `member` read of `"value"`
  on a `Signal` value is a **subscribing read** (records the effect subscription and unwraps),
  identical to the JS proxy getter; property reads on a `Store` value behave likewise. This is
  what makes generic reads correct when static signal-proof is unavailable
  ([02-expression-ir.md](./02-expression-ir.md)).
- `Opaque` values are produced and consumed only by plugins (e.g. `qwik:url` values); the core
  can store and pass them but never coerces them (coercion attempts are runtime errors with the
  plugin's type name in the message).
