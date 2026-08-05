import type { ValueIR } from './expr-ir';
import type { BindingId } from './plan-types';

/**
 * Component setup opcodes (specs/03-setup-opcodes.md), compiler-internal v1 form.
 *
 * Locals and context ids stay keyed by `BindingId` until plan emission resolves places/slots.
 * QRL-carrying hooks (computed/task/visible-task/use-on/styles) are not represented yet — a
 * statement without an op falls back to verbatim JS, exactly like unlowered expressions.
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
    };
