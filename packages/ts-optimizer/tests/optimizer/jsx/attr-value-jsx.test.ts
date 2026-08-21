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

it('JSX in an attr value takes no counter key and static values go const', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
export const Cmp = component$(() => {
  return <Foo fallback={<span>Loading...</span>} />;
});
`;
  const out = transform(code);
  // Static attr JSX: const bag (varProps null), key null, counter not consumed.
  expect(out).toMatch(/_jsxSorted\(Foo, null, \{ fallback: /);
  expect(out).toMatch(/_jsxSorted\("span", null, null, "Loading\.\.\.", 3, null/);
  // The outer Foo takes the first counter key.
  expect(out).toMatch(/_0"/);
  expect(out).not.toMatch(/_1"/);
});

it('reactive attr JSX stays in the var bag with a null key', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const sig = useSignal(0);
  return <Foo a={<span>{sig.value}</span>} />;
});
`;
  const out = transform(code);
  expect(out).toMatch(/_jsxSorted\(Foo, \{ a: /);
  expect(out).toMatch(/_jsxSorted\("span", null, null, _wrapProp\(sig\), 3, null/);
});

it('JSX inside a function inside an attr value keeps counter keys', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
export const Cmp = component$(() => {
  return <Foo onResolved={() => <p>done</p>} />;
});
`;
  const out = transform(code);
  expect(out).toMatch(/_jsxSorted\("p", null, null, "done", 3, "[A-Za-z0-9_]+_0"/);
});
