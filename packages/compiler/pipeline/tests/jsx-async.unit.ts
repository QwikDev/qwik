import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction, readRenderedText } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';
import {
  getActiveInvokeContextOrNull,
  invoke,
} from '../../../qwik/src/core/runtime/invoke-context';

test.each([
  ['resolve', '(value) => Promise.resolve(<b>{value}</b>)'],
  ['then', '(value) => waitForValue(value).then(label => <b>{label}</b>)'],
  [
    'async arrow',
    'async (value) => { const label = await waitForValue(value); return <b>{label}</b>; }',
  ],
  [
    'async function',
    'async function (value) { const label = await waitForValue(value); return <b>{label}</b>; }',
  ],
  ['awaited JSX', 'async (value) => await Promise.resolve(<b>{value}</b>)'],
  [
    'nested async',
    '(value) => (async (label) => { await waitForValue(label); return <b>{label}</b>; })(value)',
  ],
  [
    'async QRL',
    '$(async (value) => { const label = await waitForValue(value); return <b>{label}</b>; })',
  ],
  ['QRL awaited JSX', '$(async (value) => await Promise.resolve(<b>{value}</b>))'],
])('preserves Promise results and captures: %s', async (_name, callback) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/async.tsx',
        code: `import { $ } from '@qwik.dev/core';
import { Display } from './display';
export default function App() { const factory = ${callback}; register(factory); return <Display />; }`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const pending: (() => void)[] = [];
  let results: Promise<unknown>[] = [];
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
      waitForValue: (value: string) => new Promise((resolve) => pending.push(() => resolve(value))),
      register: (factory: (value: string) => Promise<unknown>) => {
        results = ['one', '<unsafe>'].map((value) => factory(value));
        expect(results.every((result) => result instanceof Promise)).toBe(true);
      },
      Display: async (_props: unknown, ctx: Parameters<typeof core.renderSsrDynamicContent>[1]) => {
        const invokeContext = getActiveInvokeContextOrNull();
        pending.reverse().forEach((resolve) => resolve());
        const values = await Promise.all(results);
        expect(values.map((value) => typeof value)).toEqual(['function', 'function']);
        expect(values[0]).not.toBe(values[1]);
        return invoke(invokeContext, core.renderSsrDynamicContent, values, ctx);
      },
    },
    true
  );
  const { html } = await renderToStringCompiled(render);
  expect(readRenderedText(html, 'b')).toEqual(['one', '<unsafe>']);
  expect(html).toContain('&lt;unsafe&gt;');
});

test('keeps rejection identity and catch/finally order in async JSX callbacks', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/async.tsx',
        code: `export default function App() {
      register(async () => { try { await fail(); return <b>unused</b>; } catch (error) { record(error); throw error; } finally { record('finally'); } });
      return <p>done</p>;
    }`,
      },
    ],
  });
  const failure = new Error('expected');
  expect(output.diagnostics).toEqual([]);
  const calls: unknown[] = [];
  let result: Promise<unknown> | undefined;
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      register: (factory: () => Promise<unknown>) => {
        result = factory();
        result.catch(() => {});
      },
      fail: () => Promise.reject(failure),
      record: (value: unknown) => calls.push(value),
    },
    true
  );
  await renderToStringCompiled(render);
  await expect(result).rejects.toBe(failure);
  expect(calls).toEqual([failure, 'finally']);
});
