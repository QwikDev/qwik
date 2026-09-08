import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

const helpers = [
  'function makeNode(value) { return <b>{value}</b>; }',
  'const makeNode = (value) => <b>{value}</b>;',
  'const makeNode = function (value) { return <b>{value}</b>; };',
  'function makeNode(value) { return nested(); function nested() { return <b>{value}</b>; } }',
  'function makeNode(value) { const label = value; return (() => <b>{label}</b>)(); }',
  'function makeNode(value, content = <b>{value}</b>) { return content; }',
];

test.each(helpers)('renders independent module helper results: %s', async (helper) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [{ path: 'src/helper.tsx', code: `${helper}\nexport default makeNode;` }],
  });
  expect(output.diagnostics).toEqual([]);
  const factory = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
    },
    true
  );
  const first = factory('one');
  const second = factory('<unsafe>');
  expect(typeof first).toBe('function');
  expect(typeof second).toBe('function');
  expect(first).not.toBe(second);
  const { html } = await renderToStringCompiled((_props, ctx) =>
    core.renderSsrDynamicContent([first, second], ctx)
  );
  expect(html).toContain('>one</b>');
  expect(html).toContain('>&lt;unsafe&gt;</b>');
});

test.each(['module', 'local'])(
  'preserves %s function hoisting alongside a component',
  async (scope) => {
    const helper = 'function makeNode(value) { return <b>{value}</b>; }';
    const body = `consume(makeNode('one')); ${scope === 'local' ? helper : ''} return <Display />;`;
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/helper.tsx',
          code: `import { Display } from './display';
export default function App() { ${body} }
${scope === 'module' ? helper : ''}`,
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
        consume: (value: unknown) => values.push(value),
        Display: (_props: unknown, ctx: Parameters<typeof core.renderSsrDynamicContent>[1]) =>
          core.renderSsrDynamicContent(values, ctx),
      },
      true
    );
    const { html } = await renderToStringCompiled(render);
    expect(html).toContain('>one</b>');
  }
);

test('initializes JSX references before a top-level helper call', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/helper.tsx',
        code: `const value = makeNode('early');
function makeNode(label) { return <b>{label}</b>; }
export default () => value;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const read = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
    },
    true
  );
  const { html } = await renderToStringCompiled((_props, ctx) =>
    core.renderSsrDynamicContent(read(), ctx)
  );
  expect(html).toContain('>early</b>');
});

test('reports invalid lexical writes in a helper event', async () => {
  const output = await transformModules({
    srcDir: 'src',
    input: [
      {
        path: 'src/helper.tsx',
        code: `export function makeNode() {
      let count = 0;
      return <button onClick$={() => count++}>run</button>;
    }`,
      },
    ],
  });
  expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['mutable-capture']);
});
