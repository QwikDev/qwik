/** Programs, render ops, props, and setup (DESIGN.md "Model" — programs/ops/setup). */
import type {
  LifetimeId,
  LocalId,
  PayloadId,
  PlaceIR,
  Predicate,
  ProgramId,
  Seed,
  Shape,
} from './shared';
import type { Expr, QrlUse, Value } from './value';

// ---------------------------------------------------------------------------------------------
// Program: ONE shape for every render scope — component body, branch arm, row, projection,
// fallback, embedded render, local component. The envelope always survives; only the body is
// lowered-or-JS. Ownership is one-directional (Qrl.body → ProgramId); a program's resume
// identity is derived, never stored twice.

export const enum ProgramBodyKind {
  Ops = 'ops',
  Js = 'js',
}

export interface Program {
  body: { kind: ProgramBodyKind.Ops; ops: Op[] } | { kind: ProgramBodyKind.Js; payload: PayloadId };
  setup: Setup[];
  params: LocalId[];
  lifetime: LifetimeId;
  /** JSX as a call argument → deferred root. */
  argumentPosition?: true;
  /** Intra-module fact; cross-module joins land on `LinkedProgram.facts`. */
  needsId: boolean;
  /** Authored syntax; scheduling derives from setup at link. */
  async: boolean;
}

// ---------------------------------------------------------------------------------------------
// Render ops

export const enum OpKind {
  Static = 'static',
  Element = 'element',
  Hole = 'hole',
  Component = 'component',
  Branch = 'branch',
  Each = 'each',
  Slot = 'slot',
  DynamicSlot = 'dynamic-slot',
  Suspense = 'suspense',
}

export const enum ComponentTargetKind {
  Raw = 'raw',
  Declaration = 'declaration',
  Dynamic = 'dynamic',
}

export const enum ComponentPropsKind {
  Entries = 'entries',
  Proxy = 'proxy',
}

export const enum EachSourceKind {
  Array = 'array',
  Reactive = 'reactive',
  Derived = 'derived',
}

export const enum RowKind {
  Chunk = 'chunk',
  Inline = 'inline',
}

/** Mirrors the runtime's IndexMode wire codes — how rows consume their index. */
export const enum IndexMode {
  None = 0,
  /** Index read only by row-owned effects: in-memory signals, nothing serialized. */
  Effects = 1,
  /** A closure holds the index past render: signals serialize to keep identity. */
  Escapes = 2,
}

export type Op =
  | { op: OpKind.Static; html: string }
  | {
      op: OpKind.Element;
      tag: string;
      void: boolean;
      styleScopedId: string | null;
      runtimeScope: boolean;
      props: Prop[];
      propsEffect: QrlUse | null;
      children: Op[];
    }
  | {
      op: OpKind.Hole;
      value: Value;
      shape: Shape;
      effect: number | null;
      /** A concat operand keeps JS `String()` coercion instead of JSX text coercion. */
      stringify: boolean;
    }
  | {
      op: OpKind.Component;
      target:
        | { t: ComponentTargetKind.Raw; binding: LocalId }
        | { t: ComponentTargetKind.Dynamic; place: PlaceIR };
      props:
        | { c: ComponentPropsKind.Entries; props: Prop[] }
        | { c: ComponentPropsKind.Proxy; compute: QrlUse };
      projections: { name: string; use: QrlUse; id: Seed }[];
      id: Seed;
      lifetime: LifetimeId;
      blockingSuspense: boolean;
    }
  | {
      op: OpKind.Branch;
      condition: Value;
      /** Set when the condition is a recognized build constant; the linker folds by it. */
      predicate?: Predicate;
      then: QrlUse;
      else: QrlUse | null;
      id: Seed;
      lifetime: LifetimeId;
    }
  | {
      op: OpKind.Each;
      source: { s: EachSourceKind; value: Value };
      key: Value | null;
      row:
        | { r: RowKind.Chunk; use: QrlUse }
        /** The row symbol is generator-owned; `renderId` links declaration and call site. */
        | { r: RowKind.Inline; program: ProgramId; renderId: string };
      index: IndexMode;
      id: Seed;
      lifetime: LifetimeId;
      shape: Shape;
    }
  | { op: OpKind.Slot; name: string; nameValue?: Value; fallback: ProgramId | null; id: Seed }
  | { op: OpKind.DynamicSlot; program: ProgramId; id: Seed }
  | {
      op: OpKind.Suspense;
      content: ProgramId;
      contentId: Seed;
      fallback: ProgramId | Value | null;
      fallbackId: Seed;
      delay: Value | null;
      blocking: boolean;
      lifetime: LifetimeId;
      reveal?: { group: number; order: string; collapsed: boolean; index: number; count: number };
    };

export const enum PropKind {
  Static = 'static',
  Dynamic = 'dynamic',
  Spread = 'spread',
  Event = 'event',
  Bind = 'bind',
  Ref = 'ref',
  InnerHtml = 'inner-html',
}

export const enum HandlerKind {
  Value = 'value',
  Bind = 'bind',
}

export const enum BindName {
  Value = 'value',
  Checked = 'checked',
}

export const enum RefMode {
  Signal = 'signal',
  Function = 'function',
  Unknown = 'unknown',
}

export type Prop =
  | { k: PropKind.Static; name: string; value?: string | number | boolean | null }
  | {
      k: PropKind.Dynamic;
      name: string;
      value: Value;
      effect: number | null;
      styleScopedId?: string | null;
    }
  | { k: PropKind.Spread; value: Value; effect: number | null }
  | {
      k: PropKind.Event;
      name: string;
      passive: boolean;
      handlers: ({ h: HandlerKind.Value; value: Value } | { h: HandlerKind.Bind; bind: number })[];
    }
  | {
      k: PropKind.Bind;
      name: BindName;
      signal: PlaceIR;
      controlsValue: boolean;
      effect: number | null;
    }
  /** Refs RUN in SSR. */
  | { k: PropKind.Ref; value: Value; mode: RefMode }
  | { k: PropKind.InnerHtml; value: Value; effect: number | null };

