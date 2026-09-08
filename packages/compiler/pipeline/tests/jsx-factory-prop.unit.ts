import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';
import {
  getActiveInvokeContextOrNull,
  invoke,
} from '../../../qwik/src/core/runtime/invoke-context';

test.each([
  ['render prop', '<Display render={(value) => <b>{value}</b>} />'],
  ['resolved callback', '<Display onResolved={(value) => <b>{value}</b>} />'],
  ['function children', '<Display>{(value) => <b>{value}</b>}</Display>'],
  ['children prop', '<Display children={(value) => <b>{value}</b>} />'],
  ['block body', '<Display render={(value) => { const label = value; return <b>{label}</b>; }} />'],
  [
    'destructured default',
    '<Display render={({ label } = { label: "default" }) => <b>{label}</b>} />',
  ],
  ['captured local', '<Display render={(value) => <b>{prefix + value}</b>} />'],
  ['reactive spread', '<Display {...options.value} render={(value) => <b>{value}</b>} />'],
  ['children with spread', '<Display {...options.value}>{(value) => <b>{value}</b>}</Display>'],
  ['function expression', '<Display render={function (value) { return <b>{value}</b>; }} />'],
  [
    'early return',
    '<Display render={(value) => { if (value === "one") { const label = value; return <b>{label}</b>; } return <b>{value}</b>; }} />',
  ],
  [
    'native receiver',
    '<Display render={function (value) { const label = this.prefix + arguments[0]; return <b>{label}</b>; }} />',
  ],
])('passes a JSX factory without executing it: %s', async (name, jsx) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/factory.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
import { Display } from './display';
export default function App() {
  const prefix = 'prefix:';
  const options = useSignal({ title: 'title' });
  return ${jsx};
}`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
      Display: async (
        props: Record<string, (...args: unknown[]) => unknown>,
        ctx: Parameters<typeof core.renderSsrDynamicContent>[1]
      ) => {
        const invokeContext = getActiveInvokeContextOrNull();
        const factory = props.render ?? props.onResolved ?? props.children;
        expect(typeof factory).toBe('function');
        const callFactory = (value: unknown) => factory.call({ prefix: '' }, value);
        const first = await callFactory(name === 'destructured default' ? { label: 'one' } : 'one');
        const second = await invoke(
          invokeContext,
          callFactory,
          name === 'destructured default' ? undefined : '<unsafe>'
        );
        expect(typeof first).toBe('function');
        expect(typeof second).toBe('function');
        expect(first).not.toBe(second);
        return invoke(invokeContext, core.renderSsrDynamicContent, [first, second], ctx);
      },
    },
    true
  );
  const { html } = await renderToStringCompiled(render);
  const prefix = name === 'captured local' ? 'prefix:' : '';
  expect(html).toContain(`>${prefix}one</b>`);
  expect(html).toContain(
    `>${prefix}${name === 'destructured default' ? 'default' : '&lt;unsafe&gt;'}</b>`
  );
});
