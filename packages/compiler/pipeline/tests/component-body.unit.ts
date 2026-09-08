import { describe, expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

const bodies = [
  [
    'escaping in an early return',
    `if (true) { const label = '<script>&'; return <p>{label}</p>; }`,
    '&lt;script&gt;&amp;',
  ],
  [
    'statements',
    `let label; var suffix = '!'; label = 'ok'; { label += suffix; } record(label); return <p>{label}</p>;`,
    'ok!',
  ],
  [
    'conditional returns',
    `if (props.empty) return null; if (props.other) { return <b>other</b>; } return <p>ok</p>;`,
    'ok',
  ],
  ['conditional ending', `if (props.other) return <b>other</b>; else return <p>ok</p>;`, 'ok'],
  [
    'try and finally',
    `try { if (!props.other) throw new Error('ok'); return <b>other</b>; } catch (error) { return <p>{error.message}</p>; } finally { record('finally'); }`,
    'ok',
  ],
  [
    'local function',
    `const label = format('ok'); function format(value) { return value.toUpperCase(); } return <p>{label}</p>;`,
    'OK',
  ],
  ['local component', `function Child() { return <p>ok</p>; } return <Child />;`, 'ok'],
  ['local arrow component', `const Child = component$(() => <p>ok</p>); return <Child />;`, 'ok'],
  [
    'ordinary core calls',
    `const context = createContextId('body'); const locale = getLocale(); record(context, locale); return <p>ok</p>;`,
    'ok',
  ],
  [
    'var hoisting',
    `record(read()); var count = 1; var count; var count = count + 1; function read() { return count; } const label = read(); return <p>{label}</p>;`,
    '2',
  ],
  [
    'mutable patterns',
    `let { a, b = a } = { a: 1 }; let [c = b] = []; a++; b += c; return <p>{a + b + c}</p>;`,
    '5',
  ],
  [
    'block scopes',
    `let label = 'ok'; if (true) { let label = 'inner'; label += '!'; record(label); } return <p>{label}</p>;`,
    'ok',
  ],
  [
    'mutated block condition',
    `{ let count = 0; count++; if (count === 1) return <p>ok</p>; } return <p>bad</p>;`,
    'ok',
  ],
  [
    'uninitialized block condition',
    `{ let count; count = 1; if (count === 1) return <p>ok</p>; } return <p>bad</p>;`,
    'ok',
  ],
  [
    'mutated thrown value',
    `try { let message = 'bad'; message = 'ok'; throw new Error(message); } catch (error) { return <p>{error.message}</p>; }`,
    'ok',
  ],
  [
    'let temporal dead zone',
    `try { record(count); let count = 0; } catch (error) { return <p>{error instanceof ReferenceError ? 'ok' : 'bad'}</p>; } return <p>bad</p>;`,
    'ok',
  ],
  [
    'multiple local declarators',
    `const first = record('first'), Child = () => <p>ok</p>, last = record('last'); return <Child />;`,
    'ok',
  ],
  [
    'outer props in a local component',
    `function Child() { return <p>{props.label ?? 'ok'}</p>; } return <Child />;`,
    'ok',
  ],
  [
    'conditional var initialization',
    `var label = 'ok'; if (props.other) var label = 'other'; return <p>{label}</p>;`,
    'ok',
  ],
] as const;

describe('ordinary component bodies', () => {
  test.each([
    'count = 1',
    'count += 1',
    'count++',
    '--count',
    '({ count } = { count: 1 })',
    '[count] = [1]',
    'for (count of [1]) {}',
    'for (count in {}) {}',
    '(() => { count++; })()',
  ])('rejects captured binding writes: %s', async (mutation) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/body.tsx',
          code: `import { component$, $ } from '@qwik.dev/core';
export default component$(() => { let count = 0; const action = $(() => { ${mutation}; }); return <button onClick$={action}>run</button>; });`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([
      expect.objectContaining({ category: 'error', code: 'mutable-capture' }),
    ]);
    expect(output.diagnostics[0].message).toContain('count');
  });

  test('preserves native declarations without capture cells', async () => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/body.tsx',
          code: `export default () => { let count; var suffix = '!', other; count = 0; count++; suffix += '!'; return <p>{count + suffix}</p>; };`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const source = output.modules.find((module) => !module.segment)!.code;
    expect(source).toContain('let count;');
    expect(source).toContain('var other;');
    expect(source).not.toContain('_cell');
    expect(source).not.toContain('defineProperty');
  });

  test('allows local callback mutations and explicit object state', async () => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/body.tsx',
          code: `import { component$, $ } from '@qwik.dev/core';
export default component$(() => { let count = 0; const state = { count }; const action = $(() => { let count = 1; count++; state.count = count; state.count++; }); return <button onClick$={action}>run</button>; });`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each(bodies)('%s executes in SSR', async (_name, body, expected) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/body.tsx',
          code: `import { component$, createContextId, getLocale } from '@qwik.dev/core';
export default component$((props) => { ${body} });`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const calls: unknown[][] = [];
    const render = loadDefaultFunction(
      output.modules.find((module) => !module.segment)!,
      {
        ...core,
        Error,
        get _captures() {
          return core._captures;
        },
        record: (...args: unknown[]) => calls.push(args),
        getLocale: () => 'en',
      },
      true
    );
    const result = await renderToStringCompiled((_, ctx) => render({}, ctx));
    expect(result.html).toContain(`${expected}</p>`);
    if (_name === 'try and finally') {
      expect(calls).toEqual([['finally']]);
    }
  });

  test.each([
    'return null;',
    'return undefined;',
    'return;',
    'if (props.empty) return;',
    'throw new Error("stop");',
  ])('supports empty or throwing bodies: %s', async (body) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/body.tsx',
          code: `import { component$ } from '@qwik.dev/core'; export default component$((props) => { ${body} });`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, core);
    if (body.startsWith('throw')) {
      expect(() => render({}, {})).toThrow('stop');
    } else {
      expect(render({}, {})).toBeFalsy();
    }
  });

  test('preserves sibling declarators and their evaluation order', async () => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/body.tsx',
          code: `const before = record('before'), Child = () => <p>ok</p>, after = record('after'); export default () => <Child />;`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const calls: string[] = [];
    loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
      ...core,
      record: (value: string) => calls.push(value),
    });
    expect(calls).toEqual(['before', 'after']);
  });
});
