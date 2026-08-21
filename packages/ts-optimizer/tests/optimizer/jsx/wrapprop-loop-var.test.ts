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

it('a loop-var-rooted wrapProp goes in the var bag', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Parent = component$(() => {
  const count = useSignal([{ value: 1 }]);
  return <div>{count.value.map((c, i) => <Counter key={i} count={c.value} />)}</div>;
});
`;
  const out = transform(code);
  expect(out).toContain('_jsxSorted(Counter, { count: _wrapProp(c) }, null');
});

it('an inline-component param root counts as const-stable', () => {
  const code = `
export const t = it('x', async () => {
  const Child = (props: { name: string }) => <>{props.name}</>;
  const Parent = (props: { name: string }) => <Child name={props.name} />;
  await render(<Parent name="World" />, {});
});
`;
  const out = transform(code);
  expect(out).toContain('_jsxSorted(Child, null, { name: _wrapProp(props, "name") }');
});

it('a component-param-rooted wrapProp stays in the const bag', () => {
  const code = `
import { component$, Slot } from '@qwik.dev/core';
export const Switch = component$((props: { name: string }) => {
  return <Slot name={props.name} />;
});
`;
  const out = transform(code);
  expect(out).toContain('_jsxSorted(Slot, null, { name: _wrapProp(props, "name") }');
});
