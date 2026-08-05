# 04 — State Serialization Freeze

Status: freeze spec (documents existing v3 behavior as the cross-engine contract). Source of
truth today: `packages/qwik/src/core/shared/serdes/` (~4,600 lines) and its tests; this document
grows the existing seed spec `core/shared/serdes/serialization.md` into the normative wire
contract every engine must reproduce **byte-for-byte**. Phase 0 of the migration
([specs/README.md](./README.md)) validates each claim here against the code and the golden
corpus; on any conflict, shipped behavior wins and this doc is corrected.

## Wire shape

A `qwik/state` payload is a JSON array of flat `(typeId, value)` pairs: root _i_ occupies indices
`(2i, 2i+1)`. Even slots are always TypeId numbers; odd slots are numbers, strings, or nested
arrays in the same encoding. It is real JSON (`JSON.parse`-able), not a custom syntax.

### TypeIds (stable wire ids — `serdes/type-id.ts`)

```
 0 Plain        1 RootRef      2 ForwardRef   3 Constant     4 Array       5 Object
 6 URL          7 Date         8 Regex        9 QRL         10 VNode      11 RefVNode
12 BigInt      13 URLSearchParams  14 ForwardRefs  15-22 Temporal*
23 Error       24 Promise     25 Set         26 Map        27 Uint8Array
28 Task        29 Component   30 Signal      31 WrappedSignal  32 ComputedSignal
33 AsyncSignal 34 SerializerSignal  35 Store  36 FormData   37 JSXNode
38 PropsProxy  39 Props       40 SubscriptionData  41 EffectSubscription
42 SubscriptionPatch  43 ContextScope  44 SlotScope  45 Projection
46 BigArray    47 StoreProp
```

### Constants (`serdes/constants.ts`, payload of `TypeIds.Constant`)

`0 undefined, 1 null, 2 true, 3 false, 4 '', 5 EMPTY_ARRAY, 6 EMPTY_OBJ, 7 NEEDS_COMPUTATION,
8 STORE_ALL_PROPS, 9 UNINITIALIZED, 10 Slot, 11 Fragment, 12 NaN, 13 Infinity, 14 -Infinity,
15 MAX_SAFE_INTEGER, 16 MAX_SAFE_INTEGER-1, 17 MIN_SAFE_INTEGER, 18 ':', 19 '.', 20 'id',
21 'ref'`.

### Record layouts (selection — full table to be completed in Phase 0 from `serialize.ts`)

- **Signal (30)**: `[value, ...subscribers]`
- **ComputedSignal (32)**: `[computeQrl, deps, value, ...subs]` — `value` is
  `Constants.NEEDS_COMPUTATION` when dirty/uncached
- **AsyncSignal (33)**: `[computeQrl, deps, value, options|null, ...subs]`
- **SerializerSignal (34)**: `[argQrl, deps, value, initialized, ...subs]`
- **Store (35)**: `[raw, sourceRecords|null, isDeep?]`; source records are
  `[path[], prop, ...subs]`
- **StoreProp (47)**: `[targetRootId, prop]`
- **Task (28)**: `[phase, taskQrl, deps]` — Phase: `0 BlockingTask, 1 VisibleTask,
4 DeferredTask`
- **EffectSubscription (41)**: first element is `EffectKind`
  (`0 TextNode, 1 TextExpression, 2 Attr, 3 Branch, 4 Props, 5 ForBlock, 6 DomBatch, 7 Content,
8 Event`); scalar DOM effects carry `EffectTargetKind` (`0 ElementText, 1 RangeText,
2 Element`), a numeric target id, deps, then kind-specific fields
- **Props (39)**: `[statics[], sourcesRecord]`; **PropsProxy (38)**: `[source]`
- **ContextScope (43)**: `[parent, k, v, k, v, …]`; **SlotScope (44)**: `[name, projections, …]`;
  **Projection (45)**: `[renderQrl, slotScope, idBase]`
- **RefVNode (11)**: a node id, resolved client-side via `[q:id="<id>"]` lookup

