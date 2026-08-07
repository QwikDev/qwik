import type { ValueIR } from './expr-ir';
import type { BindingId } from './plan-types';

/**
 * Component setup opcodes (specs/03-setup-opcodes.md), compiler-internal v1 form.
 *
 * Locals and context ids stay keyed by `BindingId` until plan emission resolves places/slots. A
 * statement without an op falls back to verbatim JS, exactly like unlowered expressions;
 * `use-on`/styles remain unrepresented (styles already have their own `StyleSetupPlan`).
 */
export const enum SetupOpKind {
  Signal = 'signal',
  Store = 'store',
  Const = 'const',
  UseId = 'use-id',
  ContextRead = 'context-read',
  ContextProvider = 'context-provider',
  ServerData = 'server-data',
  Computed = 'computed',
  Task = 'task',
  VisibleTask = 'visible-task',
  Style = 'style',
  Js = 'js',
  Statement = 'statement',
  QrlConst = 'qrl-const',
  RenderFn = 'render-fn',
}

export const enum TaskStepKind {
  SetSignal = 'set-signal',
  SetStore = 'set-store',
  If = 'if',
  Let = 'let',
  Return = 'return',
}

export type SetupOp =
  | { readonly kind: SetupOpKind.Signal; readonly binding: BindingId; readonly init: ValueIR }
  | {
      readonly kind: SetupOpKind.Store;
      readonly binding: BindingId;
      readonly init: ValueIR;
      readonly deep: boolean;
    }
  | { readonly kind: SetupOpKind.Const; readonly binding: BindingId; readonly init: ValueIR }
  | { readonly kind: SetupOpKind.UseId; readonly binding: BindingId }
  /** Evaluate-and-discard expression statement; `await: true` marks awaited ones. */
  | { readonly kind: SetupOpKind.Statement; readonly value: ValueIR; readonly await?: true }
  /** `const fn = $(…)` — the local holds the segment's QRL value. */
  | { readonly kind: SetupOpKind.QrlConst; readonly binding: BindingId; readonly segment: string }
  | {
      readonly kind: SetupOpKind.ContextRead;
      readonly binding: BindingId;
      readonly context: BindingId;
    }
  | {
      readonly kind: SetupOpKind.ContextProvider;
      readonly context: BindingId;
      readonly value: ValueIR;
    }
  | {
      readonly kind: SetupOpKind.ServerData;
      readonly binding: BindingId;
      readonly key: ValueIR;
      readonly fallback: ValueIR | null;
    }
  | {
      readonly kind: SetupOpKind.Computed;
      readonly binding: BindingId;
      /** QRL segment id — the client resumes via this chunk (the `Reactive` pairing). */
      readonly segment: string;
      /** Portable body when single-expression; null keeps the segment-only (JS) evaluation. */
      readonly body: ValueIR | null;
    }
  | {
      readonly kind: SetupOpKind.Task;
      readonly segment: string;
      /** Portable body; null keeps segment-only evaluation. Reads auto-track (v3 semantics). */
      readonly body: TaskBody | null;
    }
  | {
      readonly kind: SetupOpKind.VisibleTask;
      readonly segment: string;
      /** Client-only carrier; the body never runs during SSR. */
      readonly strategy: 'intersection-observer' | 'document-ready' | 'document-idle';
    };

/**
 * Restricted statement IR for server-executed task bodies (specs/03). v3 tasks auto-track: every
 * subscribing read in the steps records a dependency unless wrapped in `untrack`.
 */
export interface TaskBody {
  readonly steps: readonly TaskStep[];
  readonly async: boolean;
}

export type TaskStep =
  | { readonly s: TaskStepKind.SetSignal; readonly binding: BindingId; readonly value: ValueIR }
  | {
      readonly s: TaskStepKind.SetStore;
      readonly binding: BindingId;
      readonly path: readonly (string | ValueIR)[];
      readonly value: ValueIR;
    }
  | {
      readonly s: TaskStepKind.If;
      readonly test: ValueIR;
      readonly then: readonly TaskStep[];
      readonly else: readonly TaskStep[];
    }
  | { readonly s: TaskStepKind.Let; readonly binding: BindingId; readonly value: ValueIR }
  | { readonly s: TaskStepKind.Return; readonly value: ValueIR | null };
