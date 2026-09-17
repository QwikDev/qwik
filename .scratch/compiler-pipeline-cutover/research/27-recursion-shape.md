# Exact recursion shape of the render-results overflow

Ticket: `.scratch/compiler-pipeline-cutover/issues/27-recursion-shape.md`
Date: 2026-09-17

## Method

- Driver: `transformModules` from `packages/compiler/pipeline/compat/transform-modules.ts`
  (`isServer: true`, `transpileTs: true`), in a temporary
  `packages/compiler/pipeline/tests/zz-recursion-tmp.unit.ts` run with
  `npx vitest run --root . <path>` from the repo root. The temp file was deleted afterwards.
- Instrumentation: temporary `console.log` lines wrapping `readBinding` (key, current
  `activePaths` entry, `evaluating.has(key)`) and `evaluate` (result kind, member/callee name,
  path) in `packages/compiler/pipeline/link/render-results.ts`, with a depth counter incremented
  per `readBinding` frame. Restored with `git checkout --`; `git status` shows no tracked change.
  Raw traces: scratchpad `trace.txt` (minimal signal case), `trace2.txt` (store case + both files).

## 1. Reproduction

Both named files overflow through `transformModules` (`RangeError: Maximum call stack size
exceeded`, stack alternating `evaluate` → `readBinding` → `evaluate` in
`packages/compiler/pipeline/link/render-results.ts`):

- `e2e/qwik-e2e/apps/e2e/src/components/effect-client/effect-client.tsx` — binding `state`
  (index 34), path family `["logs","slice",#return,…,"join",#return]`; source is line 233
  `state.logs = state.logs.slice();` plus line 237 `{state.logs.join(' ')}`.
- `packages/docs/src/routes/demo/cookbook/drag&drop/basic/index.tsx` — binding `items1` (index
  4), path family `["value","filter",#return,…,#element,"content"]`; source is line 88
  `items1.value = items1.value.filter(…)` plus line 48 `{items1.value.map((item) => … item.content …)}`.

Minimal variants (all one component, one signal/store, one write, one hole):

| Variant | Outcome |
| --- | --- |
| `items.value = items.value.filter(x => x)` in `onClick$`, hole `{items.value.length}` | overflow |
| same write in setup (outside the handler), hole `{items.value.length}` | overflow |
| `.concat([2])` instead of `.filter` | overflow |
| `.map(x => x)` instead of `.filter` | overflow |
| `store.data = store.data.concat([2])` (`useStore`), hole `{store.data.length}` | overflow |
| hole `{items.value[0]}` instead of `.length` | overflow |
| same write, hole `{items.value}` (whole value, no suffix) | ok |
| same write, hole is a literal (`x`) | ok (nothing is evaluated) |
| `items.value = items.value` (no call), hole `{items.value.length}` | ok |

Smallest overflowing input:

```tsx
import { component$, useSignal } from '@qwik.dev/core';
export const App = component$(() => {
  const items = useSignal([1]);
  return (
    <button onClick$={() => { items.value = items.value.filter((x) => x); }}>
      {items.value.length}
    </button>
  );
});
```

## 2. The cycle trace

Depth = number of `readBinding` frames on the stack. Binding `0:3` is `items`. `#return` is the
`returnPath` symbol (keyed as `{"result":"return"}`).

