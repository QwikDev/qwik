# 03 — Component Setup Opcodes

Status: design (approved direction, pre-implementation). See [specs/README.md](./README.md).

## Purpose

Component setup statements are today emitted verbatim (`emit-ssr.ts` `emitSetup()` copies source
bytes with range patches). A native engine needs setup as data. The component shape contract
(`src/shape.ts`) already guarantees a **linear** setup: at most one parameter, straight-line
statements, exactly one top-level return, no control flow — so a flat opcode list is sufficient
and lossless.

Each setup statement lowers to exactly one `SetupOp`. Hooks are recognized by `BindingId` against
`@qwik.dev/core` imports (`QwikHooks` in `src/words.ts`), never by name.

## Opcode set

```ts
type SetupOp =
  | { op: 'signal'; local: LocalId; init: ValueIR } // useSignal
  | { op: 'store'; local: LocalId; init: ValueIR; deep: boolean } // useStore
  | { op: 'const'; local: LocalId; init: ValueIR } // useConstant + plain const
  | { op: 'computed'; local: LocalId; body: ValueIR; qrl: QrlRef } // useComputed$
  | { op: 'use-id'; local: LocalId; ordinal: number } // useId — instance id string (idBase + 'u' + ordinal)
  | { op: 'yield' } // `await Promise.resolve()` — pure microtask timing; native engines skip it
  | { op: 'qrl-const'; local: LocalId; segment: number } // `const fn = $(…)` — the segment's QRL value
  | { op: 'task'; body: TaskBody; qrl: QrlRef } // useTask$ — RUNS server-side
  | {
      op: 'visible-task'; // attribute carrier only, never runs server-side
      qrl: QrlRef;
      strategy: 'intersection-observer' | 'document-ready' | 'document-idle';
    }
  | { op: 'context-provider'; context: number; value: ValueIR } // useContextProvider
  | { op: 'context-read'; local: LocalId; context: number } // useContext
  | {
      op: 'local-component'; // setup-scope function component, compiled in place
      name: string; // lexical name — component-op string targets resolve against these scopes
      binding: LocalId;
      props: // destructured prop keys → bindings, or the whole-props identifier binding
        | { kind: 'object'; bindings: { b: LocalId; name: string }[] }
        | { kind: 'identifier'; binding: LocalId }
        | null;
      render: PlanSsrRenderFn; // full nested block (setup + ops) — nests to any depth
    }
  | { op: 'server-data'; local: LocalId; key: ValueIR; fallback: ValueIR | null } // useServerData
  | { op: 'style'; styleId: string; scoped: boolean } // useStyles(Scoped)$ — css in plan styles table
  | { op: 'use-on'; target: 'element' | 'document' | 'window'; event: string; qrl: QrlRef }
  | { op: 'js'; src: string; declares: { local: LocalId; name: string }[] }; // JS-generator-only fallback
```

Notes grounded in current compiler behavior:

- `useAsync$` is deprecated and gets no opcode; async work is expressed through Suspense content
  and tasks.
- `use-id` mirrors the compiler's existing structural replacement of `useId()` call sites with
  `(_id + 'uN')`: the opcode binds the local to the instance id string
  (`idBase + 'u' + ordinal`), so later `local-read`s cover template/prop usage without any
  per-instance leaf in `ValueIR`.
- `visible-task` mirrors today's exact lowering — a `qvisible`/`qinit`/`qidle` event carrier via
  `createVisibleTaskHandlerQrl`; the body never executes on the server.
- `computed` (and branch conditions / derived collection sources in render ops) carries **both**
  a lowered body and a `QrlRef` — the `Reactive` pairing from
  [01-ssr-plan-format.md](./01-ssr-plan-format.md): the serialized state must contain
  ComputedSignal/WrappedSignal records whose QRLs resolve to real JS chunks for browser resume.
