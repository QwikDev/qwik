import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

test.each([
  ['direct', 'return <Display fallback={<b>ready</b>} />;'],
  ['component', 'return <Display fallback={<Loading />} />;'],
  [
    'alongside a reactive spread',
    'const options = useSignal({ title: "title" }); return <Display {...options.value} fallback={<b>ready</b>} />;',
  ],
  [
    'inside an inline collection',
    'return <ul>{[1, 2].map(row => <li><Display fallback={<b>{row}</b>} /></li>)}</ul>;',
  ],
])('passes compiled JSX as a component prop: %s', async (name, body) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/prop.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
import { Display, Loading } from './display';
export default function App() { ${body} }`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const values: unknown[] = [];
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
      Loading: () => '<b>ready</b>',
      Display: (
        props: { fallback: unknown },
        ctx: Parameters<typeof core.renderSsrDynamicContent>[1]
      ) => {
        const value = props.fallback;
        values.push(value);
        return core.renderSsrDynamicContent(value, ctx);
      },
    },
    true
  );
  const { html } = await renderToStringCompiled(render);
  expect(values.map((value) => typeof value)).toEqual(
    name === 'inside an inline collection' ? ['function', 'function'] : ['function']
  );
  if (name === 'inside an inline collection') {
    expect(html).toContain('<b>1</b>');
    expect(html).toContain('<b>2</b>');
  } else {
    expect(html).toContain('<b>ready</b>');
  }
});
