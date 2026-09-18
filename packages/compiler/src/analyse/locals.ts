import { CaptureAccess, type LocalId, type QrlUse } from '../schema';
import { ValueIrKind, type ValueIR } from '../schema/value-ir';

/** Local value semantics shared by expression and capture lowering. */
export const enum LocalKind {
  Const = 'const',
  Mutable = 'mutable',
  Qrl = 'qrl',
  Signal = 'signal',
  /** A `useStore` result: member reads through it stay live. */
  Store = 'store',
  /** A collection row parameter — captured as LoopValue, delivered per row. */
  LoopValue = 'loop-value',
  /** A collection index parameter — a per-row signal box updated by the reconciler. */
  RowIndex = 'row-index',
  /** A prop member for wrapped destructured props */
  PropMember = 'prop-member',
  PropRest = 'prop-rest',
  /** A body function lifted to a segment: callers capture its captures and rebind it. */
  Function = 'function',
}

export type SetupLocal =
  | {
      /** Read-lowering dispatch (how `x`/`x.value` lowers). */
      kind: Exclude<LocalKind, LocalKind.PropMember | LocalKind.Function>;
      /** Delivery contract when a QRL captures this local. */
      access: CaptureAccess;
      slot: number;
      binding: number;
    }
  | {
      kind: LocalKind.PropMember;
      access: CaptureAccess.LoopValue | CaptureAccess.ComponentProp | CaptureAccess.Direct;
      slot: -1;
      binding: number;
      /** How the member reads from its owner, e.g. `props.user.tags[0]`. */
      read: ValueIR;
      defaultValue?: ValueIR;
    }
  | {
      kind: LocalKind.Function;
      access: CaptureAccess.Direct;
      slot: -1;
      binding: number;
      /** Lifts the function to a segment on its first boundary reference; memoized. */
      lift: () => QrlUse;
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
  const { read, defaultValue } = local;
  if (defaultValue === undefined) {
    return read;
  }
  // A direct member keeps the linker's default-aware read; a deeper path spells the check out.
  if (read.kind === ValueIrKind.Member && read.obj.kind === ValueIrKind.BindingRead) {
    return {
      kind: ValueIrKind.PropRead,
      binding: read.obj.binding,
      name: read.name,
      fallback: defaultValue,
    };
  }
  return {
    kind: ValueIrKind.Cond,
    test: { kind: ValueIrKind.Bin, op: '===', left: read, right: { kind: ValueIrKind.Undef } },
    then: defaultValue,
    else: read,
  };
}

/** A direct member read, `owner.name`. */
export function memberReadIr(owner: number, name: string): ValueIR {
  return { kind: ValueIrKind.Member, obj: { kind: ValueIrKind.BindingRead, binding: owner }, name };
}
