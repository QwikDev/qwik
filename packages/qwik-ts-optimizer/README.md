# qwik-ts-optimizer

A TypeScript implementation of the [Qwik](https://qwik.dev) optimizer.

It takes a Qwik source file, finds every `$()` closure, lifts each one into its
own lazy-loadable module, and rewrites the original file so the closures become
`qrl(() => import(...))` references — the runtime then loads each chunk only
when the user actually triggers it.

> **Status: experimental.** This is a from-scratch TypeScript port of the Rust
> SWC optimizer that ships with Qwik core, built on [OXC](https://oxc.rs). It
> currently matches **~96%** of the reference optimizer's snapshot suite. APIs
> may change before a 1.0.

## Why

The optimizer is the heart of Qwik's resumability model: every `$()` boundary
becomes a separately loadable chunk, so the browser downloads code lazily as
interaction demands it instead of hydrating the whole app up front. This package
makes that transform available as a pure-TypeScript, [OXC](https://oxc.rs)-based
library — no native SWC binding required for the transform logic itself (the
parser/transformer it builds on, `oxc-parser` / `oxc-transform`, do ship native
bindings).

## Install

```sh
npm install qwik-ts-optimizer
# or
pnpm add qwik-ts-optimizer
```

**Requires Node `>=22`** — `oxc-parser`'s raw-transfer path throws on Node 20.
ESM-only.

## Usage

There are two entry points: a synchronous core (`transformModule`) and an
async, SWC-NAPI-compatible factory (`createOptimizer`) for drop-in use inside a
bundler.

### `transformModule` — synchronous core

```ts
import { transformModule, mkFilePath, mkSourceText } from 'qwik-ts-optimizer';

const result = transformModule({
  input: [
    {
      path: mkFilePath('components/counter.tsx'),
      code: mkSourceText(`
        import { component$, useSignal } from '@qwik.dev/core';
        export const Counter = component$(() => {
          const count = useSignal(0);
          return <button onClick$={() => count.value++}>{count.value}</button>;
        });
      `),
    },
  ],
  srcDir: mkFilePath('/app/src/'),
  entryStrategy: { type: 'segment' },
  minify: 'simplify',
});

for (const mod of result.modules) {
  console.log(mod.path, mod.kind);        // 'parent' | 'segment'
  // mod.code — emitted source
  // mod.segment — segment metadata (name, hash, ctxKind, captures, …) on segments
}

console.log(result.diagnostics);          // [] when clean
```

Each input file is transformed independently into **one parent module** (the
original file rewritten so its `$()` calls become `qrl(...)` references) plus
**zero or more segment modules** (each lifted closure body as its own
lazy-loadable file).

### `createOptimizer` — async, bundler-facing

Mirrors the surface of Qwik's SWC optimizer (`@qwik.dev/optimizer`'s
`createOptimizer().transformModules(...)`), so it can be swapped in by a bundler
adapter. Takes and returns plain strings (no branded types at the boundary):

```ts
import { createOptimizer } from 'qwik-ts-optimizer';

const optimizer = createOptimizer();
const output = await optimizer.transformModules({
  srcDir: '/app/src',
  input: [{ path: 'components/counter.tsx', code: source }],
  entryStrategy: { type: 'smart' },
});
```

## What it emits — before / after

**Input** (`test.tsx`):

```tsx
import { $, component } from '@qwik.dev/core';

export const renderHeader = $(() => {
  return <div onClick={$((ctx) => console.log(ctx))} />;
});
```

**Output** — a rewritten parent plus one segment per `$()` body:

```ts
// test.tsx  (parent — closures replaced by lazy QRL references)
import { qrl } from "@qwik.dev/core";
const q_renderHeader_jMxQsjbyDss = /*#__PURE__*/ qrl(
  () => import("./test.tsx_renderHeader_jMxQsjbyDss"),
  "renderHeader_jMxQsjbyDss",
);
export const renderHeader = q_renderHeader_jMxQsjbyDss;
```

```ts
// test.tsx_renderHeader_jMxQsjbyDss.tsx  (segment — the lifted body)
export const renderHeader_jMxQsjbyDss = () => {
  return <div onClick={q_renderHeader_div_onClick_USi8k1jUb40} />;
};
```

The nested `onClick` closure is lifted again into its own leaf segment, loaded
only after the user clicks. That granularity — each `$()` boundary a separate
chunk — is the whole point.

## How it works

`transformModule` runs each file through a fixed pipeline:

| Phase | Does |
|---|---|
| **0 — Prepare** | Repair recoverable parse errors, flatten destructures, parse once with OXC |
| **1 — Extract** | Walk the AST, find every `$(...)` / marker call, capture each closure body + naming context |
| **2 — Captures** | Determine which outer-scope variables each closure closes over |
| **3 — Migrate** | Decide where each module-level binding lives: stay in the parent, move into a segment, or re-export |
| **4 — Rewrite parent** | Replace each `$(closure)` with a generated `qrl(...)` reference; apply migration |
| **5 — Generate segments** | Emit one lazy-loadable module per extracted closure |
| **6 — Post-process** | TypeScript strip, dead-code elimination, unused-import cleanup |

Symbol names are content-addressed: a closure's exported name is composed from
its call-site context (`renderHeader_div_onClick`) plus an 11-character
SipHash-1-3 suffix, so the same source always produces the same chunk names the
runtime will fetch.

The marker family the optimizer recognizes (`component$`, `useTask$`,
`useStyles$`, `useVisibleTask$`, `server$`, event handlers like `onClick$`, …)
is detected **structurally** — any call whose callee's imported name ends in `$`
extracts — so library-defined `name$` functions work automatically.

## Public API

| Export | Kind | Purpose |
|---|---|---|
| `transformModule(options)` | function | Synchronous core transform → `TransformOutput` |
| `createOptimizer()` | function | Async, SWC-NAPI-compatible optimizer instance |
| `mk*` (e.g. `mkFilePath`, `mkSourceText`) | functions | Smart constructors for the branded string types |
| `TransformModulesOptions`, `TransformOutput`, `TransformModule`, … | types | Input/output contracts |
| `SymbolName`, `Hash`, `FilePath`, `SourceText`, … | types | Branded identifier types |

All other modules are internal and not part of the public contract.

## License

[MIT](./LICENSE) — matching [Qwik](https://github.com/QwikDev/qwik) core, of
which this is a derivative. Copyright © QwikDev and BuilderIO.
