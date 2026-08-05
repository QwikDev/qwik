import type { ValueIR } from './expr-ir';
import type { BindingId } from './plan-types';

/**
 * Component setup opcodes (specs/03-setup-opcodes.md), compiler-internal v1 form.
 *
 * Locals and context ids stay keyed by `BindingId` until plan emission resolves places/slots. A
 * statement without an op falls back to verbatim JS, exactly like unlowered expressions;
 * `use-on`/styles remain unrepresented (styles already have their own `StyleSetupPlan`).
 */
export type SetupOp =
  | { readonly op: 'signal'; readonly local: BindingId; readonly init: ValueIR }
  | {
      readonly op: 'store';
      readonly local: BindingId;
      readonly init: ValueIR;
      readonly deep: boolean;
    }
  | { readonly op: 'const'; readonly local: BindingId; readonly init: ValueIR }
  | { readonly op: 'use-id'; readonly local: BindingId }
  | { readonly op: 'context-read'; readonly local: BindingId; readonly context: BindingId }
  | { readonly op: 'context-provider'; readonly context: BindingId; readonly value: ValueIR }
  | {
      readonly op: 'server-data';
      readonly local: BindingId;
      readonly key: ValueIR;
      readonly fallback: ValueIR | null;
    }
  | {
      readonly op: 'computed';
      readonly local: BindingId;
      /** QRL segment id — the client resumes via this chunk (the `Reactive` pairing). */
      readonly segment: string;
      /** Portable body when single-expression; null keeps the segment-only (JS) evaluation. */
      readonly body: ValueIR | null;
    }
  | {
      readonly op: 'task';
      readonly segment: string;
      /** Portable body; null keeps segment-only evaluation. Reads auto-track (v3 semantics). */
      readonly body: TaskBody | null;
    }
  | {
      readonly op: 'visible-task';
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
  | { readonly s: 'set-signal'; readonly binding: BindingId; readonly value: ValueIR }
  | {
      readonly s: 'set-store';
      readonly binding: BindingId;
      readonly path: readonly (string | ValueIR)[];
      readonly value: ValueIR;
    }
  | {
      readonly s: 'if';
      readonly test: ValueIR;
      readonly then: readonly TaskStep[];
      readonly else: readonly TaskStep[];
    }
  | { readonly s: 'let'; readonly local: BindingId; readonly value: ValueIR }
  | { readonly s: 'return'; readonly value: ValueIR | null };
