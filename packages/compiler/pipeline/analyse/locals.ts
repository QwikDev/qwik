import { CaptureAccess, type LocalId } from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';

/** Local value semantics shared by expression and capture lowering. */
export const enum LocalKind {
  Const = 'const',
  Qrl = 'qrl',
  Signal = 'signal',
  /** A collection row parameter — captured as LoopValue, delivered per row. */
  LoopValue = 'loop-value',
  /** A collection index parameter — a per-row signal box updated by the reconciler. */
  RowIndex = 'row-index',
  /** A prop member for wrapped destructured props */
  PropMember = 'prop-member',
}

export type SetupLocal =
  | {
      /** Read-lowering dispatch (how `x`/`x.value` lowers). */
      kind: Exclude<LocalKind, LocalKind.PropMember>;
      /** Delivery contract when a QRL captures this local. */
      access: CaptureAccess;
      slot: number;
      binding: number;
    }
  | {
      kind: LocalKind.PropMember;
      access: CaptureAccess.LoopValue | CaptureAccess.ComponentProp;
      slot: -1;
      binding: number;
      member: string;
      defaultValue?: ValueIR;
    };

/** Local bindings and their expression-read and capture contracts. */
export type SetupLocals = Map<LocalId, SetupLocal>;

export function localReadIr(local: SetupLocal): ValueIR | null {
  if (local.kind === LocalKind.RowIndex) {
    return { kind: ValueIrKind.SignalRead, binding: local.binding };
  }
  if (local.kind !== LocalKind.PropMember) {
    return null;
  }
  if (local.defaultValue !== undefined) {
    return {
      kind: ValueIrKind.PropRead,
      binding: local.binding,
      name: local.member,
      fallback: local.defaultValue,
    };
  }
  return {
    kind: ValueIrKind.Member,
    obj: { kind: ValueIrKind.BindingRead, binding: local.binding },
    name: local.member,
  };
}
