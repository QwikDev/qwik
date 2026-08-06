# 02 — Expression IR (`ValueIR`)

Status: design (approved direction, pre-implementation). See [specs/README.md](./README.md).

## Purpose

Today every expression in the compiler's plans is a `SourceRange` — a byte-offset pair the
emitter slices out of the original TSX (`emit-ssr.ts` `expression()`). `ValueIR` replaces those
leaves with a structured, JSON-serializable, language-neutral expression tree that generators
compile to native expressions. The IR is expression-only — no statements, no assignment, no loops
— so evaluation is pure by construction, which keeps streaming re-renders safe.

Where it plugs in: `SemanticLowerer.createValue()` (`src/semantic-lower.ts`) attaches an optional
`ir` to the existing `ValuePlan` variants. The classification basis already exists:
`classifyDynamicOutput()` walks exactly the node set below, and per-binding facts
(`signalBindings`, `initialOnlyBindings`, `sourceOutputs`, `functionBindings`,
`compilerStringBindings`) distinguish the read forms.

## Node set

```ts
type ValueIR =
  | { k: 'lit'; v: string | number | boolean | null }
  | { k: 'undef' } // JSON cannot carry undefined
  | { k: 'signal-read'; place: PlaceIR } // signal.value
  | { k: 'store-read'; place: PlaceIR; path: (string | ValueIR)[] }
  | { k: 'prop-read'; name: string; path: (string | ValueIR)[] }
  | { k: 'local-read'; id: LocalId } // setup const bindings
  | { k: 'row-item'; depth: number }
  | { k: 'row-index'; depth: number }
  | { k: 'member'; obj: ValueIR; name: string; optional?: true }
  | { k: 'index'; obj: ValueIR; key: ValueIR; optional?: true }
  | { k: 'unary'; op: '!' | '-' | '+' | 'typeof'; a: ValueIR }
  | { k: 'bin'; op: BinOp; a: ValueIR; b: ValueIR }
  | { k: 'logic'; op: '&&' | '||' | '??'; a: ValueIR; b: ValueIR } // short-circuit
  | { k: 'cond'; test: ValueIR; then: ValueIR; else: ValueIR }
  | { k: 'untrack'; expr: ValueIR } // evaluate subtree without recording subscriptions
  | { k: 'template'; parts: (string | ValueIR)[] }
  | { k: 'array'; items: ValueIR[] }
  | { k: 'object'; entries: [string, ValueIR][] }
  | { k: 'var'; name: string; path: (string | ValueIR)[] } // lambda param, innermost wins
  | { k: 'call'; fn: string; args: (ValueIR | LambdaIR)[] } // 'qwik:<ns>.<op>' or plugin fnId
  | { k: 'def-call'; def: number; args: ValueIR[] }
  | { k: 'js-fallback'; src: string }; // JS generator only; native = compile error

type BinOp =
  | '==='
  | '!=='
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '**';

interface LambdaIR {
  params: string[]; // plain identifiers only (v1: no destructuring/defaults/rest)
  body: ValueIR; // expression body, or single-`return` block unwrapped
}

type PlaceIR =
  | { kind: 'local'; id: LocalId }
  | { kind: 'prop'; name: string }
  | { kind: 'row-item'; depth: number };
```

Design notes:

- The three read forms (`signal-read` / `store-read` / `prop-read`) are distinct because they have
  different reactivity semantics and different serialization consequences (Signal TypeId 30 vs
  Store 35/StoreProp records vs props); the compiler already proves them apart.
- **Typed reads are proven fast paths, never semantic requirements.** `signal-read`/`store-read`
  may be emitted only when the compiler has proof:
  - locals — the slot's setup opcode declares the type (`useSignal`/`useStore` recognized by
    `BindingId`, never by name). In v3 this is the **only** creation channel: reactive state
    cannot be exported from a module ([01-ssr-plan-format.md](./01-ssr-plan-format.md)
    "Cross-module facts"), so imports are never signals;
  - props/context/captures/function results — signals arriving through these channels are
    unproven per-module and use the generic read below; the linked plan knows every
    instantiation's prop kinds, so per-call-site monomorphization is a possible later
    optimization.

  Anything unproven lowers to a generic `member {obj, name: 'value'}` read, which is **still
  correct**: the runtime `Value` domain includes `Signal`/`Store` variants
  ([06](./06-js-semantics-profile.md)), and a `member` read of `"value"` on a Signal-valued
  `Value` is defined as a subscribing read — identical to the JS proxy getter, so subscriptions
  and serialized TypeIds match regardless of static knowledge. Emitting a typed read on a guess
  is the only forbidden direction.

- `untrack` is lowered from the core `untrack()` import (recognized by `BindingId`, thunk
  argument unwrapped like a lambda body). Semantics mirror `core/reactive/tracking.ts`: the
  subtree evaluates with subscription recording suppressed (null collector) — subscribing reads
  return current values but record no `EffectSubscription` and contribute nothing to an
  enclosing computed's `deps`. This is observable in serialized bytes (missing subscription/dep
  records), so engines must implement it exactly; nesting is idempotent. Suppression is
  **ambient (dynamic extent), not lexical** — it applies through lambda bodies and `def-call`s
  evaluated within the subtree, exactly like the runtime's collector stack
  (`runWithCollector`); conversely, reads inside a lambda evaluated within a tracking context do
  subscribe. It is a core node, not a plugin op, because it changes evaluation semantics rather
  than computing a value from arguments. Since every `TaskStep` value position is a `ValueIR`,
  `untrack` needs no statement-level twin ([03-setup-opcodes.md](./03-setup-opcodes.md)).
