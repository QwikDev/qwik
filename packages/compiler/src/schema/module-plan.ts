/** The neutral per-module plan: QRLs, declarations, envelope, assembly (DESIGN.md "Model"). */
import type { ValueIR } from './value-ir';
import type {
  MODULE_PLAN_VERSION,
  BindingScope,
  Diagnostic,
  Lifetime,
  LocalId,
  ModuleKind,
  ModuleSource,
  PayloadId,
  PlanFormat,
  ProgramId,
  QrlId,
  Range,
  VarKind,
} from './shared';
import type { EsmEdge, Expr, Payload, QrlUse, TaskBody, Value } from './value';
import type { ComponentParameter, Program, Setup } from './program';
import type { BindingResult, Result } from './result';

// ---------------------------------------------------------------------------------------------
// Qrl — the legacy SegmentPlan minus explicit evictions (stripped/registerSymbol → link policy
// via plugins; `final` → target-generated; inline-row symbol → renderId; delivery → linked;
// consumer roles → use sites; moduleStyle/visibleTaskStrategy → their single owners in Setup).

export const enum BoundaryKind {
  Component = 'component',
  Explicit = 'explicit',
  Implicit = 'implicit',
  Sync = 'sync',
}

/** What an implicit boundary is for: the emitters and the link dispatch on it. */
export const enum BoundaryRole {
  Event = 'event',
  /** An `on*$` prop of a component: an event its child attaches or calls, also on the server. */
  EventProp = 'event-prop',
  Prop = 'prop',
  JsxFactory = 'jsx-factory',
  Hook = 'hook',
  Callback = 'callback',
  Function = 'function',
  Expression = 'expression',
  Content = 'content',
  Branch = 'branch',
  CollectionRow = 'for',
  /** A row whose collection is keyed, so its root carries the row id. */
  KeyedCollectionRow = 'for:keyed',
  CollectionKey = 'for:key',
  Slot = 'slot',
  SlotFallback = 'slot-fallback',
  Projection = 'projection',
  JsxValue = 'jsx-value',
  /** A dynamic slot, dynamic tag, `<Suspense>` or `<Catch>` range's content. */
  RangeContent = 'range',
  CatchFallback = 'catch:fallback',
}

export const enum QrlPayloadKind {
  Function = 'function',
  Value = 'value',
}

export const enum QrlBodyKind {
  Program = 'program',
  Task = 'task',
  Expr = 'expr',
  Js = 'js',
  /** `$(binding)`: the segment IS that binding, so resolving the QRL hands back the value itself. */
  Alias = 'alias',
}

export const enum CaptureAccess {
  Direct = 'direct',
  Arguments = 'arguments',
  LoopValue = 'loop-value',
  /** The row's reactive index box — delivered per row, never a serialization root. */
  RowIndex = 'row-index',
  ComponentProp = 'component-prop',
}

export const enum FnBodyKind {
  Block = 'block',
  Expression = 'expression',
}

export const enum PropsPartKind {
  Static = 'static',
  Expression = 'expression',
  Spread = 'spread',
  Event = 'event',
}

export interface Qrl {
  id: QrlId;
  parent: QrlId | null;
  /** Wire symbol for chunked QRLs. */
  name: string;
  ctxName: string;
  /** The top-level declaration the QRL sits in; entry strategies group segments by it. */
  rootContext?: string;
  /** Only element event handlers read it, so it loads with the event instead of the render. */
  eventOnly?: true;
  /** Neutral boundary facts current emitters require. */
  boundary: /** `inline` marks a nested component value: it prints where it stood, never a chunk. */
    | {
        kind: BoundaryKind.Component;
        inline?: true;
        /** An inline `function` declaration keeps its hoisted form under this name. */
        functionName?: string;
      }
    | { kind: BoundaryKind.Explicit }
    | { kind: BoundaryKind.Implicit; role: BoundaryRole }
    | { kind: BoundaryKind.Sync };
  payloadKind: QrlPayloadKind;
  authoredAsync: boolean;
  /** ONE discriminated body — contradictions unrepresentable. */
  body:
    | { b: QrlBodyKind.Program; program: ProgramId }
    | { b: QrlBodyKind.Task; task: TaskBody }
    | { b: QrlBodyKind.Expr; expr: Expr }
    | { b: QrlBodyKind.Alias; binding: LocalId }
    | {
        b: QrlBodyKind.Js;
        payload: PayloadId;
        /** Undefined denotes arrows; null denotes anonymous function expressions. */
        functionName?: string | null;
        /** `function*`: the head must say so, or `yield` in the copied body is a syntax error. */
        generator?: true;
      };
  /** Names/kinds read from the binding table; `isWritten`: a collection row assigns its copy. */
  captures: { binding: LocalId; access: CaptureAccess; isWritten?: true }[];
  /** Local functions the body calls: their captures ride `captures`, the prelude rebinds them. */
  functions?: { binding: LocalId; use: QrlUse }[];
  /** Invocation ABI. */
  params: {
    authored: number;
    hasRest?: true;
    event?: LocalId[];
    used: LocalId[];
    sources: PayloadId[];
    /** Parameter expressions need the enclosing capture scope. */
    capturesBeforeParams?: true;
  };
  origin: {
    range: Range;
    functionRange: Range;
    calleeRange: Range | null;
    argumentRanges: (Range | null)[];
    paramRanges: Range[];
    bodyRange: Range;
    bodyKind: FnBodyKind;
  };
  propsParts: (
    | { kind: PropsPartKind.Static; name: string; value?: string | number | boolean | null }
    | { kind: PropsPartKind.Expression; name: string; value: PayloadId }
    | { kind: PropsPartKind.Spread; value: PayloadId }
    | { kind: PropsPartKind.Event; name: string; use: QrlUse }
  )[];
  /**
   * A component's own props parameter — the argument it is CALLED with, never a captured outer
   * props.
   */
  parameter?: ComponentParameter;
  /** Present when the QRL has an authored declaration site (components) — its text splices there. */
  declaration?: QrlDeclaration;
}

