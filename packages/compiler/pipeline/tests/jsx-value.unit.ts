import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

test.each([
  ['root', 'const content = <p>stored</p>; return content;', '<p>stored</p>'],
  ['child', 'const content = <p>stored</p>; return <main>{content}</main>;', '<p>stored</p>'],
  ['alias', 'const content = <p>stored</p>; const alias = content; return alias;', '<p>stored</p>'],
  [
    'array',
    'const content = [<b>one</b>, [null, false, "<unsafe>", <i>two</i>]]; return content;',
    '<b>one</b>&lt;unsafe&gt;<i>two</i>',
  ],
  [
    'object',
    'const views = { header: <b>one</b>, nested: { body: <i>two</i> } }; return <main>{views.header}{views.nested.body}</main>;',
    '<b>one</b>',
  ],
  [
    'computed member',
    'const views = { body: [<b>one</b>, <i>two</i>] }; const key = "body"; return views[key];',
    '<b>one</b><i>two</i>',
  ],
  [
    'array spread',
    'const first = [<b>one</b>]; const content = [...first, <i>two</i>]; return content;',
    '<b>one</b><i>two</i>',
  ],
  [
    'object spread',
    'const first = { body: <b>one</b> }; const views = { ...first, footer: <i>two</i> }; return views.body;',
    '<b>one</b>',
  ],
  [
    'destructuring',
    'const { body: [content] } = { body: [<b>one</b>] }; return content;',
    '<b>one</b>',
  ],
  ['direct array', 'return [<b>one</b>, [<i>two</i>]];', '<b>one</b><i>two</i>'],
  ['inline child array', 'return <main>{[<b>one</b>, <i>two</i>]}</main>;', '<b>one</b><i>two</i>'],
  [
    'conditional entry',
    'const content = [false && <b>hidden</b>, true ? <i>two</i> : null]; return content;',
    '<i>two</i>',
  ],
  ['sparse array', 'return [, <b>one</b>,, undefined];', '<b>one</b>'],
  ['literal member', 'return ({ body: [<b>one</b>] }).body;', '<b>one</b>'],
  ['optional member', 'const views = { body: <b>one</b> }; return views?.body;', '<b>one</b>'],
  ['let', 'let content = <p>stored</p>; return content;', '<p>stored</p>'],
  ['var', 'var content = <p>stored</p>; return content;', '<p>stored</p>'],
  [
    'replaced value',
    "let content = <p>unused</p>; content = '<unsafe>'; return content;",
    '&lt;unsafe&gt;',
  ],
  [
    'row initializer',
    'const rows = [1]; return <ul>{rows.map((row) => { const content = <b>{row}</b>; return <li key={row}>{content}</li>; })}</ul>;',
    '>1</b>',
  ],
  [
    'fragment',
    'const content = <><b>one</b><i>two</i></>; return content;',
    '<b>one</b><i>two</i>',
  ],
  ['block', 'if (true) { const content = <p>stored</p>; return content; }', '<p>stored</p>'],
  [
    'captured local',
    'let label = 0; const content = <p>{label}</p>; label = 1; return content;',
    '>0</p>',
  ],
  [
    'context name',
    "const ctx = 'stored'; const content = <p>{ctx}</p>; return content;",
    '>stored</p>',
  ],
  [
    'escaping',
    "const label = '<script>&'; const content = <p>{label}</p>; return content;",
    '&lt;script&gt;&amp;</p>',
  ],
])('renders a stored JSX value in SSR: %s', async (_name, body, expected) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [{ path: 'src/value.tsx', code: `export default function App() { ${body} }` }],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
    },
    true
  );
  const result = await renderToStringCompiled(render);
  expect(result.html).toContain(expected);
  expect(result.html).not.toContain('[object Object]');
});

test('preserves native object evaluation order and evaluates each spread once', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/value.tsx',
        code: `export default function App() {
      const tail = <i>tail</i>;
      const base = { get footer() { record('spread'); return tail; } };
      const views = { [record('header')]: <b>head</b>, ...base, label: record('label') };
      return <main>{views.header}{views.footer}{views.footer}{views.label}</main>;
    }`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const calls: string[] = [];
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
      record(value: string) {
        calls.push(value);
        return value;
      },
    },
    true
  );
  const result = await renderToStringCompiled(render);
  expect(calls).toEqual(['header', 'spread', 'label']);
  expect(result.html.match(/<i>tail<\/i>/g)).toHaveLength(2);
});

test('diagnoses a local component crossing a JSX value boundary', async () => {
  await expect(
    transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/value.tsx',
          code: 'export default function App() { function Child() { return <p>stored</p>; } const content = <Child />; return content; }',
        },
      ],
    })
  ).rejects.toThrow('a const initializer capturing "Child"');
});
