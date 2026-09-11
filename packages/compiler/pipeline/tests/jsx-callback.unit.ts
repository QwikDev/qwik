import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction, readRenderedText } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

test.each([
  ['inline', 'consume((value) => <b>{value}</b>);'],
  ['stored', 'const callback = (value) => <b>{value}</b>; consume(callback);'],
  ['assigned', 'let callback; callback = (value) => <b>{value}</b>; consume(callback);'],
  ['block', 'consume((value) => { const label = value; return <b>{label}</b>; });'],
  ['nested', 'consume((value) => ((label) => <b>{label}</b>)(value));'],
  [
    'receiver',
    'consume(function (value) { const label = this.prefix + arguments[0]; return <b>{label}</b>; });',
  ],
  ['JSX receiver', 'consume(function (value) { return <b>{this.prefix + arguments[0]}</b>; });'],
  ['destructured', 'consume(([value]) => <b>{value}</b>);'],
  [
    'outer mutation',
    'let count = 0; consume((value) => { count++; return <b>{value}</b>; }); record(count);',
  ],
])('keeps ordinary JSX callbacks synchronous: %s', async (name, body) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/callback.tsx',
        code: `import { Display } from './display';
export default function App() { ${body} return <Display />; }`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const values: unknown[] = [];
  const counts: number[] = [];
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
      record: (count: number) => counts.push(count),
      consume: (callback: (...args: unknown[]) => unknown) => {
        for (const value of ['one', '<unsafe>']) {
          const result = callback.call({ prefix: '' }, name === 'destructured' ? [value] : value);
          expect(typeof result).toBe('function');
          values.push(result);
        }
        expect(values[0]).not.toBe(values[1]);
      },
      Display: (_props: unknown, ctx: Parameters<typeof core.renderSsrDynamicContent>[1]) =>
        core.renderSsrDynamicContent(values, ctx),
    },
    true
  );
  const { html } = await renderToStringCompiled(render);
  expect(readRenderedText(html, 'b')).toEqual(['one', '<unsafe>']);
  expect(html).toContain('&lt;unsafe&gt;');
  expect(counts).toEqual(name === 'outer mutation' ? [2] : []);
});

test.each([
  'const callback = $((value) => <b>{value}</b>); return <Display callback={callback} />;',
  'useTask$(() => consume(<b>task</b>)); return <Display />;',
  'const content = useComputed$(() => <b>computed</b>); return <Display value={content.value} />;',
  'return <button onClick$={() => consume(<b>event</b>)}>run</button>;',
])('compiles JSX inside QRL boundaries: %s', async (body) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    input: [
      {
        path: 'src/callback.tsx',
        code: `import { $, useTask$, useComputed$ } from '@qwik.dev/core';
import { Display } from './display';
export default function App() { ${body} }`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules.some((module) => module.segment?.name.includes('_jsx_'))).toBe(true);
});
