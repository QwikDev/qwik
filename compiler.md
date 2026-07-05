# Compiler Rewrite Handoff

Context for a future AI session working on `packages/compiler`.

## Goal

Rewrite the vdomless compiler pipeline in a style closer to `jsx-dom-expressions`:

```txt
parse source -> get JS/TS/JSX AST -> analyze JSX templates -> emit modules
```

This file is the rewrite plan. It is not the current implementation.

The current compiler still uses the existing stage pipeline. Keep the rewrite
out of the public `transformModules()` pipeline until it covers the compiler
surface listed below. A one-case fallback compiler is not useful here; the
rewrite can be developed in `packages/compiler/src/rewrite/`, but it should not
change normal compiler output before it is complete enough to take over.

## Current Repo State

The current pipeline in `packages/compiler/src/index.ts` is:

```ts
const PIPELINE: readonly PipelineStage[] = [
  parseModule,
  collectModuleFacts,
  discoverExportedComponents,
  analyzeCaptures,
  lowerStaticJsxToIr,
  emitModules,
];
```

Current implementation notes:

- `packages/compiler/src/rewrite` may exist as an inactive rewrite scaffold.
- There is no temporary `test.only('simple component', ...)`.
- There should be no public snapshot that depends on a one-case rewrite path.
- `packages/compiler/JSX_TRANSFORM.md` documents the current stage-based
  compiler behavior.
- `packages/compiler/src/index.unit.ts` is the main snapshot contract for
  generated SSR/CSR output.
- `packages/compiler/src/stages/analyze-captures.unit.ts` covers capture-analysis
  edge cases that snapshots do not show directly.
- If `ctx.outputModules` stays `null`, `transformModule()` falls back to OXC
  unless diagnostics were produced.

## Current Compiler Surface To Preserve

The rewrite eventually needs to cover the behavior already represented by the
current snapshots:

- exported/default function components, arrow components, and `component$`
- local PascalCase child components and component entry modules
- static elements, fragments, text normalization, and static attributes
- `props.children`, `Slot`, `q:slot`, and projection scope
- dynamic `signal.value` text and attrs
- dynamic text and attr expression QRLs
- DOM spread props and component spread/rest props
- native events, scoped events, event pass-through, and `createOn(...)`
- `$` setup calls such as `useComputed$`, `useSerializer$`, `useTask$`,
  `useVisibleTask$`, and `useAsync$`
- async-to-generator lowering inside scheduler/resume QRL boundaries
- ternary branches, `&&` branches, and literal branch folding
- keyed signal `.map()` loops and row templates
- `useId`, `useStyles$`, `useStylesScoped$`, and context providers
- JSX values stored in setup variables
- direct function calls in JSX children
- module import rewriting, captured locals, loop captures, and module-level
  imports used by segment modules

## Rewrite Direction

Do not start by copying the full old `RenderNode` union. That recreates the old
compiler under a new folder.

Start with a smaller template-analysis model:

```ts
type RenderResult = {
  html: HtmlPart[];
  refs: Ref[];
  ops: Op[];
  segments: Segment[];
};

type HtmlPart =
  | { kind: 'html'; value: string }
  | { kind: 'text'; expr: string }
  | { kind: 'attr'; name: string; expr: string }
  | { kind: 'marker'; id: number };

type Ref = {
  id: number;
  path: string[];
};

type Op =
  | { kind: 'textEffect'; marker: number; expr: string }
  | { kind: 'attrEffect'; target: number; name: string; expr: string }
  | { kind: 'event'; target: number; name: string; segment: string; captures: string[] };

type Segment = {
  name: string;
  kind: 'event' | 'qrl' | 'component';
  expr: string;
  captures: string[];
};
```

Model rules:

- Marker IDs can be numeric. No string names like `text0` unless output needs
  them.
- SSR consumes `html` parts by interleaving static strings and expressions.
- CSR turns `html` parts into a template string with markers, then applies
  `ops`.
- Segment module generation stays separate from template analysis.
- Any inline function passed to a call whose callee name ends with `$` becomes a
  QRL segment for SSR/resume output.
- For CSR, keep inline functions as normal functions until a runtime path needs
  a QRL reference.
- Async functions inside QRL boundaries lower to generator functions.
- CSR traversal should model helper calls from the start:

```ts
firstChild(fragment0);
lastChild(el0);
nextSibling(el0);
previousSibling(el1);
```

not property chains like:

```ts
fragment0.firstChild;
el0.lastChild;
el0.nextSibling;
el1.previousSibling;
```

## Migration Plan

Build the rewrite incrementally, but keep it inactive from `transformModules()`
until it can replace the current compiler behavior as a coherent unit.

1. Add `packages/compiler/src/rewrite/` with a tiny `transformJsx` entrypoint.
   This entrypoint is internal scaffold only; do not wire it into
   `transformModules()` yet.

2. Emit the first static component inside rewrite-local code:

   ```tsx
   export function App() {
     return <main>Qwik</main>;
   }
   ```

   This can be validated by rewrite-local tests later, but should not change the
   public `index.unit.ts` snapshots while the rewrite is incomplete.

3. Extend static JSX recursively:

   ```tsx
   <main>
     <h1>Qwik</h1>
   </main>
   ```

   Include fragments, text normalization, static attrs, `className`, booleans,
   `null` omission, escaping, and void-element rules.

4. Add source-backed dynamic text and attrs:

   ```tsx
   <main>Hello {count.value}</main>
   <div title={title.value} />
   ```

   Use markers plus `textEffect` / `attrEffect` ops.

5. Add QRL segment records for dynamic expressions:
   - `jsxText`
   - `jsxProp`
   - event handlers
   - explicit `$`

   Keep module generation separate from template output.

6. Add capture analysis for rewrite-owned segments.
   Preserve current behavior for shadowing, destructuring, loop captures, nested
   QRL isolation, special references, and module-level imports.

7. Add setup `$` calls and async generator lowering:
   - `useComputed$`
   - `useSerializer$`
   - `useTask$`
   - `useVisibleTask$`
   - `useAsync$`
   - `$`

8. Add component calls and props:
   - local child components
   - component entry modules
   - dynamic prop getters
   - spread/rest props
   - event-like component props ending in `$`
   - `props.children`

9. Add branches:
   - ternary
   - `&&`
   - literal branch folding
   - branch render segments

10. Add keyed signal `.map()` loops:
    - explicit `key`
    - row render segment
    - key segment
    - loop item/index capture rewriting
    - row template CSR path

11. Add slots and projection:
    - `Slot`
    - `q:slot`
    - fallback slot render segments
    - projection scope registration

12. Add setup/runtime special cases:
    - `useId`
    - `useStyles$`
    - `useStylesScoped$`
    - context provider boundaries

13. Add JSX values and direct JSX calls:
    - setup JSX variables
    - repeated JSX value use must create fresh CSR DOM
    - direct `CallExpression` JSX children
    - member calls and branch calls

14. Once rewrite-local coverage matches the current compiler surface, switch
    `transformModules()` to the rewrite and remove old stages in one cleanup
    pass.

## Snapshot Mapping

Use the existing snapshot names as the migration checklist. These public
snapshots should keep passing with the old compiler until the rewrite is ready
to replace the pipeline.

- Static output: `static_function`, `static_arrow_fragment`,
  `static_single_child_fragment`, `default_function`, `default_arrow`,
  `component_dollar`
- TypeScript/setup: `typescript_setup`, `implicit_dollar_setup`,
  `serializer_object_setup`
- IDs/styles/context: `use_id`, `use_id_child_component`, `use_styles_*`,
  `component_child_context`
- Events: `event_handler_*`, `create_on_explicit_qrl`,
  `component_event_prop_passthrough`
- Dynamic DOM: `dynamic_signal_text`, `ssr_dynamic_*`,
  `dynamic_dom_attrs_*`, `dom_spread_props`, `plain_value_object_fallback`,
  `unknown_source_factory_fallback`
- Branches: `branch_*`
- Loops: `jsx_loops_keyed`, `jsx_loop_row_template`,
  `jsx_unknown_value_map_fallback`
- Components/slots: `component_child_*`, `component_spread_rest_props`
- Tasks/async: `task_async_generator`, `async_signal_generator`
- JSX values/calls: `jsx_value_*`, `handle_function_call`

## Useful Commands

```bash
pnpm exec tsc -p packages/compiler/tsconfig.json --noEmit
pnpm vitest run packages/compiler/src/index.unit.ts
pnpm vitest run packages/compiler/src/index.unit.ts -u
```

For focused snapshot work, prefer:

```bash
pnpm vitest run packages/compiler/src/index.unit.ts -t "<test name>" -u
```

The full old snapshot suite should keep passing until the rewrite replaces the
compiler pipeline.
