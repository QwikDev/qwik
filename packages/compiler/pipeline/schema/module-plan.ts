/** The neutral per-module plan: QRLs, declarations, envelope, assembly (DESIGN.md "Model"). */
import type { ValueIR } from '../../src/expr-ir';
import type {
  MODULE_PLAN_VERSION,
  BindingScope,
  ContextKind,
  Diagnostic,
  Lifetime,
  LocalId,
  ModuleKind,
  ModuleSource,
  PayloadId,
  PlanFormat,
  Predicate,
  ProgramId,
  QrlId,
  Range,
  VarKind,
} from './shared';
import type { EsmEdge, Expr, Payload, QrlUse, TaskBody, Value } from './value';
import type { ComponentParameter, Program, Setup } from './program';

// ---------------------------------------------------------------------------------------------
// Qrl — the legacy SegmentPlan minus explicit evictions (stripped/registerSymbol → link policy
// via plugins; `final` → target-generated; inline-row symbol → renderId; delivery → linked;
// consumer roles → use sites; moduleStyle/visibleTaskStrategy → their single owners in Setup).

export const enum BoundaryKind {
  Explicit = 'explicit',
  Implicit = 'implicit',
  Sync = 'sync',
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
}

export const enum CaptureAccess {
  Direct = 'direct',
  LoopValue = 'loop-value',
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
}

export interface Qrl {
  id: QrlId;
  parent: QrlId | null;
  /** Wire symbol for chunked QRLs. */
  name: string;
  ctxName: string;
  /** Neutral boundary facts current emitters require. */
  boundary:
    | { kind: BoundaryKind.Explicit }
    | { kind: BoundaryKind.Implicit; role: string }
    | { kind: BoundaryKind.Sync };
  markerAttributes: { key: string; value: string }[];
  payloadKind: QrlPayloadKind;
  authoredAsync: boolean;
  /** ONE discriminated body — contradictions unrepresentable. */
  body:
    | { b: QrlBodyKind.Program; program: ProgramId }
    | { b: QrlBodyKind.Task; task: TaskBody }
    | { b: QrlBodyKind.Expr; expr: Expr; initialOnly: boolean }
    | { b: QrlBodyKind.Js; payload: PayloadId };
  /** Names/kinds read from the binding table. */
  captures: { binding: LocalId; access: CaptureAccess }[];
  /** Invocation ABI. */
  params: { authored: number; used: LocalId[]; sources: PayloadId[] };
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
  )[];
  guard?: Predicate;
}

// ---------------------------------------------------------------------------------------------
// Declarations

export const enum DeclarationKind {
  Function = 'function',
  Const = 'const',
  DefaultFunction = 'defaultFunction',
  DefaultArrow = 'defaultArrow',
}

export interface ComponentDecl {
  name: string;
  identity: string;
  binding: LocalId | null;
  parameter: ComponentParameter | null;
  body: ProgramId;
  /** What the component closes over. */
  captures: LocalId[];
  root: { name: string };
  functionRange: Range | null;
  replacementRange: Range;
  declarationKind: DeclarationKind;
  varKind?: VarKind;
  localName: string | null;
  guard?: Predicate;
}

export const enum HookBodyKind {
  Setup = 'setup',
  Js = 'js',
}

/** Custom hooks are executable declarations with a full ABI. */
export interface HookDecl {
  binding: LocalId;
  name: string;
  parameters: { binding: LocalId; pattern: PayloadId | null; hasDefault: boolean }[];
  async: boolean;
  body:
    | { kind: HookBodyKind.Setup; setup: Setup[]; returns: Value | null }
    | { kind: HookBodyKind.Js; payload: PayloadId };
  guard?: Predicate;
}

export interface ClaimSite {
  fnId: string;
  callee: LocalId;
  range: Range;
  argCount: number;
  async: boolean;
  args: { value: Value | null; range: Range }[];
}

export const enum NativeTargetKind {
  Source = 'source',
  Path = 'path',
}

// ---------------------------------------------------------------------------------------------
// Envelope

/** Declaration tables addressable by exports and linked refs. QRLs are exportable roots. */
export const enum DeclTable {
  Components = 'components',
  Hooks = 'hooks',
  Callables = 'callables',
  Values = 'values',
  Contexts = 'contexts',
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
  }[];
  lifetimes: Lifetime[];
  payloads: Payload[];
  programs: Program[];
  qrls: Qrl[];
  components: ComponentDecl[];
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
      string,
      { kind: NativeTargetKind.Source; raw: string } | { kind: NativeTargetKind.Path; path: string }
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
    authoredSpecifierRange: Range;
    authoredImportedRange: Range;
  }[];
  exports: (
    | {
        e: ExportKind.Local;
        exported: string;
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
  Component = 'component',
  QrlBoundary = 'qrl-boundary',
  DeclarationStrip = 'declaration-strip',
  ModuleReferenceExport = 'module-reference-export',
  NativeMarker = 'native-marker',
  Import = 'import',
  StrippedExport = 'stripped-export',
  MarkerRetarget = 'marker-retarget',
  RuntimeImports = 'runtime-imports',
  Prelude = 'prelude',
  FunctionRender = 'function-render',
  /** Linked-only: decided build constant folded on a preserved span. */
  ConstantFold = 'constant-fold',
  /** Linked-only: pruned span (dead build-constant import). */
  StripRange = 'strip-range',
}

export const enum StripForm {
  DirectNamedExport = 'direct-named-export',
  Plain = 'plain',
}

export const enum StrippedExportForm {
  Declaration = 'declaration',
  VariableDeclarator = 'variable-declarator',
  Specifier = 'specifier',
}

export type AssemblyIntent =
  | {
      a: AssemblyKind.Component;
      component: number;
      declarators?: PayloadId[];
      declaratorIndex?: number;
      statementExported?: boolean;
      statementRange?: Range;
    }
  | { a: AssemblyKind.QrlBoundary; range: Range; qrl: QrlId }
  | { a: AssemblyKind.DeclarationStrip; range: Range; form: StripForm; name: string }
  | { a: AssemblyKind.ModuleReferenceExport; range: Range; name: string }
  | { a: AssemblyKind.NativeMarker; native: number }
  | { a: AssemblyKind.Import; edge: number; binding: LocalId | null }
  /** FAIL-LOUD STUB. */
  | {
      a: AssemblyKind.StrippedExport;
      range: Range;
      name: string;
      form: StrippedExportForm;
      statementRange: Range;
      siblingSpecifiers: number;
    }
  | { a: AssemblyKind.MarkerRetarget; binding: LocalId; edge: number; targetName: string }
  | { a: AssemblyKind.RuntimeImports; range: Range }
  | { a: AssemblyKind.Prelude; at: number }
  | { a: AssemblyKind.FunctionRender; range: Range; program: ProgramId };

// Re-export for convenience — QrlUse rides values but is defined with them.
export type { QrlUse };
