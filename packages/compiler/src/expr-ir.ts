import type { BindingId } from './plan-types';

/**
 * Portable expression IR (specs/02-expression-ir.md), compiler-internal form.
 *
 * Reads are pre-place-resolution: `signal-read` is emitted only when signal-ness is proven (typed
 * reads are fast paths, never semantic requirements); `binding-read` is the generic "current
 * runtime value of this binding" read. Plan emission later resolves bindings to places (setup
 * slots, props, row scopes) — until then the IR stays keyed by `BindingId`.
 */
export type ValueIR =
  | { readonly k: 'lit'; readonly v: string | number | boolean | null }
  | { readonly k: 'undef' }
  | { readonly k: 'signal-read'; readonly binding: BindingId }
  | { readonly k: 'binding-read'; readonly binding: BindingId }
  | { readonly k: 'member'; readonly obj: ValueIR; readonly name: string; readonly optional?: true }
  | { readonly k: 'index'; readonly obj: ValueIR; readonly key: ValueIR; readonly optional?: true }
  | { readonly k: 'unary'; readonly op: ValueIrUnaryOp; readonly a: ValueIR }
  | { readonly k: 'bin'; readonly op: ValueIrBinOp; readonly a: ValueIR; readonly b: ValueIR }
  | { readonly k: 'logic'; readonly op: ValueIrLogicOp; readonly a: ValueIR; readonly b: ValueIR }
  | { readonly k: 'cond'; readonly test: ValueIR; readonly then: ValueIR; readonly else: ValueIR }
  | { readonly k: 'template'; readonly parts: readonly (string | ValueIR)[] }
  | { readonly k: 'array'; readonly items: readonly ValueIR[] }
  | { readonly k: 'object'; readonly entries: readonly (readonly [string, ValueIR])[] };

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