Store deep-reactivity (`Store`/`StoreProp`/partial-read source records) is **in scope** for this
spec — it is required for resume parity and is the largest single item to pin down in Phase 0.

## Traversal, references, cycles

- Depth-first walk with a seen-map. A value seen a second time is **promoted to a root** and the
  second occurrence emits `TypeIds.RootRef`.
- Backrefs into non-root positions use a **space-joined index path string**: `[1,"3 2 0"]` means
  root 3 → child index 2 → child index 0.
- Promises emit `TypeIds.ForwardRef` with an index into a trailing `TypeIds.ForwardRefs` table.

## Micro-optimizations (mandatory — these are observable bytes)

- Object keys that look numeric and are **< 8 characters** are emitted as numbers.
- Strings **shorter than 4 characters** are never deduped into roots.
- Arrays with **more than 64 items** containing object literals become `TypeIds.BigArray` with
  each object flattened to a root ref (`MAX_INLINE_ARRAY_ITEMS = 64`).

## String encoding

A string is passed through `JSON.stringify` only when it contains a control character, `"` or
`\`; otherwise it is emitted raw with quotes. Every `</` is rewritten to `<\/`. The script
emitter (`server/ssr-script-emitter.ts`) applies its own script-content escaping on top.

## QRL encoding

- **State form** (`TypeIds.QRL` payload): `"<chunkRootId>#<symbolRootIdDelta>[#<captureDeltas>]"`
  — the chunk and symbol strings are themselves roots referenced by id.
- **Attribute form** (event attributes): the literal `chunk#symbol[#captureDeltas]`.
- Capture deltas are a **space-separated delta chain of root ids**. In the attribute form the
  chain starts at 0; in the state form it is rebased onto the symbol root id
  (`rebaseQrlCaptureDeltas$`; parsed by `shared/qrl/qrl-capture-deltas.ts`).
- **Sync QRLs** get a numeric payload: an index into `document['qFuncs_<q:instance>']`.

## Rejection rules

`verifySerializable` (`serdes/verify.ts`) accepts: primitives, QRLs, Signal/Computed/Store
values, `Promise`, DOM `Node`, hole-free arrays, plain objects, and the fixed allowlist (`Error`,
`URL`, `Date`, `RegExp`, `URLSearchParams`, `FormData`, `Set`, `Map`, `Uint8Array`,
`Temporal.*`). Escape hatches: `noSerialize()`, `NoSerializeSymbol`, `SerializerSymbol`, and the
`__brand`/`__brand__` marker (route loaders/actions). Any other function value throws
`Code(Q34)`; unknown types throw `Code(Q20)`. Engines must reproduce the same failures (an SSR
render that would throw in JS must fail natively too, not silently emit different state).

## State scripts

```text
<script type="qwik/state" q:base="0" q:len="1024">[...]</script>
<script type="qwik/state" q:base="1024" q:len="0" q:fr>[14,[0]]</script>
<script type="qwik/state" q:s="7" q:base="5" q:len="0" q:sub>[0,4,2,4]</script>
```

(Shown as text so formatting tools cannot inject whitespace — the real output contains no
newlines inside the script tags.)

- `q:base` = index of the first root in this chunk; `q:len` = number of roots; chunked at
  `MAX_STATE_ROOTS_PER_SCRIPT = 1024`.
- `q:fr` marks the forward-ref table chunk; `q:s="<boundary>"` marks streamed Suspense chunks;
  `q:sub` carries streamed subscriber edges as `sourceId, subscriberId` pairs.
- Naming collision to respect: `q:base` on the **container** is a URL; on a **state script** it
  is a root index.
- The v2-era `<script type="qwik/json">` is vestigial; nothing in v3 emits it and no engine may.

## Conformance

Golden fixtures for this spec come from `server/ssr-render.unit.ts`, `ssr-script-emitter.unit.ts`
and the serdes unit tests; the cross-engine harness byte-diffs full `qwik/state` script contents
([08-conformance.md](./08-conformance.md)). `testing/resume-session.ts` is the executable proof
that a payload actually resumes.
