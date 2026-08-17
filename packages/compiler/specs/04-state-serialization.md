# 04 — State Serialization Freeze

Status: freeze spec, **validated against the code line-by-line (Phase 0)**. Source of truth:
`packages/qwik/src/core/shared/serdes/` and `packages/qwik/src/server/ssr-script-emitter.ts`;
on any conflict the code wins and this doc is corrected. This document supersedes the sketch in
`core/shared/serdes/serialization.md` where they disagree (notably root promotion, which that
doc describes from the decoder's perspective).

## Wire shape

A `qwik/state` payload is a JSON array of flat `(typeId, value)` pairs: root _i_ occupies indices
`(2i, 2i+1)`. Even slots are TypeId numbers; odd slots are numbers, strings, or nested arrays in
the same encoding. It is real JSON, parsed with `JSON.parse` (never evaluated).

### TypeIds (stable wire ids — `serdes/type-id.ts`)

```
 0 Plain        1 RootRef      2 ForwardRef   3 Constant     4 Array       5 Object
 6 URL          7 Date         8 Regex        9 QRL         10 VNode*     11 RefVNode
12 BigInt      13 URLSearchParams  14 ForwardRefs
15 TemporalDuration  16 TemporalInstant  17 TemporalPlainDate  18 TemporalPlainDateTime
19 TemporalPlainMonthDay  20 TemporalPlainTime  21 TemporalPlainYearMonth
22 TemporalZonedDateTime
23 Error       24 Promise     25 Set         26 Map        27 Uint8Array
28 Task        29 Component*  30 Signal      31 WrappedSignal*  32 ComputedSignal
33 AsyncSignal 34 SerializerSignal  35 Store  36 FormData   37 JSXNode*
38 PropsProxy  39 Props       40 SubscriptionData*  41 EffectSubscription
42 SubscriptionPatch*  43 ContextScope  44 SlotScope  45 Projection
46 BigArray    47 StoreProp   48 Owner
```

`*` = **reserved, never emitted or read** (`VNode`, `Component`, `WrappedSignal`, `JSXNode`,
`SubscriptionData`, `SubscriptionPatch` have no encoder/decoder path; the decoder throws
`Q16`/`Q18` if they appear). Engines must reserve the numbers and never produce them.

### Constants (`serdes/constants.ts`, payload of `TypeIds.Constant`)

`0 undefined, 1 null, 2 true, 3 false, 4 EmptyString '', 5 EMPTY_ARRAY, 6 EMPTY_OBJ,
7 NEEDS_COMPUTATION, 8 STORE_ALL_PROPS, 9 UNINITIALIZED, 10 Slot, 11 Fragment, 12 NaN,
13 Infinity, 14 -Infinity, 15 MaxSafeInt, 16 AlmostMaxSafeInt (MAX_SAFE_INTEGER-1),
17 MinSafeInt, 18 ':', 19 '.', 20 'id', 21 'ref'`.

`EMPTY_ARRAY`/`EMPTY_OBJ` encode as constants **by identity** (the flyweight objects), not by
emptiness — an ordinary `[]` encodes as `[4,[]]`. `NaN`, `±Infinity`, `MAX_SAFE_INTEGER`,
`MAX_SAFE_INTEGER-1`, `MIN_SAFE_INTEGER` encode as Constants, never as Plain numbers.

## Record layouts (complete, from `serialize.ts` + `inflate.ts`/`allocate.ts`)

Payload = the odd slot; `[a, b, …]` is a nested array whose items are themselves
`(typeId, value)` pairs; "logical index" _i_ = positions `2i, 2i+1` inside it.

| id    | name               | payload                                                      | notes                                                                                                                                                                                                   |
| ----- | ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Plain              | number \| string                                             | finite non-special number, or an inline string                                                                                                                                                          |
| 1     | RootRef            | number \| `"i j k"`                                          | root index, or space-joined backref path (see below)                                                                                                                                                    |
| 2     | ForwardRef         | number                                                       | `$forwardRefOffset$ + localId` — global across streamed chunks                                                                                                                                          |
| 3     | Constant           | number                                                       | index 0–21                                                                                                                                                                                              |
| 4     | Array              | `[v0, v1, …]`                                                | **trailing `undefined` JS elements are dropped**                                                                                                                                                        |
| 5     | Object             | `[k0, v0, …]` \| `0`                                         | `0` = empty object; keys numeric-folded (below); `noSerialize` values omit the key entirely                                                                                                             |
| 6     | URL                | string                                                       | `url.href`                                                                                                                                                                                              |
| 7     | Date               | number \| `''`                                               | `valueOf()`; `''` for Invalid Date                                                                                                                                                                      |
| 8     | Regex              | string                                                       | `re.toString()`; decoder splits on last `/`                                                                                                                                                             |
| 9     | QRL                | string \| number                                             | see QRL encoding; number = sync-fn index                                                                                                                                                                |
| 11    | RefVNode           | number \| string                                             | element `q:id`; resolved against the container element first, then `[q:id="…"]`                                                                                                                         |
| 12    | BigInt             | string                                                       | `v.toString()`                                                                                                                                                                                          |
| 13    | URLSearchParams    | string                                                       | `params.toString()`                                                                                                                                                                                     |
| 14    | ForwardRefs        | `[e0, …]`                                                    | entries: root id, path string, or `-1` (unresolved → `UNINITIALIZED`); trailing `-1`s trimmed; occupies a JSON slot but is **not** a root                                                               |
| 15–22 | Temporal\*         | string                                                       | `value.toJSON()`; decoded with the matching `Temporal.X.from`                                                                                                                                           |
| 23    | Error              | `[message, k, v, …]`                                         | own enumerable props flattened; dev builds append `'stack'`; keys not numeric-folded                                                                                                                    |
| 24    | Promise            | `[resolved, value]`                                          | boolean + value/reason; reachable only via the ForwardRefs table                                                                                                                                        |
| 25    | Set                | `[v0, …]`                                                    | insertion order                                                                                                                                                                                         |
| 26    | Map                | `[k0, v0, …]`                                                | insertion order, flattened; keys not numeric-folded                                                                                                                                                     |
| 27    | Uint8Array         | string                                                       | base64, trailing `=` stripped; decoder rejects non-canonical padding (`Q38`)                                                                                                                            |
| 28    | Task               | `[phase, qrl, deps]`                                         | phase `0 Blocking, 1 Visible, 4 Deferred`; phase forced to Visible for `VisibleTaskSubscription`; `deps` = tracked sources (`EMPTY_ARRAY` if none)                                                      |
| 30    | Signal             | `[value, ...subs]`                                           | `undefined` value → explicit `Constant.Undefined` (never truncated)                                                                                                                                     |
| 32    | ComputedSignal     | `[computeQrl, deps, value, ...subs]`                         | value = `NEEDS_COMPUTATION` when uncached/dirty/`noSerialize`d/strategy `'never'`                                                                                                                       |
| 33    | AsyncSignal        | `[computeQrl, deps, value, options, ...subs]`                | `options` = `null` or object of **non-default** keys only (`clientOnly`, `allowStale:false`, `timeout`, `concurrency`, `eagerCleanup`, `serializationStrategy`, `expires`, `poll:false`)                |
| 34    | SerializerSignal   | `[argQrl, deps, value, initialized, ...subs]`                | `initialized = value !== NEEDS_COMPUTATION`; a promise-returning serializer routes the record through a ForwardRef                                                                                      |
| 35    | Store              | `[raw]` \| `[raw, records]` \| `[raw, records\|null, false]` | **1–2 fields = deep; 3 fields ending in literal `false` = shallow.** `records` = source records `[path[], prop, ...subs]` (`path` = key chain from `raw`; decoder tolerates pathless `[prop, ...subs]`) |
| 36    | FormData           | `[k, v, …]`                                                  | string values only; `File` entries silently dropped; never deduped                                                                                                                                      |
| 38    | PropsProxy         | `[source]`                                                   | must inflate to Signal or StorePropSource, else `Q20`                                                                                                                                                   |
| 39    | Props              | `[statics, sources]`                                         | `statics` = flat `[k, v, …]` of own keys not in `sources` (numeric-folded); `sources` = object mapping prop name → Source or expression QRL                                                             |
| 41    | EffectSubscription | see sub-table                                                | 9 shapes keyed by `payload[0] = EffectKind`                                                                                                                                                             |
| 43    | ContextScope       | `[parent, k, v, …]`                                          | `parent` = scope or `null`; scope `id` set to its root index on resume                                                                                                                                  |
| 44    | SlotScope          | `[name, projections, …]`                                     | flat pairs                                                                                                                                                                                              |
| 45    | Projection         | `[renderQrl, slotScope, idBase]`                             | `slotScope` may be `null`; `idBase` string, `''` default                                                                                                                                                |
| 46    | BigArray           | `[v0, …]`                                                    | decodes identically to Array; encoder-side flattening only (below)                                                                                                                                      |
| 47    | StoreProp          | `[targetRootId, prop]`                                       | `targetRootId` is a **Plain number, not a RootRef** — emitting `[1, id]` here breaks resume                                                                                                             |
| 48    | Owner              | `[item0, …]`                                                 | items are subscribers or child `Owner`s; an owner owning nothing is not emitted. Resume adopts the owner it is given rather than rebuilding one, so the tree keeps its identity                         |

### EffectSubscription(41) sub-layouts

`EffectKind`: `0 TextNode, 1 TextExpression, 2 Attr, 3 Branch, 4 Props, 5 ForBlock, 6 DomBatch,
7 Content, 8 Event`. `EffectTargetKind`: `0 ElementText, 1 RangeText, 2 Element`. For scalar
kinds (0, 1, 2, 4, 8) a `markerIndex` field is inserted **only** when
`targetKind === RangeText`, shifting later fields by one.

| kind                | payload                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 TextNode          | `[0, targetKind, targetId, (markerIndex,) deps]`                                                                                                             |
| 1 TextExpression    | `[1, targetKind, targetId, (markerIndex,) deps, args, qrl]`                                                                                                  |
| 2 Attr (plain)      | `[2, targetKind, targetId, (markerIndex,) deps, name, styleScopedId]`                                                                                        |
| 2 Attr (expression) | `[2, targetKind, targetId, (markerIndex,) deps, name, args, qrl, styleScopedId]` — distinguished by payload length                                           |
| 3 Branch            | `[3, rangeId, currentBranch, deps, conditionQrl, thenQrl, elseQrl\|null, ownerItems, slotScope\|null, useOnScopes\|null, idBase]`                            |
| 4 Props             | `[4, targetKind, targetId, (markerIndex,) deps, args, qrl, styleScopedId]`                                                                                   |
| 5 ForBlock          | `[5, rangeId, deps, keyQrl, renderQrl, usesIndexSignal, slotScope\|null, null, indexSignals, idBase, rowShape]` — slot 7 always `null`; `rowShape` default 3 |
| 6 DomBatch          | `[6, deps, [scalarPayload0, …]]` — each item a full scalar payload with its own deps                                                                         |
| 7 Content           | `[7, rangeId, deps, args, qrl, ownerItems, slotScope\|null, useOnScopes\|null, contextArg]`                                                                  |
| 8 Event             | `[8, targetKind, targetId, (markerIndex,) deps, name, args, qrl, before, after]`                                                                             |

Note `Branch`/`ForBlock`/`Content` carry a `rangeId` at index 1 and **no** `EffectTargetKind`.

### Encoder dispatch order (observable when a value matches several branches)

`SerializerSignal` → `ComputedQrl` (**async → AsyncSignal 33**, else 32) → `AsyncSignal` →
`Signal` → `isStore` → `StorePropSource` → SSR subscriptions (Dom/Branch/ForBlock/Content) →
Task/VisibleTask subscriptions → ContextScope → SlotScope → Projection → DomRef → PropsProxy →
Props → object-literal (Array/BigArray vs Object) → URL → Date → Temporal×8 → RegExp → Error →
FormData → URLSearchParams → Set → Map → Promise → PromiseResult → Uint8Array →
SerializationWeakRef → throw `Q20`.

## Traversal, references, cycles

- **Root worklist is FIFO-by-discovery**, not DFS: roots serialize in index order from a
  worklist that grows during traversal (QRL chunk/symbol strings, captures, promoted
  duplicates, BigArray flattened items are appended and serialized after the current root
  completes). Traversal **within** one root is pre-order DFS.
- **Root promotion**: on second sighting, the value gets a new root whose slot contains a
  **backref path** (`[1, "i j k"]`) — the object's data **stays inline where first written**;
  the second occurrence emits `[1, <newRootId>]`. The decoder relocates at parse time
  (`preprocessStateChunk` swaps the real data into the root slot and leaves `[1, <rootId>]` at
  the original position). Engines must reproduce the _encoder-side_ layout.
- Backref path strings: `[rootIndex, ...logicalItemIndices]` joined with single spaces; always
  ≥ 2 segments (a plain number is a root index, a string containing a space is a path); the
  decoder recurses through intermediate RootRefs.
- Self-reference at root level short-circuits: if the resolved root index equals the slot being
  written, the value is written inline instead of a self-RootRef.
- **Streaming duplicate rule**: if a value's root ancestor lives in an already-flushed chunk,
  the encoder allocates a **fresh duplicate root** instead of a backref — the value serializes
  twice and identity is _not_ preserved across chunk boundaries.
- Promises: `ForwardRef` payload is `$forwardRefOffset$ + localId` (offset is global across
  streamed chunks); the trailing `ForwardRefs` table drops trailing `-1` entries; `-1` decodes
  to `UNINITIALIZED`.

## Micro-optimizations (mandatory — observable bytes)

- **Numeric key folding**: a key is emitted as a number iff it matches `/^-?[1-9][0-9]*$/` with
  `length < 8`. So `"0"`, `"-0"`, `"007"`, `"1e3"`, `"12345678"` stay strings. Applies **only**
  to Object literal keys and Props statics — not Map/Error/ContextScope/FormData/SlotScope keys.
- **String interning**: `''` → Constant 4; `':' '.' 'id' 'ref'` → Constants 18–21; strings with
  `length < 4` are never deduped into roots; longer repeated strings become RootRefs. BigInts
  with `-1000n < v < 10000n` are likewise never deduped.
- **BigArray**: emitted iff `length > 64` (`MAX_INLINE_ARRAY_ITEMS = 64`) **and** ≥ 1 item is
  flattenable. Flattenable = object literal **or plain array** (prototype null/Object/Array),
  excluding the `EMPTY_ARRAY`/`EMPTY_OBJ` flyweights and backrefs. Flattenable items become
  `[1, <rootId>]`; other items stay inline.
- **Trailing-`undefined` truncation**: every emitted array drops trailing `undefined` JS
  elements (except the ForwardRefs table). Signal/computed `undefined` values survive via an
  explicit `Constant.Undefined`.
- **`noSerialize` values**: inside object literals the key is omitted entirely; everywhere else
  (arrays, Props statics, subscriber lists, Set/Map members) the value becomes
  `Constant.Undefined`.
- **Subscriber filtering**: subscriber tails are emitted only on the server, dropping
  `LazySerialized` subscribers and pending `SsrContentSubscription`s, preserving the order of
  survivors — this changes the tail length of every Signal/Computed/Async/Serializer/store
  record.
- **QRL string dedup**: if two distinct QRL objects produce an identical serialized string, the
  first is promoted to a root and the second emits `[1, <rootId>]` instead of a second QRL
  record.

## String encoding

- A string goes through `JSON.stringify` **only** when it contains a char with code < 32, `"`,
  or `\`; otherwise it is emitted raw with surrounding quotes. Consequence: U+2028/U+2029, DEL,
  and **lone surrogates are emitted raw** (safe only because payloads are `JSON.parse`d).
- After quoting, every `</` is rewritten to `<\/`.
- The script emitter applies the _same_ `</` rule (idempotent) for single-script output.
  `escapeJsonScript` (`<` → `<`) is used **only** for backpatch payloads, never for
  `qwik/state`. Attribute values use `escapeHTML`.
- **Chunked re-encoding trap**: when output is chunked (see State scripts), the emitter does
  `JSON.parse` → slice → `JSON.stringify`, so the serializer's raw-string fast path is replaced
  by standard JSON encoding — lone surrogates come out as `\udXXX` escapes in chunked scripts
  but raw in single scripts. A conformance harness must model this re-encoding; see
  [06-js-semantics-profile.md](./06-js-semantics-profile.md) for the fail-closed policy that
  removes the divergence.

## QRL encoding

- **State form** (`TypeIds.QRL` payload): `` `${chunkRootId}#${symbolRootId - chunkRootId}[#<captureDeltas>]` ``
  — the second field is a **delta**, not an absolute id; chunk and symbol strings are themselves
  roots. Capture deltas are space-separated; **only the first delta is rebased** against
  `symbolRootId` (`rebaseQrlCaptureDeltas$`, a private `Serializer` method); the decoder
  (`deserializeCaptures` + `parseSerializedQrlRootIds` in `shared/qrl/qrl-capture-deltas.ts`)
  seeds `previousRootId = symbolRootId` when the string contains `#`, else 0, and rejects empty
  fields, a 4th `#` segment, non-safe integers, and negatives.
- **Attribute form**: literal `chunk#symbol[#deltas]`, multiple QRLs `|`-joined
  (`server/ssr-events.ts`); leading `./` stripped from chunk names; in dev an unresolvable
  chunk falls back to `mock-chunk` instead of throwing.
- **Sync QRLs**: state payload is the number `Number(symbol)`; attribute form `#<n>` (empty
  chunk); resolved via `document['qFuncs_' + <q:instance>][n]`; registration dedups via
  `$addSyncFn$`, which wraps partial functions as `(p0,p1)=>body`.

## Rejection rules

Two layers with different codes — do not conflate them:

- **`verifySerializable` (`serdes/verify.ts`) is dev-only** (called from dev-guarded context and
  QRL-capture paths) and throws **`Q3`** for every rejection, functions included. It is _not_
  the production SSR gate. Allowlist: primitives, QRLs, Signal/Computed/Store values **and
  `StorePropSource`**, `VisibleTaskSubscription`, `Promise`, DOM `Node`, hole-free arrays,
  plain objects, and `Error`, `URL`, `Date`, `RegExp`, `URLSearchParams`, `FormData`, `Set`,
  `Map`, `Uint8Array`, `Temporal.*`. Escapes: `noSerialize()`/`NoSerializeSymbol` (checked
  first), `SerializerSymbol`, and `__brand`/`__brand__` (objects **and functions**; checked
  after reactive/known-value checks, before the deep walk).
- **The encoder (`serialize.ts`) is the production gate**: unknown types throw **`Q20`**,
  non-QRL functions throw **`Q34`**. Engines must reproduce the _encoder's_ failures; a render
  that throws in JS must fail natively too.
- There is **no error "downgrade"**: a rejected `Promise` serializes as `[24, [false, reason]]`
  and rejects the reconstructed promise on the client; a rejected SerializerSignal promise
  throws `Q33` and aborts the render.
- Decoder hardening constrains encoders: `__proto__`, and `constructor`/`prototype`/`toString`/
  `valueOf`/`toJSON`/`then` (when function-valued) are silently dropped from Object/Error
  records on inflate; malformed Object payloads throw; a Promise resolving to another allocated
  promise throws `Q37`.

## State scripts

```text
<script type="qwik/state" q:base="0" q:len="1024">[...]</script>
<script type="qwik/state" q:base="1024" q:len="0" q:fr>[14,[0]]</script>
<script type="qwik/state" q:s="7" q:base="5" q:len="0" q:sub>[0,4,2,4]</script>
```

(Shown as text so formatting tools cannot inject whitespace — real output has no newlines
inside the script tags.)

- Attribute order: `type, q:s, q:base, q:len, q:fr|q:sub`; `q:fr`/`q:sub` are bare boolean
  attributes.
- **Chunking triggers only when `rootCount > 1024 || hasForwardRefs`** — a 1024-root document
  with no forward refs emits one script. `MAX_STATE_ROOTS_PER_SCRIPT = 1024`.
- The forward-ref table occupies a JSON slot but is **excluded from `q:len`**; the `q:fr` chunk
  gets `q:base = base + rootLen`, `q:len="0"`.
- `q:s="<boundaryId>"` appears on **every** streamed-boundary state chunk, including its `q:fr`
  chunk; `q:sub` payload is flat `[sourceId, subscriberId, …]` pairs.
- `q:dispose` (space-separated root ids) is part of the read contract — written by the
  client-side suspense runtime, never by SSR.
- Naming collision: `q:base` on the **container** is a URL; on a **state script** it is a root
  index.
- `<script type="qwik/json">`: no v3 emitter produces it, but legacy reader paths remain in the
  shipped qwikloader — engines must never emit it.

## Reserved / out-of-scope encoder surface

- `serializePatch` emits a different top-level shape (`[rootStart, [roots…](, fwdRefs|0)(, extraRootId)]`)
  — on the public `SerializationContext` interface but unreferenced in-tree; not part of the
  `qwik/state` contract.
- `SerializationWeakRef` emits a ForwardRef whose table entry stays `-1` unless the target is
  serialized elsewhere; decodes to `UNINITIALIZED`. Exported but unreferenced in-tree.
- The `output()` QRL-with-array branch is unreachable from the state encoder (it serves the SSR
  event-attribute writer). Do not implement it for `qwik/state`.

## Conformance

Golden fixtures come from `server/ssr-render.unit.ts`, `ssr-script-emitter.unit.ts` and the
serdes unit tests; the cross-engine harness byte-diffs full `qwik/state` script contents
([08-conformance.md](./08-conformance.md)) — including a chunked (>1024 roots / forward-ref)
fixture to cover the re-encoding path. `testing/resume-session.ts` is the executable proof that
a payload actually resumes.