export interface QrlDeclaration {
  expressionOnly?: boolean;
  /** Authored declaration name — distinct from the QRL's wire symbol. */
  name: string;
  binding: LocalId | null;
  root: { name: string };
  replacementRange: Range;
  declarationKind: DeclarationKind;
  isExported: boolean;
  varKind?: VarKind;
  localName: string | null;
  /** The hashed export the component serializes as; an inline expression has none. */
  symbol?: string;
  /** `component$(X)`: the binding whose function this declaration compiles. */
  componentOf?: LocalId;
}

// ---------------------------------------------------------------------------------------------
// Declarations

export const enum DeclarationKind {
  Function = 'function',
  Const = 'const',
  DefaultFunction = 'defaultFunction',
  DefaultArrow = 'defaultArrow',
}

export const enum HookBodyKind {
  Setup = 'setup',
  Js = 'js',
}

/** Custom hooks are executable declarations with a full ABI. */
export interface HookDecl {
  binding: LocalId;
  name: string;
  /** The authored body, replaced by the compiled setup at assembly. */
  range: Range;
  /** A `function` declaration is hoisted, so its QRL constants must precede the module body. */
  declarationKind: DeclarationKind;
  bodyKind: FnBodyKind;
  parameters: { binding: LocalId; pattern: PayloadId | null; hasDefault: boolean }[];
  async: boolean;
  body:
    | { kind: HookBodyKind.Setup; setup: Setup[]; returns: Value | null }
    | { kind: HookBodyKind.Js; payload: PayloadId };
}

export const enum NativeTargetKind {
  Source = 'source',
  Path = 'path',
}

// ---------------------------------------------------------------------------------------------
// Envelope

/** Declaration tables addressable by exports and linked refs. QRLs are exportable roots. */
export const enum DeclTable {
  Bindings = 'bindings',
  Hooks = 'hooks',
  Natives = 'natives',
  Qrls = 'qrls',
}

export const enum ExportKind {
  Local = 'local',
  Reexport = 'reexport',
  Star = 'star',
}

export const enum ExportTargetKind {
  Binding = 'binding',
  Declaration = 'declaration',
}

export interface ModulePlan {
  format: PlanFormat.ModulePlan;
  version: typeof MODULE_PLAN_VERSION;
  path: string;
  kind: ModuleKind.Qwik | ModuleKind.Foreign | ModuleKind.Failed;
  source: ModuleSource;
  bindings: {
    id: LocalId;
    /** Scope vs declaration syntax: orthogonal. */
    name: string;
    scope: BindingScope;
    varKind: VarKind | null;
    declarationRange: Range | null;
    result?: BindingResult;
  }[];
  invocations?: { callee: Result; args: Result[] }[];
  lifetimes: Lifetime[];
  payloads: Payload[];
  programs: Program[];
  qrls: Qrl[];
  hooks: HookDecl[];
  natives: {
    name: string;
    binding: LocalId | null;
    markerRange: Range;
    jsImplementation: PayloadId;
    targets: Record<
      string,
      { kind: NativeTargetKind.Source; raw: string } | { kind: NativeTargetKind.Path; path: string }
    >;
  }[];
  defs: { name: string; params: number; body: ValueIR }[];
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
    /** Where the module reads this binding, so a strip can tell a now-dead import from a live one. */
    referenceRanges: Range[];
  }[];
  exports: (
    | {
        e: ExportKind.Local;
        exported: string;
        /** The initializer or function body a server-only strip replaces with its stub. */
        valueRange?: Range;
        valueIsBody?: true;
        target:
          | { t: ExportTargetKind.Binding; binding: LocalId }
          | { t: ExportTargetKind.Declaration; table: DeclTable; index: number };
      }
    | { e: ExportKind.Reexport; exported: string; edge: number; imported: string | 'default' | '*' }
    | { e: ExportKind.Star; edge: number }
  )[];
  assembly: AssemblyIntent[];
  diagnostics: Diagnostic[];
}

export const enum AssemblyKind {
  /** Splice a declared QRL's emission over its authored declaration range. */
  Splice = 'splice',
  /** Replace a custom hook's body with its compiled setup. */
  Hook = 'hook',
  Payload = 'payload',
  NativeMarker = 'native-marker',
  Import = 'import',
  /** Linked-only: pruned span (dead build-constant import). */
  StripRange = 'strip-range',
  /** Replaces a server-only export's value with a fail-loud stub. */
  StripValue = 'strip-value',
}

export type AssemblyIntent =
  | { a: AssemblyKind.Payload; payload: PayloadId }
  | { a: AssemblyKind.Hook; hook: number }
  | {
      a: AssemblyKind.Splice;
      qrl: number;
      declarators?: PayloadId[];
      declaratorIndex?: number;
      statementExported?: boolean;
      statementRange?: Range;
    }
  | { a: AssemblyKind.NativeMarker; native: number }
  | { a: AssemblyKind.Import; edge: number; binding: LocalId | null };

// Re-export for convenience — QrlUse rides values but is defined with them.
export type { QrlUse };
