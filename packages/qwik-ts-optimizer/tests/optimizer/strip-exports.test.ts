/**
 * Tests for strip-exports module.
 *
 * Verifies that stripExportDeclarations() replaces specified export bodies
 * with throw statements and removes unused imports.
 */

import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { stripExportDeclarations } from '../../src/optimizer/strip-exports.js';
import { collectImports } from '../../src/optimizer/marker-detection.js';

function runStrip(source: string, stripExports: string[]) {
  const { program } = parseSync('test.tsx', source);
  const s = new MagicString(source);
  const importMap = collectImports(program);
  const result = stripExportDeclarations(source, s, program, stripExports, importMap);
  return { code: s.toString(), ...result };
}

describe('stripExportDeclarations', () => {
  it('replaces a stripped export body with throw statement', () => {
    const source = `import mongodb from 'mongodb';

export const onGet = () => {
  const data = mongodb.collection.whatever;
  return { body: { data } };
};
`;
    const result = runStrip(source, ['onGet']);
    expect(result.code).toContain(
      `export const onGet = ()=>{
    throw "Symbol removed by Qwik Optimizer, it can not be called from current platform";
};`
    );
    expect(result.strippedNames).toEqual(['onGet']);
  });

  it('removes imports used only by the stripped export', () => {
    const source = `import mongodb from 'mongodb';

export const onGet = () => {
  const data = mongodb.collection.whatever;
  return { body: { data } };
};
`;
    const result = runStrip(source, ['onGet']);
    expect(result.code).not.toContain('mongodb');
  });

  it('preserves exports NOT in the strip list', () => {
    const source = `import mongodb from 'mongodb';

export const onGet = () => {
  return mongodb.find();
};

export const otherFn = () => {
  return 42;
};
`;
    const result = runStrip(source, ['onGet']);
    expect(result.code).toContain('export const otherFn');
    expect(result.code).toContain('return 42');
  });

  it('keeps imports used by both stripped and non-stripped code', () => {
    const source = `import mongodb from 'mongodb';

export const onGet = () => {
  return mongodb.find();
};

export const otherFn = () => {
  return mongodb.count();
};
`;
    const result = runStrip(source, ['onGet']);
    // mongodb is still used by otherFn, so the import must stay
    expect(result.code).toContain(`import mongodb from 'mongodb'`);
  });

  it('handles multiple exports to strip', () => {
    const source = `export const foo = () => { return 1; };
export const bar = () => { return 2; };
export const baz = () => { return 3; };
`;
    const result = runStrip(source, ['foo', 'bar']);
    expect(result.strippedNames).toEqual(['foo', 'bar']);
    expect(result.code).toContain('export const baz');
    expect(result.code).toContain('return 3');
  });

  it('does nothing when strip list is empty', () => {
    const source = `export const onGet = () => { return 1; };`;
    const result = runStrip(source, []);
    expect(result.code).toBe(source);
    expect(result.strippedNames).toEqual([]);
  });

  it('does nothing when strip list has no matching exports', () => {
    const source = `export const onGet = () => { return 1; };`;
    const result = runStrip(source, ['notExported']);
    expect(result.code).toBe(source);
    expect(result.strippedNames).toEqual([]);
  });

  it('handles export function declarations', () => {
    const source = `export function onGet() {
  return 1;
}
`;
    const result = runStrip(source, ['onGet']);
    expect(result.code).toContain('throw "Symbol removed by Qwik Optimizer, it can not be called from current platform"');
    expect(result.strippedNames).toEqual(['onGet']);
  });
});
