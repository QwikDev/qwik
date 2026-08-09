# Engine requirements

What any SSR engine — the JS one, the Rust one, a future Go one — must do. Each line is a
requirement stated as observable behaviour, plus where it is checked today. `—` means nothing
checks it directly; it may still be exercised incidentally by a whole-app fixture.

Derived from specs 01–09 and the wire vocabularies as they exist in source: `ValueIrKind`
(`src/expr-ir.ts`), `SetupOpKind` (`src/setup-ir.ts`), `SsrOpKind` (`src/emit-plan-ssr.ts`), the
segment kinds in `src/plan-types.ts`, and the layer-0 corpora.

Observables, in order of preference: **rendered bytes**, **serialized state**, **a named failure**,
**the generated project builds**. Never the shape of emitted source.

## 1. Value semantics (layer 0)

Engine-level primitives with a JSON corpus each; these are the only tests that may assert on a
function directly, because the function _is_ the contract.

| #   | requirement                                                                       | checked by        |
| --- | --------------------------------------------------------------------------------- | ----------------- |
| V1  | numbers render as JS renders them, including exponent thresholds and `-0`         | `numbers.json`    |
| V2  | `toFixed(n)` matches JS for the full digit range                                  | `tofixed.json`    |
| V3  | text and attribute escaping match the compiler's profile (`& < > "`, no `'`)      | `escape.json`     |
| V4  | value→text coercion matches JS (`null`, `undefined`, arrays, objects, `Date`)     | `coerce.json`     |
| V5  | `JSON.stringify` byte output matches, including surrogate handling                | `json-bytes.json` |
| V6  | the state serializer is byte-identical to the JS serializer for every value shape | `serdes.json`     |

## 2. Serialized state

| #   | requirement                                                            | checked by                 |
| --- | ---------------------------------------------------------------------- | -------------------------- |
| S1  | values reachable from the render tree are written into `qwik/state`    | layer-A goldens            |
| S2  | a value referenced twice serializes once, with a back-reference        | —                          |
| S3  | cycles serialize without recursing forever                             | —                          |
| S4  | a signal serializes with its subscriber list as recorded during render | `signal-counter`           |
| S5  | a store serializes with its tracked props                              | `store-bind`               |
| S6  | a QRL serializes as chunk + symbol + captures                          | `signal-counter`           |
| S7  | a context scope serializes as parent + key/value pairs                 | `context`                  |
| S8  | a projection serializes so slots resume in place                       | `slot-projection`          |
| S9  | a component-tagged function serializes as its QRL                      | `local-component-captured` |
| S10 | `EMPTY_ARRAY` keeps flyweight identity                                 | —                          |
| S11 | root ordering is stable across runs given the same instance hash       | layer-A goldens            |

## 3. Render program (`SsrOpKind`)

| #   | requirement                                                                    | checked by                         |
| --- | ------------------------------------------------------------------------------ | ---------------------------------- |
| R1  | `static` emits its bytes verbatim, merged with adjacent statics                | `static-page`                      |
| R2  | `element` emits tag, attributes and children in source order                   | `static-attrs`                     |
| R3  | `dynamic` emits a value with a surrounding range when the value can change     | `mixed-text`                       |
| R4  | `content` emits a container range for text that resumes                        | `template-text`                    |
| R5  | `component` invokes the child component with its props                         | `child-props`                      |
| R6  | `branch` emits only the taken side, with a resumable marker                    | `cond-attr`                        |
| R7  | `suspense` emits the fallback, then the resolved content                       | `suspense-inline`                  |
| R8  | `suspense` in streaming mode emits content out of order with a reattach script | `suspense-stream`                  |
| R9  | `slot` emits projected content, or the fallback when nothing is projected      | `slot-projection`, `slot-fallback` |
| R10 | `collection` emits one block per item, keyed where a key is given              | `derived-collection`               |
| R11 | a collection over a deferred source emits after the source resolves            | `deferred-collection`              |
| R12 | `innerHTML` content is emitted unescaped                                       | `inner-html`                       |
| R13 | scoped styles emit once per component with the scope attribute                 | `use-styles`                       |
| R14 | a row-root block emits the row marker attribute                                | `derived-collection`               |

## 4. Expression IR (`ValueIrKind`)

Each of these needs a case where the value reaches output, so a wrong result is visible in bytes.

| #   | requirement                                                                     | checked by        |
| --- | ------------------------------------------------------------------------------- | ----------------- |
| E1  | `lit` — string, number, boolean, null render as JS renders them                 | `static-attrs`    |
| E2  | `undef` renders as nothing in text position                                     | —                 |
| E3  | `signal-read` renders the value and records a subscription                      | `signal-counter`  |
| E4  | `binding-read` reads a setup binding                                            | `signal-counter`  |
| E5  | `member` reads a property, including nested reads                               | `store-bind`      |
| E6  | `index` reads by computed index                                                 | —                 |
| E7  | `unary` — `!`, `-`, `typeof` follow JS semantics                                | —                 |
| E8  | `bin` — arithmetic, comparison and `===`/`==` follow JS semantics               | `computed-task`   |
| E9  | `logic` — `&&`, `\|\|`, `??` short-circuit and yield the operand, not a boolean | `cond-attr`       |
| E10 | `cond` evaluates only the taken branch                                          | `cond-attr`       |
| E11 | `template` concatenates with JS coercion                                        | `mixed-text`      |
| E12 | `array` / `object` build values with source order preserved                     | `class-object`    |
| E13 | `call` invokes a lowered callee                                                 | `def-helper`      |
| E14 | `def-call` invokes a module-level helper                                        | `def-helper`      |
| E15 | `plugin-call` invokes a `native$` implementation                                | `plugin-call`     |
| E16 | `plugin-call` argument forms — `lambda`, `fn-arg`, `qrl-arg`, `render-arg`      | `plugin-callback` |

## 5. Setup ops (`SetupOpKind`)

| #   | requirement                                                                     | checked by       |
| --- | ------------------------------------------------------------------------------- | ---------------- |
| U1  | `signal` creates a signal with its initial value                                | `signal-counter` |
| U2  | `store` creates a store from its initializer                                    | `store-bind`     |
| U3  | `const` binds a computed constant                                               | `def-helper`     |
| U4  | `use-id` produces ids stable for a given instance hash                          | —                |
| U5  | `context-read` resolves through the scope chain, `context-provider` extends it  | `context`        |
| U6  | `server-data` exposes request data                                              | —                |
| U7  | `computed` evaluates lazily and records dependencies                            | `computed-task`  |
| U8  | `task` runs during SSR and its writes are visible in output                     | `computed-task`  |
| U9  | `visible-task` does not run during SSR but is serialized to run on resume       | `visible-task`   |
| U10 | `style` registers scoped styles once per component                              | `use-styles`     |
| U11 | `js` / `statement` — untranslatable setup source keeps working in the JS engine | `multi-module`   |
| U12 | `qrl-const` binds a QRL without invoking it                                     | —                |
| U13 | `render-fn` marks the render body                                               | every fixture    |
| U14 | `set-signal` / `set-store` write during setup                                   | —                |
| U15 | `if` / `let` / `return` — setup control flow follows JS evaluation order        | —                |

## 6. Segments and QRLs

| #   | requirement                                                                                       | checked by                 |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| Q1  | a `qrl` segment resolves to chunk + symbol the client can import                                  | `signal-counter`           |
| Q2  | captures are passed positionally and survive resume                                               | `local-component-captured` |
| Q3  | an `event` segment becomes a `q-e:<event>` attribute                                              | `component-event-prop`     |
| Q4  | `sync$` handlers are inlined into the `qFuncs` table, keyed by symbol                             | —                          |
| Q5  | the `qFuncs` table streams incrementally, never at the end                                        | —                          |
| Q6  | a cross-module `sync$` export registers itself once                                               | —                          |
| Q7  | `branchRender` / `forRender` / `collectionRender` / `slotRender` / `suspenseRender` chunks resume | `branch-collection`        |
| Q8  | `localComponent` chunks resume with their captures                                                | `local-component`          |
| Q9  | `pluginCallback` chunks resume                                                                    | `plugin-callback`          |
| Q10 | `q:id` numbering is deterministic for a given instance hash                                       | layer-A goldens            |

## 7. Component protocol

| #   | requirement                                                      | checked by                  |
| --- | ---------------------------------------------------------------- | --------------------------- |
| C1  | props are passed by name, with defaults applied                  | `child-props`               |
| C2  | spread props merge in source order, last wins                    | `component-spread-mixed`    |
| C3  | a signal passed as a prop keeps identity across the boundary     | `component-signal-identity` |
| C4  | an event prop passed to a component resumes on the child element | `component-event-prop`      |
| C5  | a local component receives props like any component              | `local-component-props`     |
| C6  | a local component sees the context of its declaration site       | `local-component-context`   |
| C7  | slots project into a local component                             | `local-component-slots`     |

## 8. `native$` and packages

| #   | requirement                                                       | checked by             |
| --- | ----------------------------------------------------------------- | ---------------------- |
| N1  | inline `nativeCode` source is spliced into the app                | `plugin-call`          |
| N2  | `nativeFrom` pointing at a file splices that file                 | `plugin-call`          |
| N3  | `nativeFrom` pointing at a directory becomes a package dependency | —                      |
| N4  | two markers naming one package produce one dependency             | —                      |
| N5  | the export name selects the function within a package             | —                      |
| N6  | a directory without a manifest fails, naming the path             | —                      |
| N7  | arguments convert to the implementation's parameter types         | `qwik/tests/native.rs` |
| N8  | an argument of the wrong type fails, naming the call and index    | `qwik/tests/native.rs` |
| N9  | a returned struct serializes field-by-field in declaration order  | `qwik/tests/native.rs` |
| N10 | a signal-valued field stays a signal across the boundary          | `qwik/tests/native.rs` |
| N11 | a type without the derive fails, telling the author to add it     | —                      |
| N12 | the JS implementation stays the module's export, unchanged        | `plugin-call`          |
| N13 | a marker for another language is ignored by this engine           | —                      |

## 9. Generated project

| #   | requirement                                                                       | checked by |
| --- | --------------------------------------------------------------------------------- | ---------- |
| P1  | each app becomes its own crate, so two apps may use incompatible library versions | —          |
| P2  | the project builds with no warnings from generated code                           | —          |
| P3  | an app whose plan cannot be generated is reported, and the others still build     | —          |
| P4  | regenerating from an unchanged plan produces identical output                     | —          |

## 10. Failing loudly

The generator must never emit partial or guessed output. Every one of these aborts with a reason
naming the construct: unsupported ir kind, setup op, setup ir, statement expression, binary or
logic operator, member on an unsupported binding kind, component prop ir, spread props ir, dynamic
target kind, dynamic value ir, collection source, content op, store init, task step, event handler
expression, inline row, literal, static attr value, local component prop ir.

| #   | requirement                                                                    | checked by                 |
| --- | ------------------------------------------------------------------------------ | -------------------------- |
| F1  | each unsupported construct aborts generation with its own named reason         | —                          |
| F2  | a plan the engine cannot fully generate produces no output at all              | —                          |
| F3  | the compiler refuses to emit a component it cannot lower, naming the construct | `native-readiness.unit.ts` |

## Coverage gate

`layerA/coverage.unit.ts` asserts that every `ValueIrKind`, `SetupOpKind`, `TaskStepKind`,
`SsrOpKind` and `SegmentKind` appears in at least one fixture plan, against a hand-written list of
known gaps. Shrinking that list is the metric; a form regressing into it fails, because the entry
has to be added by hand.

Measured gaps as of writing — all nine `SsrOpKind`s are covered, these are not:

| vocabulary     | uncovered                                        |
| -------------- | ------------------------------------------------ |
| `ValueIrKind`  | `undef`, `index`                                 |
| `SetupOpKind`  | `use-id`, `server-data`, `qrl-const`             |
| `TaskStepKind` | `set-signal`, `set-store`, `if`, `let`, `return` |
| `SegmentKind`  | `collectionRender`                               |

The gate only proves a form _appears_ in some plan. A requirement row still needs a case where a
wrong result is visible in the rendered bytes.