```
0 evaluate member.length            path=[]
0 evaluate member.value             path=["length"]
0 evaluate binding-read             path=["value","length"]
1 readBinding 0:3 ["value","length"]                      active=[]                    evaluating=false
1 evaluate union-result             path=["value","length"]          (facts.value)
1 evaluate object → spread-result   path=["value","length"]
1 evaluate array                    path=["length"]                  → Kind.Text
1 evaluate invoke-result callee=member.filter  path=["length"]       (facts.writes[0].value, write.path=["value"], lines ~456-459)
1 evaluate member.filter            path=[#return,"length"]          (invoke-result → callee, line ~695)
1 evaluate member.value             path=["filter",#return,"length"]
1 evaluate binding-read             path=["value","filter",#return,"length"]
2 readBinding 0:3 ["value","filter",#return,"length"]     active=[["value","length"]]  evaluating=false
2 evaluate union-result / object / spread-result  path=["value","filter",#return,"length"]
2 evaluate array                    path=["filter",#return,"length"] → Kind.Missing
2 evaluate invoke-result callee=member.filter  path=["filter",#return,"length"]   (same write matches again)
2 evaluate member.filter            path=[#return,"filter",#return,"length"]
2 evaluate member.value             path=["filter",#return,"filter",#return,"length"]
2 evaluate binding-read             path=["value","filter",#return,"filter",#return,"length"]
3 readBinding 0:3 ["value","filter",#return,"filter",#return,"length"]
                                    active=[["value","length"],["value","filter",#return,"length"]]
3 … identical 8-line block …
4 readBinding 0:3 ["value",("filter",#return)×3,"length"]
… (every level inserts one more `"filter",#return` pair; ~11 000 levels until the stack dies)
```

The store variant is the same shape with an extra dead-end probe per level: `invoke-result` first
runs the string-method check `evaluate(callee.obj)` with an empty path, which reads `["data"]`,
hits `evaluating` for `["data"]` and returns the cached value, then falls through to
`evaluate(callee, [#return, …path])` and grows `["data",("concat",#return)×n,"length"]`.

The two original files follow the same pattern; only the suffix differs
(`[#element,"content"]` for drag&drop via `.map` on the collection row; `["join",#return]` for
effect-client, where the hole is `state.logs.join(' ')` and the write is `state.logs.slice()`).

## 3. Why no guard stops it

The growth per level is: `path = writePrefix ++ [method, #return] ++ suffix`, where
`writePrefix = write.path` (`["value"]` / `["data"]` / `["logs"]`) and `suffix` is whatever the
original hole asked for after the written property (`["length"]`, `["0"]`, `[#element,"content"]`,
`["join",#return]`). Concretely the mechanism is:

1. `readBinding(items, P)` runs the `facts.writes` loop (render-results.ts ~456-459). The write
   `items.value = items.value.filter(…)` has `write.path = ["value"]`, which is a prefix of every
   `P` that starts with `"value"`, so it matches at every level and evaluates the write's value with
   `path = P.slice(1)`.
2. The write's value is an `invoke-result` whose callee is `Member(filter, Member(value,
   BindingRead(items)))`. `filter` is not in `stringMethods`, so the `invoke-result` case (~695)
   rewrites the call into a path lookup on the callee: `evaluate(callee, [#return, ...path])`. The
   two `Member` cases prepend their names, so the receiver read becomes
   `readBinding(items, ["value","filter",#return, ...P.slice(1)])`.
3. That is a longer path on the same binding that still starts with `"value"`, so step 1 applies
   again. Nothing ever consumes the `"filter",#return` pair (the `array` case returns `Missing` for
   a non-numeric, non-`length` head and stops), but nothing rejects it either.

Why the two guards miss it:

- `evaluating` (line ~407) is keyed on `module:binding:JSON(path)` with the full path. Every level
  has a strictly longer path, so no key ever repeats. Symbol parts do not defeat the key — they
  serialize deterministically as `{"result":"return"}`; the key is simply never equal.
- `activePaths` (lines ~411-421) returns `Unknown` only when an active path for the same binding is
  a strict **prefix** or a strict **suffix** of the new path. The new path is an **infix**
  insertion: `["value"] ++ ["filter",#return] ++ ["length"]` against active `["value","length"]`.
  Prefix check fails at index 1 (`"length"` vs `"filter"`); suffix check fails at the first
  compared element (`"value"` vs `#return`). Every later level compares against every earlier one
  and fails for the same reason: they all share the head `"value"` and the tail `"length"`, with
  differing middles.
- The recursion always passes through `readBinding` (one frame per level, as the depth counter
  shows); it is not an `evaluate`-only loop, so a guard in `readBinding` is in the right place —
  it just tests the wrong relation.

This is also why `{items.value}` (empty suffix) does **not** overflow: the inserted pair lands at
the end, `["value","filter",#return]`, so the active `["value"]` *is* a prefix and the guard
returns `Unknown` at depth 2. And `items.value = items.value` (no call) does not overflow because
no `invoke-result` inserts anything, so the path repeats exactly and `evaluating` catches it.

## 4. Regression inputs to keep

Each is one component with one hole; all must compile without throwing (the hole kind may be
`Unknown`):

1. Signal, array method in a handler, scalar suffix:
   `const items = useSignal([1]); onClick$={() => { items.value = items.value.filter((x) => x); }}`,
   hole `{items.value.length}`.
2. Signal, same write in setup (outside any handler), hole `{items.value[0]}` — proves the guard is
   not handler-specific and covers the numeric suffix.
3. Store, `store.data = store.data.concat([2])`, hole `{store.data.length}` — covers the
   `initializer-result`/spread path and the string-method pre-probe.
4. Collection row suffix (the drag&drop shape):
   `items.value = items.value.filter((i) => i.id !== 1)`, hole
   `{items.value.map((item) => <li>{item.content}</li>)}` — suffix `[#element,"content"]`.
5. Chained-call suffix (the effect-client shape): `state.logs = state.logs.slice()`, hole
   `{state.logs.join(' ')}` — suffix `["join",#return]`, write and read are both method calls.

Keep `{items.value}` with the same write as a passing control (empty suffix; currently caught by the
prefix guard).

## Sources

- `packages/compiler/pipeline/link/render-results.ts`: `readBinding` ~403-521 (`evaluating`
  ~401/407/424/510, `activePaths` ~402/411-423/513, writes loop ~456-459), `evaluate` ~523-707
  (`Ir.Member` ~577, `invoke-result` ~684-695, `stringMethods` check ~685-693).
- `e2e/qwik-e2e/apps/e2e/src/components/effect-client/effect-client.tsx:212,233,237`.
- `packages/docs/src/routes/demo/cookbook/drag&drop/basic/index.tsx:40-41,48,88-89`.
- Traces: scratchpad `trace.txt`, `trace2.txt` (session-local, not committed).
