import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const OPTS = {
  srcDir: mkFilePath('.'),
  entryStrategy: { type: 'segment' } as const,
  transpileTs: true,
  transpileJsx: true,
  mode: 'dev' as const,
  isServer: false,
};

it('explicit $() handlers inside component$ keep .w() capture delivery', () => {
  const code = `
import { $, component$, useStore } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const store = useStore({ log: '' });
  return <div onMouseLeave$={$(() => { store.log += 'x'; })} />;
});
`;
  const result = transformModule({
    ...OPTS,
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
  });
  const all = result.modules.map((m) => m.code).join('\n');
  expect(all).toMatch(/q-e:mouseleave": q_\w+\.w\(\[store\]\)/);
});

it('promoted handlers keep author-written event params', () => {
  const code = `
import { component$, useStore } from '@qwik.dev/core';
export const Cmp = (props: { x: number }) => {
  const store = useStore({ n: 0 });
  return <a href="#" onClick$={(ev) => { ev.stopPropagation(); store.n++; }}>go</a>;
};
export default component$(() => <Cmp x={1} />);
`;
  const result = transformModule({
    ...OPTS,
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
  });
  const handler = result.modules.find((m) => m.path.includes('q_e_click'))!;
  expect(handler.code).toMatch(/\(ev, _1, store\)/);
});

it('loop handlers without captures keep author-written event params', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
export default component$((props) => (
  <ul>
    {props.items.map(() => (
      <li onMouseDown$={(event) => { event.preventDefault(); event.stopPropagation(); }} />
    ))}
  </ul>
));
`;
  const result = transformModule({
    ...OPTS,
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
  });
  const handler = result.modules.find((m) => m.path.includes('q_e_mousedown'))!;
  expect(handler.code).toMatch(/\(event, _1\).*event\.preventDefault\(\)/s);
});

it('optional-chain map handlers deliver values through q:ps', () => {
  const code = `
import { component$, $ } from '@qwik.dev/core';
export default component$(() => {
  const select = $((index: number) => index);
  const source = { items: ['a'] };
  return <ul>{source?.items.map((label, index) => (
    <li onClick$={() => select(index)}>{label}</li>
  ))}</ul>;
});
`;
  const result = transformModule({
    ...OPTS,
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
  });
  const all = result.modules.map((m) => m.code).join('\n');
  const handler = result.modules.find((m) => m.path.includes('q_e_click'))!;
  expect(handler.code).toMatch(/\(_, _1, select, index\)|\(_, _1, index, select\)/);
  expect(all).toMatch(/"q:ps": \[(?:select, index|index, select)\]/);
  expect(all).not.toMatch(/q_\w+\.w\(\[select\]\)/);
});

it('inline document handlers deliver captures through q:p', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  return <script document:onCount$={() => count.value++} />;
});
`;
  const result = transformModule({
    ...OPTS,
    entryStrategy: { type: 'inline' },
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
  });
  const all = result.modules.map((m) => m.code).join('\n');
  expect(all).toMatch(/\(_, _1, count\)/);
  expect(all).toContain('"q:p": count');
  expect(all).not.toMatch(/q_\w+\.w\(\[count\]\)/);
});

it('handlers sharing an element align to one positional q:ps array', () => {
  const code = `
import { component$, useStore } from '@qwik.dev/core';
export default component$(() => {
  const a = useStore({ v: 0 });
  const b = useStore({ v: 0 });
  return (
    <div
      onMouseMove$={(event) => { a.v = event.clientX; }}
      window:onMouseMove$={(event) => { b.v = event.clientX; }}
    />
  );
});
`;
  const result = transformModule({
    ...OPTS,
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
  });
  const all = result.modules.map((m) => m.code).join('\n');
  expect(all).toContain('"q:ps": [a, b]');
  const selfHandler = result.modules.find((m) => /q_e_mousemove/.test(m.path))!;
  const winHandler = result.modules.find((m) => /q_w_mousemove/.test(m.path))!;
  expect(selfHandler.code).toMatch(/\(event, _1, a\)/);
  expect(winHandler.code).toMatch(/\(event, _1, _2, b\)/);
});
