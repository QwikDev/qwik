/**
 * LinkedPlan — materialized linked modules (DESIGN.md "Model" — LinkedPlan).
 *
 * Imports and raw targets become typed linked leaves, never overlays.
 */
import type {
  LINKED_PLAN_VERSION,
  BuildMode,
  Diagnostic,
  Environment,
  Lifetime,
  Maybe,
  ModuleKind,
  ModuleSource,
  LocalId,
  PayloadId,
  PlanFormat,
  QrlId,
  Range,
} from './shared';
import type { EsmEdge, Payload } from './value';
import {
  ComponentTargetKind,
  OpKind,
  ProgramBodyKind,
  type Op,
  type Program,
  type RuntimeTagFacts,
} from './program';
import type {
  AssemblyIntent,
  AssemblyKind,
  DeclTable,
  HookDecl,
  ModulePlan,
  Qrl,
} from './module-plan';

/** What will execute the plan. Only a native engine cares that a body is JavaScript text. */
export const enum PlanEngine {
  Js = 'js',
  Native = 'native',
}

export interface Specialization {
  environment: Environment;
  mode: BuildMode;
  /**
   * What this environment must not ship. The names are framework knowledge the host supplies; the
   * matching is generic. `exports` and `ctxName` strip from the environment being built;
   * `regCtxName` registers a boundary's implementation by symbol so the server can call it.
   */
  strip: {
    exports: string[];
    ctxName: string[];
    regCtxName: string[];
    /** The server never runs an event handler, so it keeps only the symbol. */
    eventHandlers?: boolean;
  };
  /** Boolean values the host defines, from vite env and `define`; a missing name stays a read. */
  constants?: Readonly<Record<string, boolean>>;
  /** Defaults to the JavaScript engine, which runs authored text as happily as IR. */
  engine?: PlanEngine;
}

export interface DeclRef {
  module: number;
  table: DeclTable;
  index: number;
}

export interface LinkedHook extends HookDecl {
  dependencies: LinkedQrl['dependencies'];
}

export interface LinkedModule {
  path: string;
  kind: ModuleKind;
  source: ModuleSource;
  bindings: ModulePlan['bindings'];
  invocations?: ModulePlan['invocations'];
  lifetimes: Lifetime[];
  /** Text materialized; reads/awaits/qrls intact. */
  payloads: Payload[];
  programs: LinkedProgram[];
  qrls: LinkedQrl[];
  hooks: LinkedHook[];
  natives: {
    name: string;
    binding: LocalId | null;
    markerRange: Range;
    jsImplementation: PayloadId;
  }[];
  defs: ModulePlan['defs'];
  edges: (EsmEdge & { target: Maybe<number>; runtime: boolean })[];
  imports: LinkedImport[];
  exports: ModulePlan['exports'];
  /** Plus linked edits on preserved spans: pruned ranges (dead imports) and stripped values. */
  assembly: (
    | AssemblyIntent
    | { a: AssemblyKind.StripRange; range: Range }
    | { a: AssemblyKind.StripValue; range: Range; form: StripValueForm }
  )[];
  /** Guards folded. */
  diagnostics: Diagnostic[];
}

type ElementOp = Extract<Op, { op: OpKind.Element }>;
type ComponentOp = Extract<Op, { op: OpKind.Component }>;

export type LinkedOp =
  | Exclude<Op, ElementOp | ComponentOp>
  | (Omit<ElementOp, 'children'> & { children: LinkedOp[] })
  | (Omit<ComponentOp, 'target'> & {
      target:
        | ({
            t: ComponentTargetKind.Declaration;
            binding: LocalId;
            declaration: Maybe<DeclRef>;
            /** The tag links to a plain value, so the runtime decides between element and component. */
            isValue: boolean;
            /** Whether the linked component reads `props.children`; unknown for an external one. */
            readsChildren: Maybe<boolean>;
          } & RuntimeTagFacts)
        | Extract<ComponentOp['target'], { t: ComponentTargetKind.Dynamic }>;
    });

export interface LinkedProgram extends Omit<Program, 'body'> {
  body:
    | { kind: ProgramBodyKind.Ops; ops: LinkedOp[] }
    | Extract<Program['body'], { kind: ProgramBodyKind.Expr }>;
  /** Cross-module joins land HERE — the owner the raw plan cannot have. */
  facts: {
    waitForTasks: Maybe<boolean>;
    providesContextEffective: Maybe<boolean>;
    /** Whether the setup registers `useOn*` events; unknown when a callee's body is not linked. */
    registersEvents: Maybe<boolean>;
    /** Whether its first element carries `useOn*` events: its own, or those of a component it roots. */
    carriesEvents: Maybe<boolean>;
    /** Whether the setup calls `useChildrenInfo()`, so the parent must describe its children. */
    readsChildrenInfo: Maybe<boolean>;
  };
  /** How many scalar writes each batched effect groups, by effect id. */
  effectSizes?: number[];
}

export const enum ImportTargetKind {
  Declaration = 'declaration',
  Namespace = 'namespace',
  TypeOnly = 'type-only',
}

type ImportSource = ModulePlan['imports'][number];

export type LinkedImport =
  | { kind: ImportTargetKind.Declaration; source: ImportSource; target: Maybe<DeclRef> }
  | { kind: ImportTargetKind.Namespace; source: ImportSource; target: Maybe<number> }
  | { kind: ImportTargetKind.TypeOnly; source: ImportSource };

/** What a stripped export's replacement has to be: an initializer, or a function body. */
export const enum StripValueForm {
  Initializer = 'initializer',
  Body = 'body',
}

export const enum DeliveryKind {
  Chunk = 'chunk',
  Omit = 'omit',
  Stripped = 'stripped',
  Register = 'register',
}

export interface LinkedQrl extends Qrl {
  /** `component$(X)` of a component: the declaration is `X` itself, not a second copy. */
  aliasOf?: LocalId;
  /** Direct executable references, excluding bodies behind another QRL boundary. */
  dependencies: { bindings: LocalId[]; qrls: QrlId[] };
  /** Full delivery states, per environment link; chunk naming decided at link, not in neutral data. */
  delivery:
    | { d: DeliveryKind.Chunk }
    | { d: DeliveryKind.Omit }
    | { d: DeliveryKind.Stripped }
    | { d: DeliveryKind.Register; symbol: string };
}

export const enum EntryKind {
  Module = 'module',
  Export = 'export',
}

export interface LinkedPlan {
  format: PlanFormat.LinkedPlan;
  version: typeof LINKED_PLAN_VERSION;
  specialization: Specialization;
  /**
   * Incomplete = per-module transform link (unreached refs are typed unknowns); artifacts and
   * native generation REQUIRE a complete link.
   */
  complete: boolean;
  entries: (
    | { kind: EntryKind.Module; module: number }
    | { kind: EntryKind.Export; module: number; export: string; target: Maybe<DeclRef> }
  )[];
  modules: LinkedModule[];
  diagnostics: { module: number; diagnostic: Diagnostic }[];
}

export const enum LinkResultKind {
  Linked = 'linked',
  Failed = 'failed',
}

export type LinkResult =
  | { kind: LinkResultKind.Linked; plan: LinkedPlan }
  | {
      kind: LinkResultKind.Failed;
      diagnostics: { module: string; code: string; message: string }[];
    };
