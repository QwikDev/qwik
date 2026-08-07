import type { BindingId } from './plan-types';

/**
 * Portable expression IR (specs/02-expression-ir.md), compiler-internal form.
 *
 * Reads are pre-place-resolution: `signal-read` is emitted only when signal-ness is proven (typed
 * reads are fast paths, never semantic requirements); `binding-read` is the generic "current
 * runtime value of this binding" read. Plan emission later resolves bindings to places (setup
 * slots, props, row scopes) — until then the IR stays keyed by `BindingId`.
 */
export const enum ValueIrKind {
  Lit = 'lit',
  Undef = 'undef',
  SignalRead = 'signal-read',
  BindingRead = 'binding-read',
  Member = 'member',
  Index = 'index',
  Unary = 'unary',
  Bin = 'bin',
  Logic = 'logic',
  Cond = 'cond',
  Template = 'template',
  Array = 'array',
  Object = 'object',
  Call = 'call',
  DefCall = 'def-call',
  PluginCall = 'plugin-call',
}

export type ValueIR =
  | { readonly kind: ValueIrKind.Lit; readonly value: string | number | boolean | null }
  | { readonly kind: ValueIrKind.Undef }
  | { readonly kind: ValueIrKind.SignalRead; readonly binding: BindingId }
  | { readonly kind: ValueIrKind.BindingRead; readonly binding: BindingId }
  | {
      readonly kind: ValueIrKind.Member;
      readonly obj: ValueIR;
      readonly name: string;
      readonly optional?: true;
    }
  | {
      readonly kind: ValueIrKind.Index;
      readonly obj: ValueIR;
      readonly key: ValueIR;
      readonly optional?: true;
    }
  | { readonly kind: ValueIrKind.Unary; readonly op: ValueIrUnaryOp; readonly operand: ValueIR }
  | {
      readonly kind: ValueIrKind.Bin;
      readonly op: ValueIrBinOp;
      readonly left: ValueIR;
      readonly right: ValueIR;
    }
  | {
      readonly kind: ValueIrKind.Logic;
      readonly op: ValueIrLogicOp;
      readonly left: ValueIR;
      readonly right: ValueIR;
    }
  | {
      readonly kind: ValueIrKind.Cond;
      readonly test: ValueIR;
      readonly then: ValueIR;
      readonly else: ValueIR;
    }
  | { readonly kind: ValueIrKind.Template; readonly parts: readonly (string | ValueIR)[] }
  | { readonly kind: ValueIrKind.Array; readonly items: readonly ValueIR[] }
  | { readonly kind: ValueIrKind.Object; readonly entries: readonly (readonly [string, ValueIR])[] }
  | {
      readonly kind: ValueIrKind.Call;
      /**
       * `qwik:<ns>.<op>` — internal-plugin op id; method ops dispatch on the receiver's runtime
       * type.
       */
      readonly fn: string;
      readonly receiver: ValueIR | null;
      readonly args: readonly (ValueIR | LambdaIR)[];
    }
  | {
      readonly kind: ValueIrKind.DefCall;
      /** Index into the module's `defs` table. */
      readonly def: number;
      readonly args: readonly ValueIR[];
    }
  | {
      readonly kind: ValueIrKind.PluginCall;
      /** `plugin:<module>:<export>` — user-plugin fn id (specs/09). */
      readonly fnId: string;
      readonly args: readonly ValueIR[];
    };

/** Restricted lambda: only as a direct argument to a higher-order op; pure by construction. */
export interface LambdaIR {
  readonly kind: 'lambda';
  readonly params: readonly { readonly name: string; readonly binding: BindingId | null }[];
  readonly body: ValueIR;
}

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
