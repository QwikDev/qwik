import type { LocalId } from './shared';

/**
 * Portable expression IR the value vocabulary every generator and engine reads.
 *
 * Reads are pre-place-resolution: `signal-read` and `store-read` are emitted only when the source
 * kind is proven (typed reads are fast paths, never semantic requirements); `binding-read` is the
 * generic "current runtime value of this binding" read. Plan emission later resolves bindings to
 * places (setup slots, props, row scopes) — until then the IR stays keyed by `LocalId`.
 */
export const enum ValueIrKind {
  Lit = 'lit',
  Undef = 'undef',
  SignalRead = 'signal-read',
  StoreRead = 'store-read',
  BindingRead = 'binding-read',
  Member = 'member',
  PropRead = 'prop-read',
  Index = 'index',
  Unary = 'unary',
  Bin = 'bin',
  Logic = 'logic',
  Cond = 'cond',
  Template = 'template',
  Array = 'array',
  Object = 'object',
}

export type ValueIR<TExtension = never> =
  | TExtension
  | { readonly kind: ValueIrKind.Lit; readonly value: string | number | boolean | null }
  | { readonly kind: ValueIrKind.Undef }
  | { readonly kind: ValueIrKind.SignalRead; readonly binding: LocalId }
  | {
      readonly kind: ValueIrKind.StoreRead;
      readonly binding: LocalId;
      readonly path: readonly (string | ValueIR<TExtension>)[];
    }
  | { readonly kind: ValueIrKind.BindingRead; readonly binding: LocalId }
  | {
      readonly kind: ValueIrKind.PropRead;
      readonly binding: LocalId;
      readonly name: string;
      readonly fallback: ValueIR<TExtension>;
    }
  | {
      readonly kind: ValueIrKind.Member;
      readonly obj: ValueIR<TExtension>;
      readonly name: string;
      readonly optional?: true;
    }
  | {
      readonly kind: ValueIrKind.Index;
      readonly obj: ValueIR<TExtension>;
      readonly key: ValueIR<TExtension>;
      readonly optional?: true;
    }
  | {
      readonly kind: ValueIrKind.Unary;
      readonly op: ValueIrUnaryOp;
      readonly operand: ValueIR<TExtension>;
    }
  | {
      readonly kind: ValueIrKind.Bin;
      readonly op: ValueIrBinOp;
      readonly left: ValueIR<TExtension>;
      readonly right: ValueIR<TExtension>;
    }
  | {
      readonly kind: ValueIrKind.Logic;
      readonly op: ValueIrLogicOp;
      readonly left: ValueIR<TExtension>;
      readonly right: ValueIR<TExtension>;
    }
  | {
      readonly kind: ValueIrKind.Cond;
      readonly test: ValueIR<TExtension>;
      readonly then: ValueIR<TExtension>;
      readonly else: ValueIR<TExtension>;
    }
  | {
      readonly kind: ValueIrKind.Template;
      readonly parts: readonly (string | ValueIR<TExtension>)[];
    }
  | { readonly kind: ValueIrKind.Array; readonly items: readonly ValueIR<TExtension>[] }
  | {
      readonly kind: ValueIrKind.Object;
      readonly entries: readonly (readonly [string, ValueIR<TExtension>])[];
    };

export type ValueIrUnaryOp = '!' | '-' | '+' | 'typeof';

export type ValueIrBinOp =
  | '==='
  | '!=='
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '**';

export type ValueIrLogicOp = '&&' | '||' | '??';

/**
 * Every binding the IR reads. Emitters may inline a portable lowering instead of resuming through
 * its segment, so the owning chunk has to import whatever the inlined form names.
 */
export function collectIrBindingIds(ir: ValueIR | undefined, into: Set<LocalId>): void {
  if (ir === undefined || ir === null) {
    return;
  }
  if (
    ir.kind === ValueIrKind.BindingRead ||
    ir.kind === ValueIrKind.SignalRead ||
    ir.kind === ValueIrKind.PropRead
  ) {
    into.add(ir.binding);
  }
  for (const value of Object.values(ir)) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectIrBindingIds(item as ValueIR, into));
    } else if (value !== null && typeof value === 'object') {
      collectIrBindingIds(value as ValueIR, into);
    }
  }
}
