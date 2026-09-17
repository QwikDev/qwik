# Exact recursion shape of the render-results overflow
Type: research
Status: resolved
Blocked by:

## Question

Reproduce `RangeError: Maximum call stack size exceeded` in `link/render-results.ts` with the smallest
input (start from `e2e/qwik-e2e/apps/e2e/src/components/effect-client/effect-client.tsx` and
`packages/docs/src/routes/demo/cookbook/drag&drop/basic/index.tsx`; reduce to a few lines). Report the
cycle: which `readBinding` keys and paths repeat, why the `evaluating` re-entry check and the
`activePaths` prefix/suffix check do not catch it (does the path grow with a non-prefix, non-suffix
pattern? do symbol parts defeat the key? is the recursion in `evaluate` alone without passing through
`readBinding`?), and the minimal inputs to keep as regression cases.

## Answer

Resolved 2026-09-17; findings in `research/27-recursion-shape.md`.

- Reproduced on both files; minimal input is `items.value = items.value.filter(x => x)` (any non-string method: `concat`, `map`, `slice`; signal or store; handler or setup) plus a hole that reads a *suffix* of the written property (`{items.value.length}`, `[0]`, `.map(...)`, `.join(' ')`).
- Cycle: `readBinding(items, ["value", …suffix])` → writes loop matches `write.path=["value"]` → `invoke-result` rewrites the call to `evaluate(callee, [#return, …])` → `Member` cases prepend `"filter"` → `readBinding(items, ["value","filter",#return, …suffix])`, and again forever; one `readBinding` frame per level.
- `evaluating` misses because the key holds the full path and each level is strictly longer (symbols key fine); `activePaths` misses because growth is an *infix* insertion `prefix ++ [method,#return] ++ suffix` — neither a strict prefix nor a strict suffix of any active path. With an empty suffix (`{items.value}`) the insertion is terminal, the prefix guard fires, no overflow.
- Regression inputs: (1) signal `.filter` in handler + `.length`; (2) same write in setup + `[0]`; (3) store `.concat` + `.length`; (4) `.filter` + `.map(item => item.content)` row; (5) `state.logs = state.logs.slice()` + `state.logs.join(' ')`; control: `{items.value}` passes today.
