# Server-reachable hole constructs by frequency
Type: research
Status: resolved
Blocked by:

## Question

Research 06 counted 480 `ExprKind.Js`, 127 `QrlBodyKind.Js` and 27 `SetupKind.Js` holes over the
216 snapshot fixtures but not by construct. For the server-reachable subset only (render
expressions, setup statements, `useComputed$`/`useTask$`/custom-hook callback bodies, module-level
helpers; exclude `on*$` handlers, `useVisibleTask$`, `sync$`), classify every hole by the authored
AST shape at its root (call kinds: member method on string/array/object/Math/JSON/Date, imported
function, local function, `signal.value` write; operators: unary/binary/logical/conditional/
template; object/array literals; optional chains; statements: if/try/return/throw/assignment/
expression-call; `await`). Run the same classification over the e2e apps and docs sources (real
code) so the order is not fixture-biased. Output: two ranked tables (fixtures, real apps) with
counts and 2 examples each, plus the count of holes that contain an `await`.

## Answer

Research: `../research/19-hole-constructs-by-frequency.md` (analyser run over 208 fixture plans / 676 real e2e+docs plans; 456 / 2815 server-reachable holes).
1. Top construct in both corpora is a bare identifier or non-computed member chain (fixtures 53 %, real 56 % of `ExprKind.Js`): blocked by `localReadIr` (`analyse/locals.ts:53-59`) returning IR only for row-index/prop-member locals, not by expression vocabulary.
2. Then object/array literals (real 344, fixtures 85: `useStore`/`useSignal` inits, `class`/`style` values, literal collection sources), then operators (real 341: binary 113, template 63, conditional 56, optional chain 48, logical 45, unary 16) — all with existing `ValueIrKind` arms that `tryLowerExprIr` never produces.
3. Calls are `$`-family/marker imports (59 + 148 module helpers: `routeLoader$` 68, `routeAction$` 30, `server$` 20…), module helpers 47, `String`/`JSON.stringify` 43, `new` 15; member-method calls are rare (40 expr, 70 rows; `console.log` 96, `JSON.stringify` 22, `.filter` 12, `.join` 6, `.map` 5 top names).
4. Statement holes rank `const` 123, `if` 118, `x.value =` 54, `store.x =` 47, `return {…}` 46, `cleanup()` 36, `console.log` 96, `await;` 24, `throw` 13, `try` 8, `for`/`switch` 4+4 — the unproduced `TaskStepKind` set covers ≈ 90 % of them.
5. `await` appears in 81 of 2815 real holes (2.9 %; fixtures 6/456), only inside `useTask$`/`routeLoader$`/`useComputed$`/`server$`/`$()` bodies — never in render expressions or setup statements.
6. Fixtures are row/key-heavy and real code expression/hook-heavy, but the construct ranking is the same, so the fixture set is not construct-biased.