- `server-data` values are `initialOnly` (no subscription records), matching today's treatment.
- Custom `use*` hooks (the compiler's `hasCustomHook` path) cannot lower — they become `op:'js'`
  under the JS generator and `native-custom-hook` errors under `nativeTarget`.
- Plain `const` bindings whose initializer lowers to `ValueIR` become `op:'const'`; anything else
  is `op:'js'` with `declares` naming the locals it introduces (so later lowered ops can still
  reference them via `js-fallback` reads under the JS generator).

## `TaskBody` — restricted statement IR

`useTask$` genuinely executes during SSR: scheduler lanes settle before serialization
(`flushTasks` gate). Expressions alone cannot express it (tasks assign state), so tasks get a
minimal statement IR:

```ts
interface TaskBody {
  steps: TaskStep[];
  async: boolean;
}

type TaskStep =
  | { s: 'set-signal'; place: PlaceIR; value: ValueIR }
  | { s: 'set-store'; place: PlaceIR; path: (string | ValueIR)[]; value: ValueIR }
  | { s: 'if'; test: ValueIR; then: TaskStep[]; else: TaskStep[] }
  | { s: 'let'; local: LocalId; value: ValueIR }
  | { s: 'call-plugin'; fn: string; args: ValueIR[]; await: boolean; result: LocalId | null }
  | { s: 'return'; value: ValueIR | null }; // early exit; value ignored for tasks
```

Decisions:

- **Corrected against the code (Phase 2): v3 tasks auto-track.** `TaskCtx` exposes only
  `cleanup` — there is no `track` function; subscribing reads inside the body record task
  dependencies via the ambient collector, before **and** after `await`
  (`core/runtime/task.ts`, `core/tests/task.spec.tsx`). `TaskBody` therefore carries no hoisted
  track list: engines evaluate the steps with a collector active and dependencies fall out,
  exactly like the JS runtime.
- **Await points restore tracking via `_await`.** Post-await tracking is not ambient magic: the
  compiler rewrites every `await X` inside extracted segments to `(await _await(X))()`
  (`emit-segment.ts` awaits rewrite) — `_await` (`core/reactive/tracking.ts`) captures the
  active collector + invoke context before suspension, and the returned thunk restores both
  after resumption, releasing them on the next microtask. Engines must give await points in
  task/computed evaluation the same restore-across-suspension semantics; when `TaskBody` grows
  await-carrying steps, each await point is explicit in the IR for exactly this reason (the v1
  lowerer rejects awaits, so nothing is silently mis-modeled today).
- **Tasks lower by default; they are not plugin territory.** The dominant SSR-relevant shape is
  derive-into-state (tracked reads + assignments), which `TaskBody` covers. Genuine I/O inside a
  task goes through `call-plugin` (an internal plugin such as `qwik:fetch`, or a user plugin) —
  idiomatic Qwik routes request data through `routeLoader$` anyway, which is host territory
  ([09-compiler-plugins.md](./09-compiler-plugins.md)).
- No declarative fetch descriptor in v1; `qwik:fetch` as an internal plugin covers the need
  without a second mechanism.
- An unlowerable task body falls back to `op:'js'` (JS generator) / `native-setup-statement`
  error (native target).

## Tracking contexts (normative for engines)

Where subscription recording is active decides which `EffectSubscription`/dep records serialize
— engines must match these contexts exactly:

- **Setup initializers** (`signal`/`store`/`const` `init`) evaluate **untracked by definition**
  (matching today's behavior — e.g. the `useStore` factory runs under `untrack()`).
- **Render expressions** subscribe by default (each dynamic site records its effect
  subscription); an `untrack` node carves reads out.
- **`computed` bodies** auto-track: every subscribing read contributes to the serialized
  ComputedSignal `deps`; `untrack` nodes remove reads from `deps`.
- **`TaskBody` steps auto-track** (corrected in Phase 2 — v3 has no task `track` function):
  subscribing reads in the steps record task dependencies via the ambient collector, and
  `untrack` inside a task body is therefore **meaningful** — it carves reads out of the task's
  deps, same as in computed bodies. No statement-level untrack wrapper exists; every `TaskStep`
  value position is a `ValueIR`, where the node is representable
  ([02-expression-ir.md](./02-expression-ir.md)).

## Scheduling semantics (normative for engines)

- Setup runs once per component instance, in opcode order.
- `task` opcodes enqueue on the request's root lane (or the owning Suspense boundary's lane);
  lanes settle before state serialization. Tracked reads re-run the task within the same request
  until quiescent — matching the JS `SsrScheduler` behavior.
- `computed` is lazy with a dirty flag: evaluated at first read, re-evaluated only if a tracked
  dependency changed within the request. Servers never maintain a live effect graph.
- Asynchronous work belongs to Suspense boundaries: content renders on the boundary's lane, and
  unresolved boundaries stream via the packet protocol
  ([05-wire-contract.md](./05-wire-contract.md)).
