import { expect, it } from 'vitest';
import { stripTypeScript } from '../../../src/optimizer/edit/strip-types.js';

it('emits exported TypeScript enums with Rust-compatible var bindings', () => {
  const output = stripTypeScript(
    'test.ts',
    'export enum Thing { A, B }',
    { typescript: { onlyRemoveTypeImports: true } },
    'test'
  );

  expect(output).toContain('export var Thing =');
});
