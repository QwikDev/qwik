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
}

export type ValueIR =
  | { readonly k: ValueIrKind.Lit; readonly v: string | number | boolean | null }
  | { readonly k: ValueIrKind.Undef }
  | { readonly k: ValueIrKind.SignalRead; readonly binding: BindingId }
  | { readonly k: ValueIrKind.BindingRead; readonly binding: BindingId }
  | {
      readonly k: ValueIrKind.Member;
      readonly obj: ValueIR;
      readonly name: string;
      readonly optional?: true;
    }
  | {
      readonly k: ValueIrKind.Index;
      readonly obj: ValueIR;
      readonly key: ValueIR;
      readonly optional?: true;
    }
  | { readonly k: ValueIrKind.Unary; readonly op: ValueIrUnaryOp; readonly a: ValueIR }
  | {
      readonly k: ValueIrKind.Bin;
      readonly op: ValueIrBinOp;
      readonly a: ValueIR;
      readonly b: ValueIR;
    }
  | {
      readonly k: ValueIrKind.Logic;
      readonly op: ValueIrLogicOp;
      readonly a: ValueIR;
      readonly b: ValueIR;
    }
  | {
      readonly k: ValueIrKind.Cond;
      readonly test: ValueIR;
      readonly then: ValueIR;
      readonly else: ValueIR;
    }
  | { readonly k: ValueIrKind.Template; readonly parts: readonly (string | ValueIR)[] }
  | { readonly k: ValueIrKind.Array; readonly items: readonly ValueIR[] }
  | { readonly k: ValueIrKind.Object; readonly entries: readonly (readonly [string, ValueIR])[] }
  | {
      readonly k: ValueIrKind.Call;
      /**
       * `qwik:<ns>.<op>` — internal-plugin op id; method ops dispatch on the receiver's runtime
       * type.
       */
      readonly fn: string;
      readonly recv: ValueIR | null;
      readonly args: readonly (ValueIR | LambdaIR)[];
    }
  | {
      readonly k: ValueIrKind.DefCall;
      /** Index into the module's `defs` table. */
      readonly def: number;
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
