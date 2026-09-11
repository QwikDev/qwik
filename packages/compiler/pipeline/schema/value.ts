/** Payloads, ESM edges, expressions, tasks, and the five-arm `Value` union (DESIGN.md "Model"). */
import type { ValueIR } from '../../src/expr-ir';
import type { BuildConstant, LocalId, PayloadId, PlaceIR, ProgramId, QrlId, Range } from './shared';
import type { Setup } from './program';
import type { Result } from './result';

// ---------------------------------------------------------------------------------------------
// Payloads: source text + references. Executable, and RESTORABLE: awaits live here so EVERY
// callable body (components, custom hooks, plain callables — not only tasks) keeps its `_await`
// tracking/invoke-context restoration points. No `environment` field — browser/server
// reachability is a LINKED use-edge fact, never decided per-file (one `$()` can feed both a
// browser event and a server computed).

export const enum ReadRole {
  Read = 'read',
  Write = 'write',
  Call = 'call',
  Shorthand = 'shorthand',
}

export interface Payload {
  result?: Result;
  range: Range;
  /** Text materialized at serialization. */
  text?: string;
  constants: { range: Range; name: BuildConstant }[];
  qrls: { range: Range; use: QrlUse }[];
  reads: {
    range: Range;
    binding: LocalId;
    role: ReadRole;
    value?: ValueIR;
  }[];
  awaits: { range: Range; argumentRange: Range }[];
  useIds: { range: Range; ordinal: number }[];
  renders: { range: Range; program: ProgramId; statement?: true }[];
  setups?: { range: Range; setup: Setup[]; block: boolean }[];
  temps: { binding: LocalId; statementStart: number; init: PayloadId }[];
}

// ---------------------------------------------------------------------------------------------
// ESM edges retain normalized ranges for assembly and authored ranges for external locations.

export const enum EsmEdgeKind {
  Static = 'static',
  SideEffect = 'side-effect',
  DynamicLiteral = 'dynamic-literal',
  Reexport = 'reexport',
  ExportStar = 'export-star',
}

export interface EsmEdge {
  id: number;
  kind: EsmEdgeKind;
  specifier: string;
  typeOnly: boolean;
  attributes: { key: string; value: string }[];
  ownerRange: Range;
  sourceRange: Range;
  authoredOwnerRange: Range;
  authoredSourceRange: Range;
  order: number;
}

// ---------------------------------------------------------------------------------------------
// Expressions and task bodies.
// NOTE: `ValueIR` gains a `build-constant` leaf in ../../src/expr-ir.ts with the first slice
// that folds IR (see DESIGN.md).

export const enum ExprKind {
  Ir = 'ir',
  Js = 'js',
}

type JsExpression = { kind: ExprKind.Js; payload: PayloadId };

/** Opaque JS leaves remain explicit, outside the portable IR vocabulary. */
export type ExpressionIR = ValueIR<JsExpression>;

export type Expr = { kind: ExprKind.Ir; ir: ExpressionIR } | JsExpression;

export interface TaskBody {
  steps: TaskStep[];
}

export const enum TaskStepKind {
  SetSignal = 'set-signal',
  SetStore = 'set-store',
  Let = 'let',
  If = 'if',
  Await = 'await',
  CallPlugin = 'call-plugin',
  RegisterCleanup = 'register-cleanup',
  Return = 'return',
}

export type TaskStep =
  | { s: TaskStepKind.SetSignal; place: PlaceIR; value: ValueIR }
  | { s: TaskStepKind.SetStore; place: PlaceIR; path: (string | ValueIR)[]; value: ValueIR }
  | { s: TaskStepKind.Let; slot: number; value: ValueIR }
  | { s: TaskStepKind.If; test: ValueIR; then: TaskStep[]; else: TaskStep[] }
  /** General await, restored. */
  | { s: TaskStepKind.Await; value: ValueIR; result: number | null }
  | {
      s: TaskStepKind.CallPlugin;
      fnId: string;
      args: ValueIR[];
      await: boolean;
      result: number | null;
    }
  | { s: TaskStepKind.RegisterCleanup; body: TaskBody | { js: PayloadId } }
  /** `cleanup` is a returned cleanup fn. */
  | { s: TaskStepKind.Return; value: ValueIR | null; cleanup?: TaskBody | { js: PayloadId } };

// ---------------------------------------------------------------------------------------------
// Values: the five arms.

export const enum ValueKind {
  Static = 'static',
  Read = 'read',
  Computed = 'computed',
  Qrl = 'qrl',
  Render = 'render',
}

export const enum ResumeKind {
  Qrl = 'qrl',
  InitialOnly = 'initial-only',
  Inline = 'inline',
}

export type Value = { result?: Result; range?: Range } & (
  | {
      v: ValueKind.Static;
      /** Absent `value` = undefined. */
      value?: string | number | boolean | null;
    }
  /** Resumes by subscription. */
  | { v: ValueKind.Read; place: PlaceIR; expr: Expr }
  | {
      v: ValueKind.Computed;
      expr: Expr;
      resume:
        | { r: ResumeKind.Qrl; qrl: QrlUse }
        | { r: ResumeKind.InitialOnly }
        | { r: ResumeKind.Inline };
      compilerString: boolean;
    }
  | { v: ValueKind.Qrl; use: QrlUse; expr?: Expr }
  | { v: ValueKind.Render; program: ProgramId }
);

export const enum ArgPass {
  Binding = 'binding',
  This = 'this',
  Arguments = 'arguments',
  Props = 'props',
  StyleScope = 'style-scope',
}

/**
 * Use-site args are POSITIONS against `Qrl.captures` — names/kinds come from the binding table,
 * never duplicated here, so args and captures cannot disagree.
 */
export interface QrlUse {
  qrl: QrlId;
  args: (
    | { pass: ArgPass.Binding; binding: LocalId }
    | { pass: ArgPass.This }
    | { pass: ArgPass.Arguments; binding: LocalId | null }
    | { pass: ArgPass.Props }
    | { pass: ArgPass.StyleScope }
  )[];
}
