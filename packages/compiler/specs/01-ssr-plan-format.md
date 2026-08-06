# 01 — SSR Plan Format

Status: design (approved direction, pre-implementation). Part of the native SSR engine effort —
see [specs/README.md](./README.md) for the index and migration phases.

Terminology: "native SSR engine" means SSR rendered by a non-JS language (Rust/Go/Zig). It is
unrelated to `TARGET_NATIVE_HANDOFF.md`'s "target-native", which means no-VNode emission.

## Purpose

The compiler's only SSR output becomes a language-neutral **plan**. Every rendering engine — the
JS backend included — is a **code generator** over the plan: it emits specialized source in its
language (straight-line function per component, static HTML as string literals, expressions
compiled inline) calling a fixed runtime ABI. Nothing interprets the plan at request time.

The plan exists so that a Rust/Go/Zig toolchain can generate a server binary that renders
byte-identical output to today's emitted-JS SSR: same HTML, same markers and `q:id`s, same
`qwik/state` scripts, same event attributes, same streaming packets. The browser client
(qwikloader + resume) is unchanged and unaware which engine rendered the page.

## Artifact granularities

- **`QwikModulePlan`** — per input module, emitted by `emit-plan.ts` as an extra JSON
  `TransformModule` when plan emission is enabled. Matches `transformModules`' per-module
  contract, including atomic per-module failure (`TransformResult`).
- **`QwikSsrPlan`** — per SSR entry (route root), produced by a link step in `packages/qwik-vite`
  at build time: walks module-plan imports, dedupes components into one table, resolves
  `{kind:'import'}` component references to table indices, inlines `useStyles$` CSS. Engines
  consume only linked plans and do zero module loading/resolution.

## Encoding

- Canonical JSON: `JSON.stringify` with no spacing; object keys in the construction order defined
  by this spec; byte-reproducible for identical compiler input. Pretty-printing is a debug flag,
  not a second format.
- Envelope: `{"format":"qwik/ssr-plan","version":1}`. Single integer version; engines MUST reject
  unknown versions. The version exists to fail loudly, not to interoperate across versions — a
  plan and the generators that consume it ship together per project build.

## Schema

Types are normative in shape and field order. `ValueIR`, `LambdaIR`, `PlaceIR` are defined in
[02-expression-ir.md](./02-expression-ir.md); `SetupOp`/`TaskBody` in
[03-setup-opcodes.md](./03-setup-opcodes.md).

```ts
interface QwikSsrPlanFile {
  format: 'qwik/ssr-plan';
  version: 1;
  entry: ComponentRef; // index into components
  components: ComponentSsrPlan[];
  segments: SegmentMeta[]; // QRL table
  defs: DefEntry[]; // auto-lowered user helpers (02 §defs)
  styles: { styleId: string; css: string; scoped: boolean }[];
  contexts: { id: number; name: string }[]; // createContextId names
  syncFns: string[]; // sync$ source texts, emitted verbatim into qFuncs
}

type ComponentRef = number;
type LocalId = number; // per-component setup slot index

interface ComponentSsrPlan {
  name: string; // symbolName, diagnostics only
  props: { names: string[] } | null; // destructured prop surface
  setup: SetupOp[]; // 03-setup-opcodes.md
  render: PlanRenderBlock;
  idBase: string;
  flags: { providesContext: boolean; needsId: boolean; flushTasks: boolean };
  styleScope: string | null;
}

interface PlanRenderBlock {
  ops: PlanOp[];
  synchronous: boolean;
  staticRoot: boolean;
}
```

### Render operations

`PlanOp` mirrors the in-memory `SsrOperation` union (`src/plan-ssr.ts`) one-to-one. The
structural half of that IR is carried unchanged; only the leaves change — every `SourceRange` is
replaced by IR or a reference:

```ts
type PlanOp =
  | { op: 'static'; html: string } // pre-escaped, verbatim
  | {
      op: 'element';
      tag: string;
      void: boolean;
      targetId: number | null;
      props: PlanProp[];
      styleScopedId: string | null;
      children: PlanOp[];
    }
  | { op: 'dynamic'; output: 'text' | 'content'; value: Reactive; target: DynamicTarget }
  | {
      op: 'component';
      component: ComponentTarget;
      props: PlanProp[];
      slots: { name: string; render: PlanRenderBlock }[];
      blockingSuspense: boolean;
    }
  | { op: 'branch'; condition: Reactive; then: PlanRenderBlock; else: PlanRenderBlock | null }
  | { op: 'suspense'; content: PlanRenderBlock; fallback: Reactive | null; delay: ValueIR | null }
  | { op: 'slot'; name: string; fallback: PlanRenderBlock | null }
  | {
      op: 'collection';
      source:
        | { kind: 'direct-array'; value: ValueIR }
        | { kind: 'direct-reactive'; signal: PlaceIR }
        | { kind: 'derived'; reactive: Reactive };
      key: { ir: ValueIR; qrl: QrlRef } | null;
      row: { params: number; render: PlanRenderBlock };
      usesIndexSignal: boolean;
      rowShape: 0 | 1 | 2 | 3;
    };

type ComponentTarget =
  | { kind: 'ref'; ref: ComponentRef } // linked form
  | { kind: 'import'; module: string; export: string }; // module-plan form only

type PlanProp =
  | { kind: 'static'; name: string; value: string | number | boolean | null }
  | { kind: 'dynamic'; name: string; value: Reactive; compilerString: boolean }
  | { kind: 'spread'; value: Reactive }
  | { kind: 'event'; eventName: string; handlers: QrlRef[] }
  | { kind: 'bind'; name: 'value' | 'checked'; signal: PlaceIR }
  | { kind: 'ref'; qrl: QrlRef | null; mode: 'signal' | 'function' }
  | { kind: 'inner-html'; value: Reactive | { static: string } };
```

