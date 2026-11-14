import { describe, expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const transform = (code: string) => {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'prod',
    entryStrategy: { type: 'segment' },
    minify: 'none',
    explicitExtensions: false,
    sourceMaps: false,
    preserveFilenames: false,
  });
  const parent = result.modules[0].code;
  const segment = result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$'
  )!.code;
  return { parent, segment };
};

// Minifiers join consecutive declarations, so library code is full of these statements.
describe('a const statement with several declarators', () => {
  it('stays in the parent when only some declarators are used by one segment', () => {
    const { parent, segment } = transform(`
import { component$ } from '@qwik.dev/core';
const add = (t) => t + 1, double = (t) => add(t) * 2, same = (t) => add(t);
export const usesSame = (t) => same(t);
export const Cmp = component$(() => <div>{double(1)}</div>);
`);
    expect(parent).toMatch(/const add = .*, double = .*, same = /);
    expect(parent).toContain('export { double as _auto_double }');
    expect(segment).toContain('_auto_double as double');
    expect(segment).not.toMatch(/const add\b/);
  });

  it('moves into the segment when all its declarators are used only there', () => {
    const { parent, segment } = transform(`
import { component$ } from '@qwik.dev/core';
const add = (t) => t + 1, double = (t) => add(t) * 2;
export const Cmp = component$(() => <div>{double(1)}</div>);
`);
    expect(segment).toMatch(/const add = .*, double = /);
    expect(parent).not.toMatch(/\badd\b|\bdouble\b/);
  });

  it('stays in the parent when one declarator is a route loader', () => {
    const { parent, segment } = transform(`
import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
const loader = routeLoader$(() => 1), helper = () => loader;
export const Cmp = component$(() => <div>{helper()}</div>);
`);
    expect(parent).toMatch(/const loader = .*, helper = /);
    expect(segment).not.toMatch(/const loader\b/);
  });

  it('stays in the parent when a destructuring default has side effects', () => {
    const { parent, segment } = transform(`
import { component$ } from '@qwik.dev/core';
import { register } from './register';
const { a = 1, b = register() } = {};
export const Cmp = component$(() => <div>{a}</div>);
`);
    expect(parent).toContain('register()');
    expect(segment).not.toContain('register()');
  });
});