- `js-fallback` is a first-class node so the native-readiness report is a trivial tree walk and
  the plugin namespace stays clean.
- Lambdas are legal only as direct arguments to higher-order ops (`qwik:array.filter` etc.) or
  plugin calls; they are non-recursive and pure by construction (nothing in the IR can name a
  lambda or write state).

## Core vs internal plugins

The IR itself defines only **core semantics**: operators, coercions, truthiness, equality,
short-circuiting, template interpolation, member/index reads, and number-to-string
([06-js-semantics-profile.md](./06-js-semantics-profile.md)).

**Everything call-shaped goes through plugin dispatch.** The compiler lowers method and global
calls to `call` ops in the reserved `qwik:` namespace, implemented by **internal plugins** that
ship with every engine ([09-compiler-plugins.md](./09-compiler-plugins.md)). The runtime core
never grows a stdlib; extending the builtin surface means adding another internal plugin.

v1 default internal-plugin set (semantics pinned in 06):

| Namespace                    | Ops                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `qwik:string`                | `trim trimStart trimEnd toUpperCase toLowerCase startsWith endsWith split replaceAll(string pattern only) padStart padEnd repeat charAt` |
| `qwik:seq` (string \| array) | `includes indexOf slice at concat`                                                                                                       |
| `qwik:number`                | `toFixed` (ECMA-262 algorithm — not native formatting)                                                                                   |
| `qwik:array`                 | `join flat(depth 1) from filter map find findIndex some every` (higher-order take a `LambdaIR`)                                          |
| `qwik:math`                  | `abs floor ceil round trunc min max sign sqrt`                                                                                           |
| `qwik:object`                | `keys values entries`                                                                                                                    |
| `qwik:json`                  | `stringify` (1-arg)                                                                                                                      |
| `qwik:global`                | `String Number Boolean parseInt parseFloat encodeURIComponent decodeURIComponent`                                                        |
| `qwik:date`                  | `toISOString getTime now`                                                                                                                |
| `qwik:url`                   | `URL`/`URLSearchParams` as opaque host values (`new`, `searchParams.get`, `href`, `pathname`, …)                                         |
| `qwik:fetch`                 | host-backed request (used from `TaskBody`/plugins, not render position)                                                                  |

Dispatch is by receiver runtime type, mirroring JS prototype dispatch; an op applied to a type
with no entry is an SSR runtime error (the JS TypeError analogue). `.length` is a `member` read,
pinned on string (UTF-16 code units) and array.

Excluded from v1, each with a targeted diagnostic suggesting a rewrite, a computed, or a plugin:
`reduce`, `sort`/`toSorted`, regular expressions, all `toLocale*`, `Math.random` (nondeterminism)
and bare `Date` string coercion (see 06). Any of these can later become another internal plugin
without touching core.

## `defs` — auto-lowered user helpers

Module-scope user functions whose bodies are single-expression IR-lowerable are collected into
the plan's `defs` table and invoked via `def-call`:

```ts
interface DefEntry {
  params: string[];
  body: ValueIR;
}
```

Constraints: acyclic call graph, no state writes, no captures beyond module-scope constants that
themselves fold. **Implemented** (`src/defs-lower.ts`, v0 scope): simple identifier params,
`return expr` or expression-arrow bodies, reads restricted to params and earlier defs; module
plans carry a per-module `defs` table and `def-call` resolves by table index. This is what keeps realistic apps pluginless — helper patterns like
`visibleTodos(todos, filter)` or predicate tables (`FILTERS[todos.filter]` passed to
`qwik:array.filter`) lower without any user plugin. Multi-statement helpers remain
plugin-or-fallback.

## Semantics requirements (summary — normative tables in 06)

- Truthiness, `===`, `+`, `??`, ToNumber/ToString: JS-exact per 06.
- `==`/`!=`: full JS abstract equality **for primitive operands**; an object/array/Date operand
  at runtime is an SSR error (`native-loose-eq` warns at compile time). Explicit restriction
  instead of silently treating `==` as `===`.
- Non-optional `member`/`index` on null/undefined: SSR runtime error (JS TypeError analogue),
  surfacing exactly where today's emitted JS would throw. `optional: true` yields undefined.
- Bare `Date` in string position: compile error under `nativeTarget` — require
  `qwik:date.toISOString` or an explicit formatter. Per-language native `Date.toString()` output
  differs and the browser would repaint the JS format on first update.
- Evaluation is a pure function of (state snapshot, row scope, lambda environment) — required by
  Suspense re-render waves.

## Example lowerings

`{count.value}`:

```json
{ "k": "signal-read", "place": { "kind": "local", "id": 0 } }
```

`list.value.length === 0`:

```json
{
  "k": "bin",
  "op": "===",
  "a": {
    "k": "member",
    "obj": { "k": "signal-read", "place": { "kind": "local", "id": 1 } },
    "name": "length"
  },
  "b": { "k": "lit", "v": 0 }
}
```

`rows.filter((row) => row.id !== 'hidden')` as a `@for`/collection source:

```json
{
  "k": "call",
  "fn": "qwik:array.filter",
  "args": [
    { "k": "signal-read", "place": { "kind": "local", "id": 2 } },
    {
      "params": ["row"],
      "body": {
        "k": "bin",
        "op": "!==",
        "a": { "k": "var", "name": "row", "path": ["id"] },
        "b": { "k": "lit", "v": "hidden" }
      }
    }
  ]
}
```

A call into an imported user module (`formatMoney(price)`) with a user plugin claiming it:

```json
{
  "k": "call",
  "fn": "plugin:src/format:formatMoney",
  "args": [{ "k": "store-read", "place": { "kind": "local", "id": 3 }, "path": ["price"] }]
}
```