// ---------------------------------------------------------------------------------------------
// Setup: closed per-op invocations. One invocation MACHINERY (result binding, guards, QRL args),
// but each op's signature is TYPED — a result-bearing use-on or a QRL-free use-task is
// unrepresentable. Custom hooks stay separate (`SetupKind.Hook`).

export const enum BindTargetKind {
  Slot = 'slot',
  Pattern = 'pattern',
}

export type BindTarget =
  | { bind: BindTargetKind.Slot; slot: number }
  | { bind: BindTargetKind.Pattern; pattern: PayloadId; bindings: LocalId[] };

export const enum ArgKind {
  Value = 'value',
  Expr = 'expr',
  Qrl = 'qrl',
}

/** Plain callbacks/factories pass as value/expr; resumable ops require their QRL. */
export type Arg =
  | { a: ArgKind.Value; value: Value }
  | { a: ArgKind.Expr; expr: Expr }
  | { a: ArgKind.Qrl; use: QrlUse };

export const enum InvokeKind {
  UseSignal = 'use-signal',
  UseStore = 'use-store',
  UseConstant = 'use-constant',
  UseServerData = 'use-server-data',
  UseComputed = 'use-computed',
  UseAsync = 'use-async',
  UseSerializer = 'use-serializer',
  UseTask = 'use-task',
  UseVisibleTask = 'use-visible-task',
  UseOn = 'use-on',
  UseOnDocument = 'use-on-document',
  UseOnWindow = 'use-on-window',
  UseContext = 'use-context',
  UseContextProvider = 'use-context-provider',
}

export const enum VisibleTaskStrategy {
  IntersectionObserver = 'intersection-observer',
  DocumentReady = 'document-ready',
  DocumentIdle = 'document-idle',
}

export type Invoke =
  | { op: InvokeKind.UseSignal; result: BindTarget; initial?: Arg }
  | { op: InvokeKind.UseStore; result: BindTarget; initial: Arg; deep: boolean; reactive: boolean }
  /** Untracked, variadic. */
  | { op: InvokeKind.UseConstant; result: BindTarget; callback: Arg; extraArgs: Arg[] }
  | { op: InvokeKind.UseServerData; result: BindTarget; key: Arg; fallback?: Arg }
  /** Resumable ⇒ QRL required; async-ness is runtime-discovered. */
  | { op: InvokeKind.UseComputed; result: BindTarget; qrl: QrlUse }
  | { op: InvokeKind.UseAsync; result: BindTarget; qrl: QrlUse; options?: Arg }
  | { op: InvokeKind.UseSerializer; result: BindTarget; qrl: QrlUse }
  | { op: InvokeKind.UseTask; qrl: QrlUse; deferUpdates?: boolean }
  /** ONE owner for the strategy. */
  | { op: InvokeKind.UseVisibleTask; qrl: QrlUse; strategy: VisibleTaskStrategy }
  /** Event may be array/dynamic. */
  | {
      op: InvokeKind.UseOn | InvokeKind.UseOnDocument | InvokeKind.UseOnWindow;
      event: Arg;
      handler: Arg;
      passive?: boolean;
      capture?: boolean;
    }
  /** Overloads = ordered args. */
  | { op: InvokeKind.UseContext; result: BindTarget; context: LocalId; extraArgs: Arg[] }
  | { op: InvokeKind.UseContextProvider; context: LocalId; value: Arg };

export const enum SetupKind {
  Const = 'const',
  Invoke = 'invoke',
  Hook = 'hook',
  UseId = 'use-id',
  Style = 'style',
  LocalComponent = 'local-component',
  RenderValue = 'render-value',
  Js = 'js',
}

export type Setup =
  /** Plain consts AND `$()` consts (value: {v: ValueKind.Qrl}). */
  | { s: SetupKind.Const; result: BindTarget; value: Value; guard?: Predicate }
  | { s: SetupKind.Invoke; invoke: Invoke; guard?: Predicate }
  | {
      s: SetupKind.Hook;
      binding: LocalId;
      args: Arg[];
      result: BindTarget | null;
      guard?: Predicate;
    }
  /** Compiler intrinsic. */
  | { s: SetupKind.UseId; result: BindTarget; ordinal: number; guard?: Predicate }
  /** THE single style owner — module-level styles too. */
  | {
      s: SetupKind.Style;
      ordinal: number;
      scoped: boolean;
      css: string | { dynamic: PayloadId };
      result: BindTarget | null;
      guard?: Predicate;
    }
  | {
      s: SetupKind.LocalComponent;
      program: ProgramId;
      id: string;
      name: string;
      parameter: ComponentParameter | null;
      guard?: Predicate;
    }
  | {
      s: SetupKind.RenderValue;
      result: BindTarget;
      program: ProgramId;
      id: string;
      guard?: Predicate;
    }
  /** Runtime needs derive from the payload rewrites — no second op list to maintain. */
  | { s: SetupKind.Js; payload: PayloadId; guard?: Predicate };

export const enum SurfaceKind {
  Object = 'object',
  Identifier = 'identifier',
}

export interface ComponentParameter {
  pattern: PayloadId;
  surface:
    | { kind: SurfaceKind.Object; bindings: { binding: LocalId; name: string }[] }
    | { kind: SurfaceKind.Identifier; binding: LocalId };
}
