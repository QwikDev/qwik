import { describe, expect, test } from 'vitest';
import { wrapQwikLazyComponentExports } from './sourceTransforms';

describe('sourceTransforms', () => {
  test('escapes Windows module ids in wrapped lazy component exports', () => {
    const id = 'C:\\Users\\alice\\src\\app\\entry_component_abc123.tsx';
    const source = `
export const Foo_component_abc123 = () => null;
`;

    const result = wrapQwikLazyComponentExports({
      code: source,
      id,
      exports: ['Foo_component_abc123'],
    });

    expect(result.changed).toBe(true);
    expect(result.code).toContain(JSON.stringify(id));
    expect(result.code).toContain(
      '__qwik_wrap__(__original_Foo_component_abc123__, "Foo_component_abc123"'
    );
    expect(result.code).not.toContain(`'${id}'`);
  });
});
