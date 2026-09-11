import type { ValueIR } from '../../src/expr-ir';
import type { LocalId } from './shared';

/** Analysis-only extensions; executable expressions keep their original lowering. */
export type Result = ValueIR<
  | { kind: 'unknown-result' }
  | { kind: 'spread-argument-result' }
  | { kind: 'render-result' }
  | { kind: 'scalar-result' }
  | { kind: 'number-result' }
  | { kind: 'string-result' }
  | { kind: 'initializer-result'; value: Result }
  | { kind: 'element-result'; source: Result }
  | { kind: 'array-rest-result'; source: Result; start: number }
  | { kind: 'default-result'; value: Result; fallback: Result }
  | { kind: 'union-result'; values: Result[] }
  | { kind: 'function-result'; params: (LocalId | null)[]; result: Result }
  | { kind: 'invoke-result'; callee: Result; args: Result[] }
  | {
      kind: 'spread-result';
      parts: ({ name: string; value: Result } | { name: null; value: Result })[];
    }
  | { kind: 'rest-result'; source: Result; excluded: string[]; hasComputedExclusions?: true }
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
