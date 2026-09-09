import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

async function renderBody(body: string, globals: Record<string, unknown> = {}) {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [{ path: 'src/call.tsx', code: `export default function App() { ${body} }` }],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    {
      ...core,
      get _captures() {
        return core._captures;
      },
      wrap: (value: unknown) => value,
      Box: class {
        constructor(public value: unknown) {}
      },
      ...globals,
    },
    true
  );
  return (await renderToStringCompiled(render)).html;
}

test.each([
  ['initializer', 'const content = wrap(<b>one</b>); return content;'],
  ['root', 'return wrap(<b>one</b>);'],
  ['child', 'return <main>{wrap(<b>one</b>)}</main>;'],
  ['nested call', 'return wrap(wrap(<b>one</b>));'],
  ['constructor', 'const content = new Box(<b>one</b>).value; return content;'],
  [
    'callback constructor',
    'const content = [<i />, (() => new Box(<b>one</b>).value)()]; return content;',
  ],
  ['spread arguments', 'return wrap(...[<b>one</b>]);'],
  ['stored argument', 'const content = <b>one</b>; return wrap(content);'],
  ['nested structure', 'return wrap({ body: [<b>one</b>] }).body;'],
  ['early return', 'if (true) { return wrap(<b>one</b>); } return null;'],
  [
    'local helper',
    'function identity(value) { return value; } const content = identity(<b>one</b>); return content;',
  ],
])('renders JSX passed as a call argument: %s', async (_name, body) => {
  expect(await renderBody(body)).toContain('<b>one</b>');
});

test('preserves constructor lookup, argument order and single evaluation', async () => {
  const calls: string[] = [];
  const html = await renderBody(
    `const content = new constructors.Box(record('before'), <b>one</b>, record('after')).value; return content;`,
    {
      constructors: {
        get Box() {
          calls.push('constructor');
          return class {
            value: unknown;
            constructor(before: string, value: unknown, after: string) {
              calls.push(before, typeof value, after);
              this.value = value;
            }
          };
        },
      },
      record: (value: string) => {
        calls.push(value);
        return value;
      },
    }
  );
  expect(html).toContain('<b>one</b>');
  expect(calls).toEqual(['constructor', 'before', 'after', 'before', 'function', 'after']);
});

test('preserves the receiver and evaluates callee and arguments once in order', async () => {
  const calls: string[] = [];
  const receiver = {
    get wrap() {
      calls.push('callee');
      return function (this: unknown, before: string, content: unknown, after: string) {
        expect(this).toBe(receiver);
        calls.push(before, typeof content, after);
        return content;
      };
    },
  };
  const html = await renderBody(
    `return receiver.wrap(record('before'), <b>one</b>, record('after'));`,
    {
      receiver,
      record: (value: string) => {
        calls.push(value);
        return value;
      },
    }
  );
  expect(html).toContain('<b>one</b>');
  expect(calls).toEqual(['callee', 'before', 'after', 'before', 'function', 'after']);
});

test('passes compiled JSX to calls in setup statements', async () => {
  const calls: unknown[] = [];
  const html = await renderBody(
    `consume(<b>one</b>); if (true) { consume(wrap(<i>two</i>)); } return <p>done</p>;`,
    { consume: (value: unknown) => calls.push(value) }
  );
  expect(html).toContain('<p>done</p>');
  expect(calls.map((value) => typeof value)).toEqual(['function', 'function']);
});

test('optional calls skip argument evaluation', async () => {
  const calls: string[] = [];
  const html = await renderBody(
    `const content = missing?.(record('argument'), <b>hidden</b>); return <main>{content}</main>;`,
    { missing: undefined, record: (value: string) => calls.push(value) }
  );
  expect(calls).toEqual([]);
  expect(html).not.toContain('<b>hidden</b>');
  expect(html).not.toContain('undefined');
});

test('escapes primitive results returned by a JSX wrapper', async () => {
  const html = await renderBody('return wrap(<b>unused</b>);', { wrap: () => '<script>&' });
  expect(html).toContain('&lt;script&gt;&amp;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>unused</b>');
});

test.each(["'on'", '<i>on</i>'])(
  'supports JSX arguments in a branch condition: %s',
  async (arm) => {
    const html = await renderBody(`return <main>{wrap(<b>unused</b>) ? ${arm} : null}</main>;`);
    expect(html).toContain('on');
    expect(html).not.toContain('<b>unused</b>');
  }
);

test.each([
  ['[1, 2]', 'wrap(<li>{row}</li>)', 'li'],
  ['rows', '<li key={row}>{wrap(<b>{row}</b>)}</li>', 'b'],
])('renders JSX arguments inside collection rows: %s', async (source, body, tag) => {
  const html = await renderBody(
    `const rows = [1, 2]; return <ul>{${source}.map((row) => ${body})}</ul>;`
  );
  expect(html).toContain(`>1</${tag}>`);
  expect(html).toContain(`>2</${tag}>`);
});
