import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const transform = (code: string) =>
  transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
  })
    .modules.map((m) => m.code)
    .join('\n');

it('a props-derived object class hoists to _fnSignal', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
export const Child = component$<{ count: number }>(({ count }) => {
  return <span class={{ even: count % 2 === 0, stable: true }}>{count}</span>;
});
`;
  const out = transform(code);
  expect(out).toContain('class: _fnSignal(_hf0, [_rawProps], _hf0_str)');
});

it('a store-derived object class hoists to _fnSignal (rust parity)', () => {
  const code = `
import { component$, useStore } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const store = useStore({ active: 'a' });
  return <div class={{ on: store.active === 'a' }} />;
});
`;
  const out = transform(code);
  expect(out).toContain('class: _fnSignal(_hf0, [store], _hf0_str)');
});

it('a .w() with a param capture classifies var on component props', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
export const Wrapper = component$((props: { data: any }) => {
  return <Inner onClick$={() => { props.data.x = 1; }} text="a" />;
});
`;
  const out = transform(code);
  // onClick$ (w-call capturing props) in the var bag; text stays const.
  expect(out).toMatch(
    /_jsxSorted\(Inner, \{ onClick\$: q_[\w$]+\.w\(\[props\]\) \}, \{ text: "a" \}/
  );
});
