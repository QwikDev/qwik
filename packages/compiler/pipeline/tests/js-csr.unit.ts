import { describe, expect, test } from 'vitest';
import { childPathExpression } from '../generate/js-csr';

describe('childPathExpression', () => {
  function path(index: number, nodeCount: number): { code: string; imports: string[] } {
    const imports = new Set<string>();
    const code = childPathExpression('el0', index, nodeCount, imports);
    return { code, imports: [...imports] };
  }

  test('index 0 is a bare first-child lookup', () => {
    expect(path(0, 1)).toEqual({ code: '_first(el0)', imports: ['_first'] });
  });

  test('a front-walk tie prefers the front (the only shape the oracle emits)', () => {
    expect(path(1, 3).code).toBe('_next(_first(el0))');
  });

  test('a strictly shorter back walk uses last/prev', () => {
    expect(path(3, 4)).toEqual({ code: '_last(el0)', imports: ['_last'] });
    expect(path(2, 4).code).toBe('_prev(_last(el0))');
    expect(path(2, 5).code).toBe('_next(_next(_first(el0)))');
    expect(path(3, 5).code).toBe('_prev(_last(el0))');
    expect(path(4, 6).code).toBe('_prev(_last(el0))');
  });
});