### The `Reactive` pairing (Qwik-specific invariant)

```ts
interface Reactive {
  ir: ValueIR;
  qrl: QrlRef | null;
  initialOnly: boolean;
}
```

The server evaluates `ir`; the **browser resumes via `qrl`**. Computed expressions, branch
conditions, and derived collection sources serialize into `qwik/state` as
ComputedSignal/WrappedSignal records whose QRLs must point at real JS chunks. Every reactive site
therefore carries both halves. `qrl: null` is legal only when `initialOnly: true` (provably
non-reactive — no subscription record is serialized).

Engines MUST NOT derive serialized subscriptions from `ir`; the subscription/QRL contract is
carried by `qrl` + the render-time subscription recording rules
([07-native-engine-architecture.md](./07-native-engine-architecture.md)).

### Segments (QRL table)

Segments remain real JS chunks for the browser; the plan only references them:

```ts
interface SegmentMeta {
  id: string;
  symbolName: string;
  hash: string;
  kind: SegmentKind; // 'event' | 'expression' | 'branchCondition' | ...
  /**
   * True when the emitted module `.s()`-resolves the QRL at load time. Engines MUST mirror this:
   * lazy QRLs settle later than eager ones, which reorders serialization roots between the shell
   * state script and out-of-order packets — a byte-observable difference in streaming output. (E.g.
   * suspense content resolves eagerly; a `fallback$` QRL stays lazy.)
   */
  resolved: boolean;
  captures: { name: string; source: 'local' | 'param' | 'loop' }[];
}

interface QrlRef {
  segment: number; // index into segments
  captures: CaptureRef[];
}
type CaptureRef =
  | { kind: 'local'; id: LocalId }
  | { kind: 'prop'; name: string }
  | { kind: 'row-item' | 'row-index'; depth: number };
```

Chunk resolution (`hash → chunk`) happens through the host-supplied `q-manifest.json` mapper,
exactly as `ssr-render.ts` does today. The attribute string form and the state form of a QRL,
including capture delta encoding, are specified in
[04-state-serialization.md](./04-state-serialization.md).

### Cross-module facts

Each `QwikModulePlan` carries kind facts for its exports (`exports: ExportFact[]`):

```ts
type ExportFact = {
  name: string;
  kind: 'lowerable-const' | 'function' | 'opaque';
};
```

- `lowerable-const` — an exported constant whose value lowers to `ValueIR` (usable across
  modules like a `defs` entry).
- `function` — plugin-claimable or `defs`-lowerable.
- `opaque` — everything else.

The link step joins these facts across the import graph so importing modules can lower calls
(`defs`/plugin claims) and fold imported constant data. Resolution is **transitive**: the linker
follows re-export chains, aliases, and barrel files to the defining module (the bundler already
holds the full module graph, so no extra loading pass exists). Per-module compilation stays
I/O-free and incremental — a changed module recomputes only its own facts before re-linking.
Unresolvable chains degrade to `opaque`, never to a guess.

**Reactive state cannot be exported from a module in v3** — there is no module-scope
signal/store creation API (`useSignal`/`useStore` are setup-scope hooks proven by `BindingId`,
and extracted modules cannot assign top-level bindings — the existing `module-write` error).
Signals cross files only as props, context values, captures, or function results — all covered
by `PlaceIR`/`CaptureRef`/`context-read` and the generic-read rule in
[02-expression-ir.md](./02-expression-ir.md). If a module-scope creation API is ever added,
`ExportFact` extends with `'signal' | 'store'` and the link step upgrades typed reads through the
same transitive resolution — the compiler side is ready. What would actually gate that feature is
runtime semantics, not analysis: module scope means one instance per server process (cross-request
shared mutable state), and resume needs an identity rule (signal identity = `(module, export)`
key resolved to the client module instance and patched from serialized state — analogous to QRL
symbol resolution), otherwise the deserialized instance and the client module's import are two
different signals.

### `sync$`

Sync QRLs run only in the browser and cannot capture lexical scope, so their exact source text is
known at compile time. The plan carries them in `syncFns` as opaque strings; engines emit the
`qFuncs_<q:instance>` script and numeric QRL payloads verbatim (same treatment as the other
build-constant scripts). No engine evaluates them.

## Migration accommodation

During the migration ([specs/README.md](./README.md) phases), sites the compiler cannot lower yet
ride in the plan as `{k:'js-fallback', src}` expression nodes and `{op:'js'}` setup ops. The JS
generator splices `src` exactly as `emit-ssr.ts` does today, so the JS server always keeps
working. Under `nativeTarget`, any such node is a compile error
([09-compiler-plugins.md](./09-compiler-plugins.md) diagnostics). The per-entry count of these
nodes is the native-readiness metric.
