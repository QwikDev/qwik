import type { ValueIR } from './value-ir';
import type { LocalId } from './shared';

/** Analysis-only result arms; the executable vocabulary is `ValueIrKind`. */
export const enum ResultKind {
  Unknown = 'unknown-result',
  SpreadArgument = 'spread-argument-result',
  Render = 'render-result',
  Scalar = 'scalar-result',
  Number = 'number-result',
  String = 'string-result',
  Initializer = 'initializer-result',
  Element = 'element-result',
  ArrayRest = 'array-rest-result',
  Default = 'default-result',
  Union = 'union-result',
  Function = 'function-result',
  Invoke = 'invoke-result',
  Spread = 'spread-result',
  Rest = 'rest-result',
}

/** Analysis-only extensions; executable expressions keep their original lowering. */
export type Result = ValueIR<
  | { kind: ResultKind.Unknown }
  | { kind: ResultKind.SpreadArgument }
  | { kind: ResultKind.Render }
  | { kind: ResultKind.Scalar }
  | { kind: ResultKind.Number }
  | { kind: ResultKind.String }
  | { kind: ResultKind.Initializer; value: Result }
  | { kind: ResultKind.Element; source: Result }
  | { kind: ResultKind.ArrayRest; source: Result; start: number }
  | { kind: ResultKind.Default; value: Result; fallback: Result }
  | { kind: ResultKind.Union; values: Result[] }
  | { kind: ResultKind.Function; params: (LocalId | null)[]; result: Result }
  | { kind: ResultKind.Invoke; callee: Result; args: Result[] }
  | {
      kind: ResultKind.Spread;
      parts: ({ name: string; value: Result } | { name: null; value: Result })[];
    }
  | { kind: ResultKind.Rest; source: Result; excluded: string[]; hasComputedExclusions?: true }
>;

export interface BindingConsumer {
  path: string[];
  target: Result;
  argument: number;
  property?: string;
}

export interface BindingResult {
  value: Result;
  writes: { path: string[]; value: Result }[];
  escapes: string[][];
  consumers?: BindingConsumer[];
}
