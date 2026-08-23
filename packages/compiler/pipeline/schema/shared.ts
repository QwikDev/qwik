/** Shared scalars and cross-cutting types (DESIGN.md "Model" — shared scalars). */

/** Binding id, module-scoped. */
export type LocalId = number;
/** Stable within the module. */
export type QrlId = string;
/** Index into `ModulePlan.programs`. */
export type ProgramId = number;
/** Index into `ModulePlan.payloads`. */
export type PayloadId = number;
/** Index into `ModulePlan.lifetimes`. */
export type LifetimeId = number;
export type Range = [number, number];

export const enum PlanFormat {
  ModulePlan = 'qwik/module-plan',
  LinkedPlan = 'qwik/linked-plan',
}

export const enum Environment {
  Server = 'server',
  Browser = 'browser',
}

export const enum BuildMode {
  Dev = 'dev',
  Prod = 'prod',
  Lib = 'lib',
  Hmr = 'hmr',
  Unknown = 'unknown',
}

// ---------------------------------------------------------------------------------------------
// Predicates: build-constant guards. Declarations and setup entries carry `guard?: Predicate`;
// runtime conditionals are ordinary `branch` ops whose condition may be a build constant.
// Residual isDev (mode 'unknown') stays a live reactive branch.

export const enum BuildConstant {
  IsServer = 'isServer',
  IsBrowser = 'isBrowser',
  IsDev = 'isDev',
}

export const enum PredicateKind {
  Const = 'const',
  Lit = 'lit',
  Not = 'not',
  And = 'and',
  Or = 'or',
}

export type Predicate =
  | { p: PredicateKind.Const; name: BuildConstant }
  | { p: PredicateKind.Lit; value: boolean }
  | { p: PredicateKind.Not; operand: Predicate }
  | { p: PredicateKind.And | PredicateKind.Or; left: Predicate; right: Predicate };

export interface FoldContext {
  environment: Environment;
  mode: BuildMode;
}

/**
 * Three-valued folding: `true`/`false` when decided, `null` when residual. Targets are always
 * concrete, so isServer/isBrowser always decide; isDev decides except under mode 'unknown'.
 */
export function foldPredicate(predicate: Predicate, context: FoldContext): boolean | null {
  switch (predicate.p) {
    case PredicateKind.Lit:
      return predicate.value;
    case PredicateKind.Const:
      switch (predicate.name) {
        case BuildConstant.IsServer:
          return context.environment === Environment.Server;
        case BuildConstant.IsBrowser:
          return context.environment === Environment.Browser;
        case BuildConstant.IsDev:
          switch (context.mode) {
            case BuildMode.Dev:
            case BuildMode.Hmr:
              return true;
            case BuildMode.Prod:
            case BuildMode.Lib:
              return false;
            case BuildMode.Unknown:
              return null;
          }
      }
      break;
    case PredicateKind.Not: {
      const operand = foldPredicate(predicate.operand, context);
      return operand === null ? null : !operand;
    }
    case PredicateKind.And: {
      const left = foldPredicate(predicate.left, context);
      const right = foldPredicate(predicate.right, context);
      if (left === false || right === false) {
        return false;
      }
      return left === null || right === null ? null : true;
    }
    case PredicateKind.Or: {
      const left = foldPredicate(predicate.left, context);
      const right = foldPredicate(predicate.right, context);
      if (left === true || right === true) {
        return true;
      }
      return left === null || right === null ? null : false;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Typed unknowns with provenance (DESIGN.md rule 4).

export const enum UnknownWhy {
  Unresolved = 'unresolved',
  External = 'external',
  Failed = 'failed',
  Cycle = 'cycle',
  Opaque = 'opaque',
}

export type Unknown =
  | { why: UnknownWhy.Unresolved }
  | { why: UnknownWhy.External }
  | { why: UnknownWhy.Failed }
  | { why: UnknownWhy.Cycle }
  | { why: UnknownWhy.Opaque; code: string };

export type Maybe<T> = { ok: true; value: T } | { ok: false; reason: Unknown };

// ---------------------------------------------------------------------------------------------

export interface JsonSourceMap {
  version: 3;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  names: string[];
  mappings: string;
  sourcesContent?: (string | null)[];
}

export interface ModuleSource {
  /**
   * AUTHORED source for `ModuleKind.Foreign` (transpiled at generate); NORMALIZED executable source
   * otherwise.
   */
  code: string;
  originalPath: string;
  normalizationMap: JsonSourceMap | null;
}

export const enum DiagnosticCategory {
  Error = 'error',
  Warning = 'warning',
}

export interface Diagnostic {
  code: string;
  message: string;
  span: Range | null;
  category: DiagnosticCategory;
  guard?: Predicate;
}

export const enum ModuleKind {
  Qwik = 'qwik',
  Foreign = 'foreign',
  ExportsOnly = 'exports-only',
  Failed = 'failed',
}

// ---------------------------------------------------------------------------------------------
// Seeds and shapes: resume-identity ordinals allocated in AUTHORED order (both guard arms
// counted) — folding never renumbers.

export const enum SeedKind {
  Root = 'root',
  Component = 'c',
  Branch = 'b',
  Projection = 'p',
  Slot = 's',
  For = 'f',
  Value = 'v',
}

export type Seed =
  | { kind: SeedKind.Root; name: string }
  | { kind: Exclude<SeedKind, SeedKind.Root>; ordinal: number };

export const enum Shape {
  Text = 'text',
  Element = 'element',
  Many = 'many',
  Unknown = 'unknown',
}

export const enum PlaceKind {
  Slot = 'slot',
  Prop = 'prop',
  Capture = 'capture',
  RowItem = 'row-item',
  RowIndex = 'row-index',
  Param = 'param',
  TaskLocal = 'task-local',
  DefParam = 'def-param',
  Module = 'module',
}

export type PlaceIR =
  | { at: PlaceKind.Slot; index: number }
  | { at: PlaceKind.Prop; name: string }
  | { at: PlaceKind.Capture; index: number }
  | { at: PlaceKind.RowItem | PlaceKind.RowIndex; depth: number }
  | { at: PlaceKind.Param | PlaceKind.TaskLocal | PlaceKind.DefParam; index: number }
  | { at: PlaceKind.Module; decl: number };

/** Closed union of context value kinds. */
export const enum ContextKind {
  Signal = 'signal',
  Store = 'store',
  Value = 'value',
  Unknown = 'unknown',
}

export const enum VarKind {
  Const = 'const',
  Let = 'let',
  Var = 'var',
}

export const enum BindingScope {
  Import = 'import',
  Module = 'module',
  Local = 'local',
  Param = 'param',
  Loop = 'loop',
}

export const enum LifetimeOwner {
  Component = 'component',
  RenderFunction = 'render-function',
  DynamicValue = 'dynamic-value',
  ComponentCall = 'component-call',
  Branch = 'branch',
  Suspense = 'suspense',
  Slot = 'slot',
  Collection = 'collection',
  Effect = 'effect',
}

export const enum LifetimeCommit {
  Immediate = 'immediate',
  AtomicRange = 'atomic-range',
  AtomicReconcile = 'atomic-reconcile',
}

/** Reactive ownership, mirroring the semantic plan's commit and effect bookkeeping. */
export interface Lifetime {
  id: LifetimeId;
  parent: LifetimeId | null;
  owner: LifetimeOwner;
  commit: LifetimeCommit;
}
