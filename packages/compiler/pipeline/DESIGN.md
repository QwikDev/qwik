# One linked plan, every generator

## Architecture

```
analyseModule(file, options)                         -> ModulePlan  (one file, one plan, pure)
linkPlans(plans, entries, specialization, snapshots) -> LinkedPlan  (per environment + mode)
generateJsCsr(browserLinkedPlan, options)            -> browser modules
generateJsSsr(serverLinkedPlan, options)             -> server modules
generateRustSsr(serverLinkedPlan, entry, options)    -> native project sources
```

`js-ssr` and `rust-ssr` consume the exact same server LinkedPlan; `js-csr` consumes the browser
one. Generator selection happens outside the plan; `generateRustSsr` additionally names the entry
it packages, since a LinkedPlan may carry several roots.

Rules — one sentence each, enforced by review:

1. Generators consume the LinkedPlan and nothing else — no TSX, no import resolution, no
   re-analysis.
2. The linker owns runtime semantics — constant folding, guard selection, pruning, export
   stripping — one LinkedPlan per `environment` + mode; it knows nothing about generators and
   carries every provided implementation so the selected generator picks what it supports.
3. `linkPlans` is pure over its explicit inputs, and **completeness is a declared property, not an
   assumption**: per-module transform links an incomplete graph (unreached refs become typed
   unknowns; JS generators emit today's conservative forms for them), while artifacts require a
   `complete` link, where a dangling resolved edge or failed explicit root is `LinkResult.failed`.
4. Unknowns are typed with provenance (`external | unresolved | failed | cycle | opaque`), and a
   failed module reachable from an explicit root fails the complete link rather than degrading.
5. JS is the baseline: payloads are native format for JS generators; generators validate by
   **exhaustively matching linked leaf variants** — an unsupported variant is an explicit error
   arm with a stable code, not a registry lookup, so nothing can be silently ignored.
6. One owner per fact; the linker materializes concrete `LinkedModule`s (no overlay indirection),
   and raw/linked schemas are distinct types.
7. The compiler and linker know ONLY Qwik Core semantics — components, QRL boundaries,
   signals/stores, computed values and tasks, contexts, styles, slots/projections/collections/
   Suspense. Frameworks (Qwik Router included) are external consumers built on generic mechanisms:
   plugin claims, generic `LinkEntry` roots, linked export/QRL resolution, their own manifests and
   adapters generated outside the core.

## Model

### ModulePlan

```ts
// ---------- shared scalars ----------------------------------------------------------------
type LocalId = number; // binding id, module-scoped
type QrlId = string; // stable within the module
type ProgramId = number; // index into ModulePlan.programs
type PayloadId = number; // index into ModulePlan.payloads
type LifetimeId = number; // index into ModulePlan.lifetimes
type Range = [number, number];

type Predicate =
  | { p: 'const'; name: 'isServer' | 'isBrowser' | 'isDev' }
  | { p: 'lit'; value: boolean }
  | { p: 'not'; operand: Predicate }
  | { p: 'and' | 'or'; left: Predicate; right: Predicate };
// Declarations and setup entries carry `guard?: Predicate`; runtime conditionals are ordinary
// `branch` ops whose condition may be a build constant. Recognition parity = today's three
// folding paths. Residual isDev (mode 'unknown') stays a live reactive branch. ValueIR gains a
// `build-constant` leaf so folding recurses into semantic IR.

interface ModuleSource {
  code: string; // AUTHORED source for kind:'foreign' (transpiled at
  //   generate); NORMALIZED executable source otherwise
  originalPath: string;
  normalizationMap: JsonSourceMap | null;
}
type JsonSourceMap = {
  version: 3;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  names: string[];
  mappings: string;
  sourcesContent?: (string | null)[];
};

// ---------- payloads ----------------------------------------------------------------------
// Source text + references. Executable, and RESTORABLE: awaits live here so EVERY callable body
// (components, custom hooks, plain callables — not only tasks) keeps its `_await`
// tracking/invoke-context restoration points. No `environment` field — browser/server
// reachability is a LINKED use-edge fact, never decided per-file (one `$()` can feed both a
// browser event and a server computed).
interface Payload {
  range: Range;
  text?: string; // text materialized at serialization
  constants: { range: Range; name: 'isServer' | 'isBrowser' | 'isDev' }[];
  qrls: { range: Range; use: QrlUse }[];
  reads: {
    range: Range;
    binding: LocalId;
    role: 'read' | 'write' | 'call' | 'shorthand';
    memberPath?: string[];
  }[];
  awaits: { range: Range; argumentRange: Range }[];
  useIds: { range: Range; ordinal: number }[];
  renders: { range: Range; program: ProgramId }[];
  temps: { binding: LocalId; statementStart: number; init: PayloadId }[];
}

// ---------- ESM edges ---------------------------------------------------------------------
// Import/export facts are scanned on AUTHORED source (type-only edges do not survive
// transpilation); their ranges are AUTHORED coordinates, flagged as such — never remapped into
// normalized space where the tokens may no longer exist.
interface EsmEdge {
  id: number;
  kind: 'static' | 'side-effect' | 'dynamic-literal' | 'reexport' | 'export-star';
  specifier: string;
  typeOnly: boolean;
  attributes: { key: string; value: string }[];
  authoredOwnerRange: Range;
  authoredSourceRange: Range;
  order: number;
}

// ---------- values ------------------------------------------------------------------------
type Expr = { kind: 'ir'; ir: ValueIR } | { kind: 'js'; payload: PayloadId };
// ValueIR / SetupOp / TaskBody are today's IR stacks EXTENDED. TaskBody's final shape:
type TaskBody = { steps: TaskStep[] };
type TaskStep =
  | { s: 'set-signal'; place: PlaceIR; value: ValueIR }
  | { s: 'set-store'; place: PlaceIR; path: (string | ValueIR)[]; value: ValueIR }
  | { s: 'let'; slot: number; value: ValueIR }
  | { s: 'if'; test: ValueIR; then: TaskStep[]; else: TaskStep[] }
  | { s: 'await'; value: ValueIR; result: number | null } // general await, restored
  | { s: 'call-plugin'; fnId: string; args: ValueIR[]; await: boolean; result: number | null }
  | { s: 'register-cleanup'; body: TaskBody | { js: PayloadId } }
  | { s: 'return'; value: ValueIR | null; cleanup?: TaskBody | { js: PayloadId } }; // returned cleanup fn

type Value =
  | { v: 'static'; value?: string | number | boolean | null } // absent = undefined
  | { v: 'read'; place: PlaceIR; expr: Expr } // resumes by subscription
  | {
      v: 'computed';
      expr: Expr;
      resume: { r: 'qrl'; qrl: QrlUse } | { r: 'initial-only' } | { r: 'inline' };
      compilerString: boolean;
    }
  | { v: 'qrl'; use: QrlUse; expr?: Expr }
  | { v: 'render'; program: ProgramId };

// Use-site args are POSITIONS against Qrl.captures — names/kinds come from the binding table,
// never duplicated here, so args and captures cannot disagree.
interface QrlUse {
  qrl: QrlId;
  args: ({ pass: 'binding'; binding: LocalId } | { pass: 'props' } | { pass: 'style-scope' })[];
}

// ---------- programs ----------------------------------------------------------------------
interface Program {
  body: { kind: 'ops'; ops: Op[] } | { kind: 'js'; payload: PayloadId };
  setup: Setup[];
  params: LocalId[];
  lifetime: LifetimeId;
  argumentPosition?: true;
  needsId: boolean; // intra-module; cross-module joins land on LinkedProgram
  async: boolean;
}
// Ownership is one-directional: a QrlUse reaches a Program only through Qrl.body.

// ---------- ops ----------------------------------------------------------------------------
type Seed =
  | { kind: 'root'; name: string }
  | { kind: 'c' | 'b' | 'p' | 's' | 'f' | 'v'; ordinal: number };
// ordinals allocated in AUTHORED order (both guard arms counted) — folding never renumbers

type Shape = 'text' | 'element' | 'many' | 'unknown';
type Op =
  | { op: 'static'; html: string }
  | {
      op: 'element';
      tag: string;
      void: boolean;
      styleScopedId: string | null;
      runtimeScope: boolean;
      props: Prop[];
      propsEffect: QrlUse | null;
      children: Op[];
    }
  | { op: 'hole'; value: Value; shape: Shape; effect: number | null }
  | {
      op: 'call';
      target: { t: 'raw'; binding: LocalId } | { t: 'dynamic'; place: PlaceIR };
      props: { c: 'entries'; props: Prop[] } | { c: 'proxy'; compute: QrlUse };
      projections: { name: string; use: QrlUse; id: Seed }[];
      id: Seed;
      lifetime: LifetimeId;
      blockingSuspense: boolean;
    }
  | {
      op: 'branch';
      condition: Value;
      then: QrlUse;
      else: QrlUse | null;
      id: Seed;
      lifetime: LifetimeId;
    }
  | {
      op: 'each';
      source: { s: 'array' | 'reactive' | 'derived'; value: Value };
      key: Value | null;
      row:
        | { r: 'chunk'; program: ProgramId }
        | { r: 'inline'; program: ProgramId; renderId: string };
      usesIndexSignal: boolean;
      id: Seed;
      lifetime: LifetimeId;
      shape: Shape;
    }
  | { op: 'slot'; name: string; nameValue?: Value; fallback: ProgramId | null; id: Seed }
  | { op: 'dynamic-slot'; program: ProgramId; id: Seed }
  | {
      op: 'suspense';
      content: ProgramId;
      contentId: Seed;
      fallback: ProgramId | Value | null;
      fallbackId: Seed;
      delay: Value | null;
      blocking: boolean;
      lifetime: LifetimeId;
      reveal?: { group: number; order: string; collapsed: boolean; index: number; count: number };
    };

type Prop =
  | { k: 'static'; name: string; value?: string | number | boolean | null }
  | {
      k: 'dynamic';
      name: string;
      value: Value;
      effect: number | null;
      styleScopedId?: string | null;
    }
  | { k: 'spread'; value: Value; effect: number | null }
  | {
      k: 'event';
      name: string;
      passive: boolean;
      handlers: ({ h: 'value'; value: Value } | { h: 'bind'; bind: number })[];
    }
  | {
      k: 'bind';
      name: 'value' | 'checked';
      signal: PlaceIR;
      controlsValue: boolean;
      effect: number | null;
    }
  | { k: 'ref'; value: Value; mode: 'signal' | 'function' | 'unknown' } // refs RUN in SSR
  | { k: 'inner-html'; value: Value; effect: number | null };

// Reactive ownership, mirroring today's LifetimePlan — required by the semantic plan's commit
// and effect bookkeeping:
interface Lifetime {
  id: LifetimeId;
  parent: LifetimeId | null;
  owner:
    | 'component'
    | 'render-function'
    | 'dynamic-value'
    | 'component-call'
    | 'branch'
    | 'suspense'
    | 'slot'
    | 'collection'
    | 'effect';
  commit: 'immediate' | 'atomic-range' | 'atomic-reconcile';
}

// ---------- setup: closed per-op invocations ----------------------------------------------
// One invocation MACHINERY (result binding, guards, QRL args), but each op's signature is TYPED —
// a result-bearing use-on or a QRL-free use-task is unrepresentable. Custom hooks stay separate.
type BindTarget =
  | { bind: 'slot'; slot: number }
  | { bind: 'pattern'; pattern: PayloadId; bindings: LocalId[] };
type Arg =
  | { a: 'value'; value: Value }
  | { a: 'expr'; expr: Expr } // plain callbacks/factories
  | { a: 'qrl'; use: QrlUse };
type Invoke =
  | { op: 'use-signal'; result: BindTarget; initial?: Arg }
  | { op: 'use-store'; result: BindTarget; initial: Arg; deep: boolean; reactive: boolean }
  | { op: 'use-constant'; result: BindTarget; callback: Arg; extraArgs: Arg[] } // untracked,
  // variadic
  | { op: 'use-server-data'; result: BindTarget; key: Arg; fallback?: Arg }
  | { op: 'use-computed'; result: BindTarget; qrl: QrlUse } // resumable ⇒ QRL required;
  | { op: 'use-async'; result: BindTarget; qrl: QrlUse; options?: Arg } // async-ness is
  | { op: 'use-serializer'; result: BindTarget; qrl: QrlUse } // runtime-discovered
  | { op: 'use-task'; qrl: QrlUse; deferUpdates?: boolean }
  | {
      op: 'use-visible-task';
      qrl: QrlUse;
      strategy: 'intersection-observer' | 'document-ready' | 'document-idle';
    } // ONE owner
  | {
      op: 'use-on' | 'use-on-document' | 'use-on-window';
      event: Arg;
      handler: Arg; // event may be array/dynamic
      passive?: boolean;
      capture?: boolean;
    }
  | { op: 'use-context'; result: BindTarget; context: LocalId; extraArgs: Arg[] } // overloads =
  | { op: 'use-context-provider'; context: LocalId; value: Arg }; //   ordered args
type Setup =
  | { s: 'const'; result: BindTarget; value: Value; guard?: Predicate }
  // plain consts AND `$()` consts (value: {v:'qrl'})
  | { s: 'invoke'; invoke: Invoke; guard?: Predicate }
  | { s: 'hook'; binding: LocalId; args: Arg[]; result: BindTarget | null; guard?: Predicate }
  | { s: 'use-id'; result: BindTarget; ordinal: number; guard?: Predicate } // compiler intrinsic
  | {
      s: 'style';
      ordinal: number;
      scoped: boolean;
      css: string | { dynamic: PayloadId };
      result: BindTarget | null;
      guard?: Predicate;
    } // THE single style owner —
  //   module-level styles too
  | {
      s: 'local-component';
      program: ProgramId;
      id: string;
      name: string;
      parameter: ComponentParameter | null;
      guard?: Predicate;
    }
  | { s: 'render-value'; result: BindTarget; program: ProgramId; id: string; guard?: Predicate }
  | { s: 'js'; payload: PayloadId; guard?: Predicate }; // runtime needs derive from the
//   payload rewrites — no
//   second op list to maintain
interface ComponentParameter {
  pattern: PayloadId;
  surface:
    | { kind: 'object'; bindings: { binding: LocalId; name: string }[] }
    | { kind: 'identifier'; binding: LocalId };
}
type PlaceIR =
  | { at: 'slot'; index: number }
  | { at: 'prop'; name: string }
  | { at: 'capture'; index: number }
  | { at: 'row-item' | 'row-index'; depth: number }
  | { at: 'param' | 'task-local' | 'def-param'; index: number }
  | { at: 'module'; decl: number };

// ---------- Qrl ---------------------------------------------------------------------------
// SegmentPlan minus explicit evictions (stripped/registerSymbol → link policy via plugins;
// `final` → target-generated; inline-row symbol → renderId; delivery → linked; consumer roles →
// use sites; moduleStyle/visibleTaskStrategy → their single owners in Setup).
interface Qrl {
  id: QrlId;
  parent: QrlId | null;
  name: string; // wire symbol for chunked QRLs
  ctxName: string;
  // Neutral boundary facts current emitters require:
  boundary:
    | { kind: 'component' }
    | { kind: 'explicit' }
    | { kind: 'implicit'; role: string }
    | { kind: 'sync' };
  markerAttributes: { key: string; value: string }[];
  payloadKind: 'function' | 'value';
  authoredAsync: boolean;
  body: // ONE discriminated body — contradictions unrepresentable
    | { b: 'program'; program: ProgramId }
    | { b: 'task'; task: TaskBody }
    | { b: 'expr'; expr: Expr; initialOnly: boolean }
    | { b: 'js'; payload: PayloadId };
  captures: {
    binding: LocalId; // names/kinds read from the binding table
    access: 'direct' | 'loop-value' | 'component-prop';
  }[];
  params: { authored: number; used: LocalId[]; sources: PayloadId[] }; // invocation ABI
  origin: {
    range: Range;
    functionRange: Range;
    calleeRange: Range | null;
    argumentRanges: (Range | null)[];
    paramRanges: Range[];
    bodyRange: Range;
    bodyKind: 'block' | 'expression';
  };
  propsParts: (
    | { kind: 'static'; name: string; value?: string | number | boolean | null }
    | { kind: 'expression'; name: string; value: PayloadId }
    | { kind: 'spread'; value: PayloadId }
    | { kind: 'event'; name: string; use: QrlUse }
  )[];
  declaration?: QrlDeclaration;
  guard?: Predicate;
}

// ---------- declarations, envelope --------------------------------------------------------
interface QrlDeclaration {
  name: string;
  binding: LocalId | null;
  parameter: ComponentParameter | null;
  root: { name: string };
  replacementRange: Range;
  declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
  varKind?: 'const' | 'let' | 'var';
  localName: string | null;
}
// Custom hooks are executable declarations with a full ABI:
interface HookDecl {
  binding: LocalId;
  name: string;
  parameters: { binding: LocalId; pattern: PayloadId | null; hasDefault: boolean }[];
  async: boolean;
  body:
    | { kind: 'setup'; setup: Setup[]; returns: Value | null }
    | { kind: 'js'; payload: PayloadId };
  guard?: Predicate;
}
type ContextKind = 'signal' | 'store' | 'value' | 'unknown'; // closed union
interface ClaimSite {
  fnId: string;
  callee: LocalId;
  range: Range;
  argCount: number;
  async: boolean;
  args: { value: Value | null; range: Range }[];
}

interface ModulePlan {
  format: 'qwik/module-plan';
  version: 2;
  path: string;
  kind: 'qwik' | 'foreign' | 'failed';
  source: ModuleSource;
  bindings: {
    id: LocalId;
    name: string;
    scope: 'import' | 'module' | 'local' | 'param' | 'loop'; // scope vs declaration
    varKind: 'const' | 'let' | 'var' | null; //   syntax: orthogonal
    declarationRange: Range | null;
  }[];
  lifetimes: Lifetime[];
  payloads: Payload[];
  programs: Program[];
  qrls: Qrl[];
  hooks: HookDecl[];
  callables: { binding: LocalId | null; payload: PayloadId; async: boolean; guard?: Predicate }[];
  values: { binding: LocalId | null; payload: PayloadId; guard?: Predicate }[];
  contexts: { binding: LocalId; name: string; declaredName?: string; guard?: Predicate }[];
  contextProviders: { context: LocalId; kind: ContextKind; guard?: Predicate }[];
  natives: {
    name: string;
    binding: LocalId | null;
    markerRange: Range;
    jsImplementation: PayloadId;
    targets: Record<
      string /* language */,
      { kind: 'source'; raw: string } | { kind: 'path'; path: string }
    >;
    guard?: Predicate;
  }[];
  defs: { name: string; params: number; body: ValueIR; guard?: Predicate }[];
  pluginSites: ClaimSite[];
  edges: EsmEdge[];
  imports: {
    binding: LocalId;
    edge: number;
    imported: string | 'default' | '*';
    typeOnly: boolean;
    specifierRange: Range;
    importedRange: Range;
    authoredSpecifierRange: Range;
    authoredImportedRange: Range;
  }[];
  exports: (
    | {
        e: 'local';
        exported: string;
        target:
          | { t: 'binding'; binding: LocalId }
          | {
              t: 'declaration';
              table:
                | 'components'
                | 'hooks'
                | 'callables'
                | 'values'
                | 'contexts'
                | 'natives'
                | 'qrls'; // QRLs are exportable roots
              index: number;
            };
      }
    | { e: 'reexport'; exported: string; edge: number; imported: string | 'default' | '*' }
    | { e: 'star'; edge: number }
  )[];
  assembly: AssemblyIntent[];
  diagnostics: Diagnostic[];
}
interface Diagnostic {
  code: string;
  message: string;
  span: Range | null;
  category: 'error' | 'warning';
  guard?: Predicate;
}

type AssemblyIntent =
  | {
      a: 'component';
      component: number;
      declarators?: PayloadId[];
      declaratorIndex?: number;
      statementExported?: boolean;
      statementRange?: Range;
    }
  | { a: 'qrl-boundary'; range: Range; qrl: QrlId }
  | { a: 'declaration-strip'; range: Range; form: 'direct-named-export' | 'plain'; name: string }
  | { a: 'module-reference-export'; range: Range; name: string }
  | { a: 'native-marker'; native: number }
  | { a: 'import'; edge: number; binding: LocalId | null }
  | {
      a: 'stripped-export';
      range: Range;
      name: string; // FAIL-LOUD STUB
      form: 'declaration' | 'variable-declarator' | 'specifier';
      statementRange: Range;
      siblingSpecifiers: number;
    }
  | { a: 'marker-retarget'; binding: LocalId; edge: number; targetName: string }
  | { a: 'runtime-imports'; range: Range }
  | { a: 'prelude'; at: number }
  | { a: 'function-render'; range: Range; program: ProgramId };
```

### LinkedPlan — materialized modules

```ts
interface Specialization {
  environment: 'server' | 'browser';
  mode: 'dev' | 'prod' | 'lib' | 'hmr' | 'unknown';
  stripExports: string[]; // generic core policy. Context/event stripping and symbol
  //   registration are FRAMEWORK policies — supplied through
  //   the plugin snapshot by their owners (Router, test
  //   tooling), not core fields.
}
type Unknown =
  | { why: 'unresolved' }
  | { why: 'external' }
  | { why: 'failed' }
  | { why: 'cycle' }
  | { why: 'opaque'; code: string };
type Maybe<T> = { ok: true; value: T } | { ok: false; reason: Unknown };
interface DeclRef {
  module: number;
  table: 'hooks' | 'contexts' | 'natives' | 'callables' | 'values' | 'qrls';
  index: number;
}

// The linker MATERIALIZES linked modules — same table layout as ModulePlan, with linked leaves:
// every import is materialized once; raw call targets consume that result as a `DeclRef`;
// guard-carrying entries are folded away or kept;
// branches with decided constants folded (their arm programs inlined into reachability);
// residual branches kept live; setup/ops rewritten where folding reached inside them; ValueIR
// build-constant leaves folded. Nothing is overlay-addressed by string keys.
interface LinkedModule {
  path: string;
  kind: 'qwik' | 'foreign' | 'exports-only' | 'failed';
  source: ModuleSource;
  bindings: ModulePlan['bindings'];
  lifetimes: Lifetime[];
  payloads: Payload[]; // text materialized; reads/awaits/qrls intact
  programs: LinkedProgram[];
  qrls: LinkedQrl[];
  hooks: HookDecl[];
  callables: ModulePlan['callables'];
  values: ModulePlan['values'];
  contexts: {
    id: string; // CANONICAL runtime context id — lookup key
    name: string;
    kind: Maybe<ContextKind>;
  }[];
  natives: {
    name: string;
    markerRange: Range;
    jsImplementation: PayloadId;
    implementations: Record<
      string /* language */,
      { impl: number } /* index into LinkedPlan.implementations */
    >;
  }[];
  defs: ModulePlan['defs'];
  edges: (EsmEdge & { target: Maybe<number>; runtime: boolean })[];
  imports: (
    | { kind: 'declaration'; source: ModulePlan['imports'][number]; target: Maybe<DeclRef> }
    | { kind: 'namespace'; source: ModulePlan['imports'][number]; target: Maybe<number> }
    | { kind: 'type-only'; source: ModulePlan['imports'][number] }
  )[];
  exports: ModulePlan['exports'];
  assembly: AssemblyIntent[]; // + linked 'constant-fold' edits on preserved spans
  diagnostics: Diagnostic[]; // guards folded
}
interface LinkedProgram extends Omit<Program, 'body'> {
  // `call.raw` becomes `call.declaration`; the authored binding remains as provenance.
  body: { kind: 'ops'; ops: LinkedOp[] } | { kind: 'js'; payload: PayloadId };
  // cross-module joins land HERE — the owner the raw plan cannot have:
  facts: {
    needsId: Maybe<boolean>;
    waitForTasks: Maybe<boolean>;
    providesContextEffective: Maybe<boolean>;
    runtimeScope: Maybe<boolean>;
  };
}
interface LinkedQrl extends Qrl {
  delivery: // full delivery states, per environment link
    | { d: 'chunk'; chunkBase: string; resolved: boolean } // chunkBase decided at link,
    | { d: 'inline' }
    | { d: 'reference' } //   not in neutral Qrl data
    | { d: 'noop' }
    | { d: 'omit' }
    | { d: 'stripped' }
    | { d: 'register'; symbol: string };
}

interface LinkedPlan {
  format: 'qwik/linked-plan';
  version: 2;
  specialization: Specialization;
  complete: boolean; // incomplete = per-module transform link; artifacts and
  //   native generation REQUIRE complete
  entries: (
    | { kind: 'module'; module: number }
    | { kind: 'export'; module: number; export: string; target: Maybe<DeclRef> }
  )[];
  modules: LinkedModule[];
  // ONE provider-qualified implementation table (native sources/packages, plugin emissions,
  // framework registrations) — the generator selects what it supports by (provider, key,
  // language); packages carry content or an explicit external-dependency contract, never a bare
  // filesystem path:
  implementations: {
    provider: string;
    key: string;
    language: string | null;
    content:
      | { kind: 'files'; files: { path: string; source: string }[] }
      | {
          kind: 'external-package';
          dependency: { name: string; version: string; fingerprint: string };
        }
      | { kind: 'registration'; symbol: string };
    dependencies: Record<string, string>;
    argCount?: number;
    async?: boolean;
  }[]; // signature identity for
  //   plugin-call entrypoints
  diagnostics: { module: number; diagnostic: Diagnostic }[];
}
type LinkResult =
  | { kind: 'linked'; plan: LinkedPlan }
  | { kind: 'failed'; diagnostics: { module: string; code: string; message: string }[] };
```

### API

```ts
interface AnalyseOptions {
  transpileTs?: boolean;
  rootDir?: string;
  scope?: string;
}
function analyseModule(
  input: { path: string; code: string; devPath?: string },
  options: AnalyseOptions
): Promise<ModulePlan>;

interface ResolverSnapshot {
  // per environment; host-built from the bundler resolver
  edges: Record<
    string /* plan path */,
    Record<
      number /* edge id */,
      | { r: 'resolved'; path: string; sideEffects: 'free' | 'present' | 'unknown' }
      | { r: 'external' }
      | { r: 'unresolved' }
      | { r: 'failed' }
    >
  >;
}
interface PluginSnapshot {
  // claims + policies + emissions, all canonical data
  claims: { plugin: string; module: string; exports: string[] | '*' }[];
  policies: {
    plugin: string; // framework-owned strip/registration policies (Router,
    stripCtxName?: string[];
    regCtxName?: string[]; //   test tooling) — core only
    stripEventHandlers?: boolean;
  }[]; //   executes them
  emissions: {
    plugin: string;
    fnId: string;
    language: string;
    argCount: number;
    async: boolean;
    files: { path: string; source: string }[];
    dependencies: Record<string, string>;
  }[];
}
type LinkEntry =
  | { kind: 'module'; module: string }
  | { kind: 'export'; module: string; export: string };
function linkPlans(
  plans: readonly ModulePlan[],
  entries: readonly LinkEntry[],
  specialization: Specialization,
  resolver: ResolverSnapshot,
  plugins: PluginSnapshot,
  complete: boolean
): LinkResult;
// complete:false → per-module transform link; dangling refs become typed unknowns.
// complete:true  → artifact link; dangling resolved edges, failed reachable modules, and
//                  unresolved explicit roots are LinkResult.failed.
// Host link caches fingerprint ALL inputs.

interface GenerateOutput {
  // true superset of today's TransformOutput
  modules: {
    path: string;
    code: string;
    map: string | null;
    isEntry: boolean;
    origPath: string | null;
    imports?: string[];
    segment: SegmentAnalysis | null;
  }[];
  diagnostics: Diagnostic[];
  isTypeScript: boolean;
  isJsx: boolean;
}
interface PresentationOptions {
  outputSourceMaps?: boolean;
  explicitExtensions?: boolean;
}
function generateJsCsr(plan: LinkedPlan, options: PresentationOptions): Promise<GenerateOutput>;
function generateJsSsr(plan: LinkedPlan, options: PresentationOptions): Promise<GenerateOutput>;
function generateRustSsr(
  plan: LinkedPlan,
  entry: number, // which LinkedPlan.entries root
  options: PresentationOptions
): Promise<GenerateOutput>;
// Generators validate by EXHAUSTIVE MATCH over linked leaf variants (TS exhaustiveness / Rust
// match): an unsupported variant is an explicit error arm with a stable code. JS generators
// accept `js` payload bodies natively; Rust's arm for a server-reachable `js` body errors.
async function transformModules(options: TransformModulesOptions): Promise<TransformOutput>;
// wrapper: analyse inputs → hostless path-join snapshots → link(complete:false, {kind:'module'}
// entries) → generateJsSsr/generateJsCsr per options.isServer.
```

### Coverage (case → construct)

| case                                                                                                                     | construct                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| component body / arm / row / projection / fallback / embedded / local component                                          | `Program` table entry; envelope survives `js` bodies                                                                                       |
| conditionals incl. build constants; residual isDev                                                                       | `Op.branch`; linker folds decided constants; residual stays live                                                                           |
| `isServer` on declarations/setup/diagnostics                                                                             | `guard?: Predicate`; in IR: `build-constant` leaf; in payloads: `constants`                                                                |
| signal/store read / computed / `$()` value / local JSX                                                                   | the five `Value` arms                                                                                                                      |
| every built-in hook incl. `useServerData`, store modes, `useConstant` variadics, `useOn*` arrays, `useContext` overloads | typed `Invoke` union — invalid calls unrepresentable; resumable ops require their QRL                                                      |
| custom hooks (params, defaults, async, JS fallback)                                                                      | `HookDecl` full ABI; calls via `Setup.hook`                                                                                                |
| `useId` / styles (module-level included)                                                                                 | `Setup.use-id` / `Setup.style` — single owners, authored ordinals                                                                          |
| tasks with cleanup/awaits/plugin calls                                                                                   | `TaskBody` discriminated steps                                                                                                             |
| `$()` bodies of every kind                                                                                               | `Qrl.body` union + `awaits` on `Payload` (restoration everywhere)                                                                          |
| refs, dynamic handler values, event-value expressions                                                                    | server-evaluated; unsupported-variant error arms in native generators                                                                      |
| `bind:value/checked`                                                                                                     | one `Prop.bind`; event handler references it                                                                                               |
| collections / slots / dynamic slots / Suspense                                                                           | `Op.each` / `Op.slot` / `Op.dynamic-slot(id)` / `Op.suspense(contentId, fallbackId)`                                                       |
| reactive lifetimes/effects/commit modes                                                                                  | `Lifetime` table + `lifetime`/`effect` fields                                                                                              |
| `native$`                                                                                                                | `natives` + linked `implementations` mapping (module, native, language) → entry                                                            |
| Qwik Router (loaders, actions, `server$`, routes) — EXTERNAL                                                             | Router's plugin: claims + policies + generic `LinkEntry` roots + linked export/QRL resolution; its manifest and adapters live outside core |
| barrels, `export *`, aliases, diamonds, dual-flavor                                                                      | `EsmEdge` + per-environment `ResolverSnapshot`; linked `edges.target`                                                                      |
| side-effect imports / evaluation order                                                                                   | `EsmEdge('side-effect')`; runtime closure; pruning needs `sideEffects:'free'` proof                                                        |
| foreign / failed modules                                                                                                 | `kind:'foreign'` (authored source, transpiled at generate) / `kind:'failed'` (complete link fails if reachable from a root)                |
| module assembly                                                                                                          | `AssemblyIntent` over retained `ModuleSource`                                                                                              |

## Phases — vertical slices, legacy as the oracle

The legacy pipeline stays intact and untouched as the **differential oracle**; there is no
reverse adapter and no long-lived feature flag. Each slice implements analyse → link → generate
end-to-end for a set of conformance fixtures and must match the oracle's full `TransformOutput`
field-by-field before the next slice starts. When every fixture, the e2e suite, and the broad
matrix pass differentially, the switch is a hard cutover commit (delete legacy), not a flag flip.

**0 — nets.** CSR golden suite over all 58 fixtures (whole `GenerateOutput` shape,
`SegmentAnalysis` wholesale, two-way completeness vs `listFixtures()`). Fix
`packages/compiler/tsconfig.check.json` + a qwik-vite check config including unit/spec files.
Widen e2e `testMatch` so the three excluded Router `.spec.ts` files run. The e2e end state is
**zero failures with `--fail-on-flaky-tests`** — no baseline/ratchet machinery; fixing the
current failures is part of the migration, tracked as ordinary bugs.

**1 — slice: analyse + link + generateJsSsr for the core render fixtures.** `analyseModule`
emits final ModulePlans; `linkPlans` links them (complete, hostless snapshots); `generateJsSsr`
produces whole modules; differential gate against the oracle. Schema gates: JSON round-trip;
deep-freeze; shuffled-batch determinism; **generators executed from a deserialized frozen plan in
a fresh process**. Rust refusal fixtures land with the first slice that emits linked QRLs.

**2 — slices to full JS coverage.** Remaining fixture families (collections, suspense, styles,
context, natives-as-JS, foreign modules, library mode), `generateJsCsr` slices in parallel
against the same LinkedPlans, `emit-ssr`/`plan-csr` remain the oracle throughout. Authored
import/export scanning, batch-registry deletion, and the neutral renames ride the slices that
touch them.

**3 — hosts + incomplete linking.** Vite/Rollup hosts call the staged API: per-module transform
uses `complete:false` links over the modules known so far (typed unknowns → today's conservative
emission — this is the explicit answer to lazy transform); artifacts and manifests link
`complete:true` at `generateBundle` (an asset, never `writeBundle` work; relinking there cannot
repair already-returned transform code, so transform-time output IS the incomplete-link output).
Per-environment-instance stores; per-plugin-instance store for plain Rollup; bundler-driven
invalidation + full relink first — no custom epochs/attempt graphs until profiling demands them.
Watch gates cover: changed fact providers re-transform their consumers, deleted modules drop
records, unchanged cached modules stay, and every configured output destination is asserted.
`testResume` and the secondary dev-SSR validation port to hosted two-environment pipelines with
their synthetic roots, aliases, registry metadata and runner/resolver bridge intact.

**4 — specialization depth.** Symbolic constants with authored-ordinal reservation; recognition
parity fixtures (segment/marker/id/subscription counts per mode incl. residual); guarded
diagnostics (parse failures unguarded; arm failures degrade the arm inside its envelope;
undecidable guards report both arms); plugin policies (Router strips/registration) applied at
link; cross-module `needsId` recorded, byte-changing consumption behind a named wire commit with
its parity fixture; constants-sweep fixture (`native$` JS argument included, raw target source
excluded).

**5 — native + cutover.** `generateRustSsr` over the shared server LinkedPlan with exhaustive
variant matching; TS/Rust unsupported-variant behavior proven by the shared should-reject AND
should-generate fixture corpus (matching code sets alone prove nothing); fail-closed app
generation with exact name-set comparison and native Playwright over the full list; native
project relocation decided (copy-out-of-repo build gate, or the claim is dropped). Then the
cutover commit deletes the legacy pipeline. Broad acceptance runs once, on the new path only:
full unit matrix, chromium + webkit e2e, adapters, qwik-react (both browsers), CLI, docs,
`api.update` with a checked-in API report, lint, format, production build, a built-package
consumer smoke test — and **changesets for every published-package change, per repo policy**.

## Verification

```bash
# clean build means clean: drop prior outputs, then build
git clean -fdx packages/compiler/dist packages/qwik/dist 2>/dev/null; pnpm build.core.dev
pnpm build.compiler            # iterations — ALWAYS before csr/resume/e2e (they load dist)

npx tsc --noEmit -p packages/compiler/tsconfig.check.json
npx tsc --noEmit -p packages/qwik-vite/tsconfig.check.json
pnpm vitest run packages/compiler packages/qwik-vite
pnpm vitest run --project csr && pnpm vitest run --project resume
pnpm vitest run packages       # NOT `pnpm test.unit` (watch mode)

cargo test --manifest-path packages/qwik/native/rust/Cargo.toml
cargo test --manifest-path packages/compiler/generators/rust/ssr/Cargo.toml
pnpm build.core.dev && pnpm build.native.apps && pnpm build.native   # in this order; generation
                                                                     # FAILS on any skipped app
CI=1 npx playwright test --config e2e/qwik-e2e/playwright.native.config.ts

# e2e — end state, no ratchet: zero failures, flakes are failures
CI=1 npx playwright test e2e/qwik-e2e/tests --browser=chromium \
  --config e2e/qwik-e2e/playwright.config.ts --fail-on-flaky-tests
```

Differential oracle gate (until cutover): for every conformance fixture, legacy and staged
pipelines produce field-identical full `TransformOutput`. Round-trip gate: serialize LinkedPlan
to JSON, deserialize in a fresh process, freeze, generate, byte-compare. Changesets accompany
every published-package change (repo policy; the earlier pre-release exemption is withdrawn).
