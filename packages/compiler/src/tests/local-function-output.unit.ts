import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import { _capturesObj, withCaptures } from '../../../qwik/src/core/shared/qrl/qrl-captures';
import * as core from '../../../qwik/src/core/index';
import { Scheduler } from '../../../qwik/src/core/runtime/scheduler';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';
import { createDocument } from '../../../qwik/src/testing/document';
import { transformModules } from '../transform-modules';
import {
  emittedCodeErrors,
  loadDefaultFunction,
  readRenderedText,
  unusedDeclarations,
} from './fixtures';

const IMPORTS = `import { component$, $, useSignal, useTask$ } from '@qwik.dev/core';\n`;

/** `body` inside a component that owns the signal `s`, and `show` when the body reads it. */
const inApp = (body: string) =>
  `export const App = component$(() => {\n  const s = useSignal(0);\n  ${/\bshow\b/.test(body) ? 'const show = useSignal(true);\n  ' : ''}${body}\n});`;
const withChild = (code: string) => `import { Child } from './child';\n${code}`;

const mutualPair = `function a(n) { return n ? b(n - 1) : s.value; }
  function b(n) { return n ? a(n - 1) : 1; }`;
const onlyNestedQrlReads = (X: string, isLast: boolean) => {
  const callers = `function isEven(n) { const q = $(() => X()); return n === 0 ? q : isOdd(n - 1); }
  function isOdd(n) { return n === 0 ? false : isEven(n - 1); }`;
  return inApp(`${isLast ? callers : X}
  ${isLast ? X : callers}
  const v = isEven(4);
  return <div>{v ? 'y' : 'n'}</div>;`);
};
const chain = {
  arrows: ['const A = () => B() + 1;', 'const B = () => C() + 1;', 'const C = () => s.value;'],
  declarations: [
    'function A() { return B() + 1; }',
    'function B() { return C() + 1; }',
    'function C() { return s.value; }',
  ],
};
/** The spellings of a component a helper declares. */
const helperComponents = {
  'written with component$': (jsx: string) => `const B = component$(() => ${jsx});`,
  'written as a plain arrow': (jsx: string) => `const B = () => ${jsx};`,
  'written as a function declaration': (jsx: string) => `function B() { return ${jsx}; }`,
};
/** An uppercase function returning JSX that reads the signal `s`. */
const row = 'const Row = (item) => <li>{item}{s.value}</li>;';
/** `name` printed with the component render signature. */
const componentOf = (name: string) =>
  new RegExp(`(const ${name} = |function ${name})\\(props, ctx\\)`);
const chainOrders = ['ABC', 'ACB', 'BAC', 'BCA', 'CAB', 'CBA'];
const inChainOrder = (statements: string[], order: string) =>
  [...order].map((name) => statements['ABC'.indexOf(name)]).join('\n  ');

async function compile(
  code: string,
  isServer: boolean,
  transpileTs = true,
  diagnostics: string[] = [],
  strip: { stripCtxName?: string[]; regCtxName?: string[] } = {}
) {
  const output = await transformModules({
    srcDir: '/',
    rootDir: '/',
    input: [{ path: 'src/app.tsx', code: IMPORTS + code }],
    isServer,
    transpileTs,
    transpileJsx: true,
    mode: 'dev',
    entryStrategy: { type: 'inline' },
    ...strip,
  });
  expect(output.diagnostics.map(({ code }) => code)).toEqual(diagnostics);
  return output.modules;
}

/** Undeclared names and dead code, besides the `authored` names the input leaves unused. */
function brokenOrDeadCode(
  modules: Awaited<ReturnType<typeof compile>>,
  authored: string[] = []
): string[] {
  // The main module keeps the template's `Child` import.
  return [...emittedCodeErrors(modules), ...unusedDeclarations(modules, ['Child', ...authored])];
}

describe.each([false, true])('emitted local functions (SSR: %s)', (isServer) => {
  describe('core imports', () => {
    test.each([
      [
        'a plain function returning a $() qrl',
        inApp(`function f() { return $(() => s.value); }
  const q = f();
  return <div>{q ? 'a' : 'b'}</div>;`),
      ],
      [
        'a plain function returning a $() qrl in a custom hook',
        `export function useFoo() { const s = useSignal(0); function f() { return $(() => s.value); } return f(); }`,
      ],
      [
        'a component$ declared and used in an if block',
        inApp(`if (show.value) { const B = component$(() => <b>{s.value}</b>); console.log(B); }
  return <div>x</div>;`),
      ],
      [
        'a useTask$ in an if block',
        inApp(`if (show.value) { const f = () => s.value; useTask$(() => { f(); }); }
  return <div>x</div>;`),
      ],
      [
        'a useTask$ in a for...of body',
        inApp(`for (const i of [1]) { const f = () => s.value + i; useTask$(() => { f(); }); }
  return <div>x</div>;`),
      ],
      [
        'a useTask$ in a try block',
        inApp(`try { const f = () => s.value; useTask$(() => { f(); }); } catch {}
  return <div>x</div>;`),
      ],
      [
        'a $() qrl in a plain function calling a lifted local',
        inApp(`const f = () => s.value;
  function g() { return $(() => f()); }
  const q = g();
  useTask$(() => { q(); });
  return <div>x</div>;`),
      ],
      [
        'a component$ returned by a plain function',
        inApp(`function f() { const B = component$(() => <b>{s.value}</b>); return B; }
  const V = f();
  return <div><V/></div>;`),
      ],
    ])('no module imports what nothing reads: %s', async (_, code) => {
      expect(brokenOrDeadCode(await compile(code, isServer))).toEqual([]);
    });
  });

  test.each([
    [
      'a branch condition',
      inApp(`const f = () => s.value > 1;
  return <div>{f() ? <a>1</a> : <b>2</b>}</div>;`),
    ],
    [
      'a component props chunk',
      `import { Child } from './child';\n` +
        inApp(`const f = () => ({ a: s.value });
  return <Child {...f()} />;`),
    ],
    [
      'a collection key',
      inApp(`const items = useSignal([1, 2]);
  const f = (n) => n + s.value;
  return <ul>{items.value.map((n) => <li key={f(n)}>{n}</li>)}</ul>;`),
    ],
  ])('a lifted local read by %s is declared where it is read', async (_, code) => {
    expect(emittedCodeErrors(await compile(code, isServer))).toEqual([]);
  });

  test.each([
    [
      'a component$ a plain function returns',
      inApp(`function f() { const B = component$(() => <b>{s.value}</b>); return B; }
  const V = f();
  return <div><V/></div>;`),
    ],
    [
      'an arrow only a $() in a plain function calls',
      onlyNestedQrlReads('const X = () => s.value;', false),
    ],
    [
      'a function declaration only a $() in a plain function calls',
      onlyNestedQrlReads('function X() { return s.value; }', false),
    ],
    [
      'mutually recursive functions an event handler calls',
      inApp(`${mutualPair}
  return <button onClick$={() => a(3)}>x</button>;`),
    ],
    [
      'mutually recursive functions the parent also calls',
      inApp(`${mutualPair}
  const v = a(2);
  return <button onClick$={() => b(3)}>{v}</button>;`),
    ],
    [
      'a self-recursive function declaration',
      inApp(`function fact(n) { return n ? n * fact(n - 1) : s.value; }
  return <button onClick$={() => fact(3)}>x</button>;`),
    ],
    [
      'a self-recursive arrow',
      inApp(`const fact = (n) => (n ? n * fact(n - 1) : s.value);
  return <button onClick$={() => fact(3)}>x</button>;`),
    ],
    [
      'a local passed only as a $ prop',
      withChild(
        inApp(`const read = (v) => v + s.value;
  return <div><Child then$={read} /></div>;`)
      ),
    ],
    [
      'a local passed as a Catch fallback',
      `import { Catch } from '@qwik.dev/core';\n` +
        inApp(`const fb = () => <b>{s.value}</b>;
  return <Catch fallback$={fb}><p>x</p></Catch>;`),
    ],
    [
      'a textarea value',
      inApp(`const f = () => 'v' + s.value;
  return <textarea value={f()} />;`),
    ],
    [
      'a textarea value in a branch arm',
      inApp(`const f = () => 'v' + s.value;
  return <div>{show.value && <textarea value={f()} />}</div>;`),
    ],
    [
      'a preventdefault: value',
      inApp(`const f = () => s.value > 1;
  return <a preventdefault:click={f()} onClick$={() => 1}>x</a>;`),
    ],
    [
      'an event handler next to a preventdefault: a passive: cancels',
      inApp(`const f = () => s.value > 1;
  return <div passive:scroll preventdefault:scroll={f()} onScroll$={() => f()}>x</div>;`),
    ],
    [
      'a function declaration passing itself to $()',
      inApp(`function f() { return [s.value, $(f)]; }
  return <button onClick$={() => f()}>x</button>;`),
    ],
    [
      'an arrow passing itself to $()',
      inApp(`const f = () => [s.value, $(f)];
  return <button onClick$={() => f()}>x</button>;`),
    ],
    [
      'a component$ a $() in a local an event handler calls reads',
      inApp(`const make = () => { const B = component$(() => <b>{s.value}</b>); return $(() => B); };
  return <button onClick$={() => make()}>x</button>;`),
    ],
    [
      'a component$ a branch arm in a local an event handler calls renders',
      inApp(`const make = (v) => { const B = component$(() => <b>{s.value}</b>); return <div>{v && <B/>}</div>; };
  return <button onClick$={() => make(1)}>x</button>;`),
    ],
    [
      'a local passed to $()',
      inApp(`const f = () => s.value;
  const q = $(f);
  useTask$(() => { q(); });
  return <div>x</div>;`),
    ],
    [
      'a local a branch arm reads only through a nested hole',
      inApp(`const f = () => s.value;
  return <div>{show.value && <p>{f()}</p>}</div>;`),
    ],
    [
      'a local a parent calls and a branch arm passes as a $ prop',
      withChild(
        inApp(`const read = (v) => v.x + s.value + show.value;
  const direct = read({ x: 1 });
  return <div>{show.value && <Child then$={read} />}{direct}</div>;`)
      ),
    ],
    [
      'a useTask$ before the arrow it calls',
      inApp(`useTask$(() => { f(); });
  const f = () => s.value;
  return <div>x</div>;`),
    ],
    [
      'a $() before the arrow it calls',
      inApp(`const q = $(() => f());
  const f = () => s.value;
  useTask$(() => { q(); });
  return <div>x</div>;`),
    ],
    [
      'a useTask$ before the function declaration it calls',
      inApp(`useTask$(() => { f(); });
  function f() { return s.value; }
  return <div>x</div>;`),
    ],
    [
      'a never-written let arrow an event handler calls',
      inApp(`let f = () => s.value;
  return <button onClick$={() => f()}>x</button>;`),
    ],
    [
      'a never-written var arrow an event handler calls',
      inApp(`var f = () => s.value;
  return <button onClick$={() => f()}>x</button>;`),
    ],
    [
      'a var arrow in a block the parent calls after it and an event handler calls',
      inApp(`if (show.value) { var f = () => s.value; }
  const v = f();
  return <button onClick$={() => f()}>{v}</button>;`),
    ],
    [
      'a local reading a destructured prop',
      `export const App = component$((props: { a: number }) => {
  const { a } = props;
  const f = () => a;
  useTask$(() => { f(); });
  return <p>x</p>;
});`,
    ],
    [
      'a local read in projected content',
      withChild(
        inApp(`const f = () => s.value;
  return <Child><p>{f()}</p></Child>;`)
      ),
    ],
    [
      'a local a projected text hole reads',
      withChild(
        inApp(`const f = () => s.value;
  return <Child>{f()}</Child>;`)
      ),
    ],
    ...['Slot', 'Catch fallback$={() => <i />}', 'Pending fallback$={() => <i />}'].map((tag) => [
      `a local a text hole in <${tag}> reads`,
      `import { Slot, Catch, Pending } from '@qwik.dev/core';\n` +
        inApp(`const f = () => s.value;
  return <div><${tag}>{f()}</${tag.split(' ')[0]}></div>;`),
    ]),
    [
      'a local a member tag on props reads in an attribute and a hole',
      `export const App = component$((props: any) => {
  const s = useSignal(0);
  const f = () => s.value;
  return <props.as title={f()}>{f()}</props.as>;
});`,
    ],
    [
      'a local an element key and an event handler read',
      inApp(`const k = () => 'k' + s.value;
  return <div key={k()} onClick$={() => k()}>x</div>;`),
    ],
    [
      'a local a literal-array row key and an event handler read',
      inApp(`const k = (n) => 'k' + n + s.value;
  return <ul>{[1, 2].map((n) => <li key={k(n)} onClick$={() => k(n)}>{n}</li>)}</ul>;`),
    ],
    [
      'a local read in a keyed row',
      inApp(`const items = useSignal([1, 2]);
  const f = (n) => n + s.value;
  return <ul>{items.value.map((n) => <li key={n}>{f(n)}</li>)}</ul>;`),
    ],
    [
      'a local a keyed row declares, calls and an event handler calls',
      inApp(`const items = useSignal([1, 2]);
  return <ul>{items.value.map((n) => { const f = () => n + s.value; const label = f(); return <li key={n} onClick$={() => f()}>{label}</li>; })}</ul>;`),
    ],
    [
      'a function declaration a keyed row declares, calls and an event handler calls',
      inApp(`const items = useSignal([1, 2]);
  return <ul>{items.value.map((n) => { function f() { return n + s.value; } const label = f(); return <li key={n} onClick$={() => f()}>{label}</li>; })}</ul>;`),
    ],
    [
      'a local an event handler next to an element spread reads',
      inApp(`const f = () => s.value;
  const rest = { id: 'x' };
  return <button {...rest} onClick$={() => f()}>x</button>;`),
    ],
    [
      'a local an event handler next to a component spread reads',
      withChild(
        inApp(`const f = () => s.value;
  const rest = { id: show.value };
  return <Child {...rest} onClick$={() => f()} />;`)
      ),
    ],
    [
      'a lifted component whose setup calls a lifted local',
      inApp(`const f = () => s.value;
  const B = component$(() => { const v = f(); return <b onClick$={() => f()}>{v}</b>; });
  return <div>{show.value && <B/>}</div>;`),
    ],
    [
      'a local of a plain function a $() in it calls',
      `export function show() { const X = () => 1; return $(() => X()); }`,
    ],
    [
      'two adjacent declarators of a plain function only a $() calls',
      `export function make() { const f = () => 1, g = () => 2; return $(() => f() + g()); }`,
    ],
    [
      'two declarators only a $() calls after one the function reads',
      `export function make() { const n = 3, f = () => n, g = () => 2; return [n, $(() => f() + g())]; }`,
    ],
    [
      'two declarators only a $() calls around one the function reads',
      `export function make() { const f = () => 1, n = 3, g = () => n; return [n, $(() => f() + g())]; }`,
    ],
    [
      'a local of a task callback a $() in it calls',
      inApp(`useTask$(() => { const f = () => s.value; const q = $(() => f()); q(); });
  return <div>x</div>;`),
    ],
    [
      'a local of a plain function rendering JSX an event handler calls',
      `export function render(n) { const f = () => n + 1; return <div onClick$={() => f()}>{n}</div>; }`,
    ],
    [
      'a local of a plain function its own code and a $() call',
      `export function show(n) { const f = () => n + 1; const v = f(); return [v, $(() => f())]; }`,
    ],
    [
      'a function declaration of a plain function its own code and a $() call',
      `export function show(n) { const v = f(); function f() { return n + 1; } return [v, $(() => f())]; }`,
    ],
    [
      'an alias the setup and a branch arm call',
      `export const App = component$((props: { items: string[]; again: boolean }) => {
  let prefix = 'first';
  const renderRows = () => props.items.map((item) => <button id={item} onClick$={() => console.log(prefix, item)} />);
  const alias = renderRows;
  const first = alias();
  prefix = 'second';
  return <div>{first}{props.again ? alias() : null}</div>;
});`,
    ],
    [
      'an alias only an event handler calls',
      inApp(`const f = () => s.value;
  const g = f;
  return <button onClick$={() => g()}>x</button>;`),
    ],
    [
      'an alias only a text hole calls',
      inApp(`const f = () => s.value;
  const g = f;
  return <p>{g()}</p>;`),
    ],
    [
      'an alias and its target one event handler calls',
      inApp(`const f = () => s.value;
  const g = f;
  return <button onClick$={() => g() + f()}>x</button>;`),
    ],
    [
      'a chain of two aliases the setup and an event handler call',
      inApp(`const f = () => s.value;
  const g = f;
  const h = g;
  const v = h();
  return <button onClick$={() => h()}>{v}</button>;`),
    ],
    [
      'an alias declared after an event handler calling it and before one calling its target',
      inApp(`const f = () => s.value;
  const a = <button onClick$={() => g()}>x</button>;
  const g = f;
  return <div>{a}<button onClick$={() => f()}>y</button></div>;`),
    ],
    [
      'an alias of a local component a branch arm renders',
      inApp(`const B = component$(() => <b>{s.value}</b>);
  const G = B;
  return <div>{show.value && <G/>}</div>;`),
    ],
    [
      'an alias of a function declaration below it',
      inApp(`const g = f;
  function f() { return s.value; }
  return <button onClick$={() => g()}>x</button>;`),
    ],
    [
      'an alias passed to $()',
      inApp(`const f = () => s.value;
  const g = f;
  const q = $(g);
  useTask$(() => { q(); });
  return <div>x</div>;`),
    ],
    [
      'an alias nothing reads next to an event handler calling its target',
      inApp(`const f = () => s.value;
  const g = f;
  return <button onClick$={() => f()}>x</button>;`),
    ],
    [
      'a never-written let alias an event handler calls',
      inApp(`const f = () => s.value;
  let g = f;
  return <button onClick$={() => g()}>x</button>;`),
    ],
    ...Object.entries(chain).flatMap(([kind, statements]) =>
      chainOrders.flatMap((order) => [
        [
          `a chain of ${kind} an event handler calls, in the order ${order}`,
          inApp(`${inChainOrder(statements, order)}
  return <button onClick$={() => A()}>x</button>;`),
        ],
        [
          `a chain of ${kind} the parent and an event handler call, in the order ${order}`,
          inApp(`${inChainOrder(statements, order)}
  const v = A();
  return <button onClick$={() => B()}>{v}</button>;`),
        ],
      ])
    ),
  ])('lifted locals leave no broken or dead code: %s', async (_, code) => {
    expect(brokenOrDeadCode(await compile(code, isServer))).toEqual([]);
  });

  test.each([
    [
      'a text hole',
      `const f = () => s.value;\n  return <div dangerouslySetInnerHTML="<b>x</b>">{f()}</div>;`,
      ['f'],
    ],
    [
      'an event handler',
      `const f = () => s.value;\n  return <div dangerouslySetInnerHTML="<b>x</b>"><button onClick$={() => f()}>x</button></div>;`,
      ['f'],
    ],
    [
      'a text hole in a branch arm',
      `const f = () => s.value;\n  return <div>{show.value && <p dangerouslySetInnerHTML="x">{f()}</p>}</div>;`,
      ['f'],
    ],
    [
      'a text hole next to an event handler',
      `const f = () => s.value;\n  return <div onClick$={() => f()}><p dangerouslySetInnerHTML="x">{f()}</p></div>;`,
      [],
    ],
  ])(
    'a local read only by children dangerouslySetInnerHTML drops compiles: %s',
    async (_, body, authoredUnused) => {
      const modules = await compile(inApp(body), isServer, true, ['inner-html-children']);
      expect(brokenOrDeadCode(modules, authoredUnused)).toEqual([]);
      // An allowed name must not hide a dead rebind: such a local lifts nowhere.
      expect(
        modules.filter(({ path }) =>
          authoredUnused.some((name) => path.includes(`_${name}_segment_`))
        )
      ).toEqual([]);
    }
  );

  test.each([
    ['a function declaration', 'function f() { return a; }'],
    ['an arrow', 'const f = () => a;'],
  ])('%s its scope calls reads a props alias declared below it', async (_, local) => {
    const code = `export const App = component$((props) => {
  ${local}
  const { a } = props;
  const v = f();
  return <p>{v}</p>;
});`;
    expect(brokenOrDeadCode(await compile(code, isServer))).toEqual([]);
  });

  test('a local a projected component reads in its q:slot is rebound by the slot name only', async () => {
    const modules = await compile(
      withChild(
        inApp(`const f = () => 'a' + s.value;\n  return <Child><Child q:slot={f()} /></Child>;`)
      ),
      isServer
    );
    // A q:slot value still counts toward the slot render's captures, which leaves `s` unread there.
    expect(brokenOrDeadCode(modules, ['s'])).toEqual([]);
  });

  test.each([
    ['in a branch arm', `return <div>{s.value > 1 && <p key={k()}>x</p>}</div>;`],
    ['on a component in a branch arm', `return <div>{s.value > 1 && <Child key={k()} />}</div>;`],
    [
      'nested in a row',
      `const items = useSignal([1, 2]);
  return <ul>{items.value.map((n) => <li key={n}><b key={k(n)}>x</b></li>)}</ul>;`,
    ],
  ])('a local read only by a key lowering drops lifts nowhere: %s', async (_, body) => {
    const modules = await compile(
      withChild(inApp(`const k = (n) => 'a' + n + s.value;\n  ${body}`)),
      isServer
    );
    expect(brokenOrDeadCode(modules, ['k'])).toEqual([]);
    expect(modules.filter(({ path }) => path.includes('_k_segment_'))).toEqual([]);
  });

  test.each([
    ['an arrow', 'const X = () => 1;'],
    ['a function declaration', 'function X() { return 1; }'],
  ])('%s only a nested $() reads emits the same wherever it is declared', async (_, X) => {
    const first = await compile(onlyNestedQrlReads(X, false), isServer);
    const last = await compile(onlyNestedQrlReads(X, true), isServer);
    expect(last.map(({ code }) => code)).toEqual(first.map(({ code }) => code));
  });

  test.each(Object.entries(chain))(
    'a chain of %s emits the same in every declaration order',
    async (_, statements) => {
      const outputs = await Promise.all(
        chainOrders.map(async (order) => {
          const code = inApp(`${inChainOrder(statements, order)}
  return <button onClick$={() => A()}>x</button>;`);
          return (await compile(code, isServer)).map((module) => module.code);
        })
      );
      for (const output of outputs) {
        expect(output).toEqual(outputs[0]);
      }
    }
  );

  test.each([
    [
      'a reassigned local component',
      inApp(`let B = component$(() => <b>{s.value}</b>);
  if (show.value) B = component$(() => <i>{s.value}</i>);
  return <div>{show.value && <B/>}</div>;`),
      'the reassigned local component "B"',
    ],
    [
      'a reassigned local function',
      inApp(`let f = () => s.value;
  if (show.value) f = () => 1;
  return <button onClick$={() => f()}>x</button>;`),
      'the reassigned local function "f"',
    ],
    [
      'a function declared twice',
      inApp(`function f() { return s.value; }
  function f() { return s.value + 1; }
  return <button onClick$={() => f()}>x</button>;`),
      'the local function "f" declared twice',
    ],
    [
      'a var function declared twice',
      inApp(`var f = () => s.value;
  var f = () => s.value + 1;
  return <button onClick$={() => f()}>x</button>;`),
      'the local function "f" declared twice',
    ],
    [
      'a nullish alias of a local function',
      inApp(`const a = null;
  const f = () => s.value;
  const g = a ?? f;
  return <button onClick$={() => g()}>x</button>;`),
      '"g", an alias of the local function "f"',
    ],
    [
      'a reassigned alias of a local function',
      inApp(`const f = () => s.value;
  const other = () => 1;
  let g = f;
  if (show.value) g = other;
  return <button onClick$={() => g()}>x</button>;`),
      'the reassigned local function "g"',
    ],
    [
      'a conditional alias of local components',
      inApp(`const A = component$(() => <a>{s.value}</a>);
  const B = component$(() => <b/>);
  const T = s.value ? A : B;
  return <div>{show.value && <T/>}</div>;`),
      '"T", an alias of the local component "A"',
    ],
    [
      "a local function reading its scope's this",
      `export function make() { const f = () => this.x; return $(() => f()); }`,
      'the local function "f", which reads "this"',
    ],
    [
      "a local function reading its scope's arguments",
      `export function make(x) { const f = () => arguments[0]; return $(() => f()); }`,
      'the local function "f", which reads "arguments"',
    ],
  ])('a boundary reading %s is refused', async (_, code, local) => {
    await expect(compile(code, isServer)).rejects.toThrow(`a boundary reading ${local}`);
  });

  test.each([
    [
      'it returns',
      inApp(`const make = () => component$(() => <b>{s.value}</b>);
  return <button onClick$={() => make()}>x</button>;`),
    ],
    [
      'it returns in an array',
      inApp(`const make = () => [component$(() => <b>{s.value}</b>)];
  return <button onClick$={() => make()}>x</button>;`),
    ],
    [
      'it returns, in a plain function',
      `export function outer() { const make = () => component$(() => <b/>); return $(() => make()); }`,
    ],
  ])('an unnamed component$ a lifted local function %s is refused', async (_, code) => {
    await expect(compile(code, isServer)).rejects.toThrow(
      'an unnamed component$ in the local function "make"; declare it with a name first (const Name = component$(…))'
    );
  });

  test('a named component$ a $() returns is refused', async () => {
    const code =
      inApp(`const q = $(() => { const B = component$(() => <b>{s.value}</b>); return B; });
  return <button onClick$={() => q()}>x</button>;`);
    await expect(compile(code, isServer)).rejects.toThrow('a component$ inside a $ boundary');
  });

  test.each([
    [
      'it returns to an event handler',
      inApp(`const view = useSignal(null);
  const make = () => { const B = component$(() => <b>{s.value}</b>); return B; };
  return <button onClick$={() => { view.value = make(); }}>x</button>;`),
    ],
    [
      'next to a second one',
      inApp(`const make = () => { const A = component$(() => <a>{s.value}</a>); const B = component$(() => <b/>); return [A, B]; };
  return <button onClick$={() => make()}>x</button>;`),
    ],
    [
      'inside another lifted local function',
      inApp(`const outer = () => { const make = () => { const B = component$(() => <b>{s.value}</b>); return B; }; return $(() => make()); };
  return <button onClick$={() => outer()}>x</button>;`),
    ],
    [
      'the setup also calls',
      inApp(`const make = () => { const B = component$(() => <b>{s.value}</b>); return B; };
  const V = make();
  return <div><V/><button onClick$={() => make()}>x</button></div>;`),
    ],
    [
      'declared with a never-written let',
      inApp(`const make = () => { let B = component$(() => <b>{s.value}</b>); return B; };
  return <button onClick$={() => make()}>x</button>;`),
    ],
    [
      'calling its own hooks',
      inApp(`const make = () => { const B = component$(() => { const n = useSignal(1); return <b>{n.value + s.value}</b>; }); return B; };
  return <button onClick$={() => make()}>x</button>;`),
    ],
    [
      'in a plain function',
      `export function outer() { const make = () => { const B = component$(() => <b/>); return B; }; return $(() => make()); }`,
    ],
  ])('a named component$ in a lifted local function lifts: %s', async (_, code) => {
    const modules = await compile(code, isServer);
    expect(brokenOrDeadCode(modules)).toEqual([]);
    expect(modules.some(({ path }) => path.includes('_B_segment_'))).toBe(true);
  });

  test('a lifted local function binds the component$ it returns to its segment', async () => {
    const modules = await compile(
      inApp(`const view = useSignal(null);
  const make = () => { const B = component$(() => <b>{s.value}</b>); return B; };
  return <button onClick$={() => { view.value = make(); }}>x</button>;`),
      isServer
    );
    const code = (kind: string) => modules.find(({ path }) => path.includes(kind))!.code;
    expect(code('_make_segment_')).toMatch(
      /const \[s\] = _capturesObj\._;\n {2}const B = function \(\) \{\n {2}return _withCaptures\(app_B_segment_\w+, \[s\]\)\.apply\(this, arguments\);\n\};\n\s*return B;/
    );
    expect(code('_q_e_click_segment_')).toMatch(
      /const make = _withCaptures\(app_make_segment_\w+, \[s\]\);\n {2}view\.value = make\(\);/
    );
  });

  describe.each(Object.entries(helperComponents))('a component %s in a helper', (_, declare) => {
    const helper = (jsx = '<b>{s.value}</b>', returned = 'B') =>
      `const make = () => { ${declare(jsx)} return ${returned}; };`;

    test.each([
      ['with captures', '<b>{s.value}</b>', []],
      ['with no captures', '<b>hi</b>', ['s']],
    ])('the setup calls compiles as a component, %s', async (__, jsx, unused) => {
      const modules = await compile(
        inApp(`${helper(jsx)}\n  const V = make();\n  return <div><V/></div>;`),
        isServer
      );
      expect(brokenOrDeadCode(modules, unused)).toEqual([]);
      const app = modules.find(({ path }) => path.includes('App_component'))!.code;
      expect(app).toMatch(componentOf('B'));
      expect(modules.filter(({ path }) => path.includes('_jsx_segment_'))).toEqual([]);
    });

    test.each([
      [
        'a handler calls the helper',
        `const view = useSignal(null);\n  ${helper()}\n  return <button onClick$={() => { view.value = make(); }}>x</button>;`,
      ],
      [
        'a $() reads it',
        `const make = () => { ${declare('<b>{s.value}</b>')} return $(() => B); };\n  const q = make();\n  return <div>{q ? 'a' : 'b'}</div>;`,
      ],
      [
        'a branch arm of the helper renders it',
        `${helper('<b>{s.value}</b>', 'show.value ? <B/> : <i/>')}\n  return <div>{make()}</div>;`,
      ],
    ])('lifts to its own segment when %s', async (__, body) => {
      const modules = await compile(inApp(body), isServer);
      expect(brokenOrDeadCode(modules)).toEqual([]);
      expect(modules.some(({ path }) => path.includes('_B_segment_'))).toBe(true);
    });
  });

  test.each([
    ['the setup calls', '\n  const [X, Y] = make();\n  return <div><X/><Y/></div>;'],
    ['a handler calls', '\n  return <button onClick$={() => make()}>x</button>;'],
  ])('a component$ and a plain function component in a helper %s compile alike', async (_, use) => {
    const modules = await compile(
      inApp(
        `const make = () => { const A = component$(() => <a>{s.value}</a>); const B = () => <b>{s.value}</b>; return [A, B]; };${use}`
      ),
      isServer
    );
    expect(brokenOrDeadCode(modules)).toEqual([]);
    const code = modules.map(({ code }) => code).join('\n');
    const shape = (name: string) =>
      code.includes(`_${name}_segment_`)
        ? 'segment'
        : code.includes(`const ${name} = (props, ctx)`)
          ? 'inline'
          : 'other';
    expect(shape('B')).toBe(shape('A'));
    expect(shape('A')).not.toBe('other');
  });

  test.each([
    ['an uppercase function returning no JSX', 'const B = () => s.value + 1;', 'B()'],
    ['a lowercase function returning JSX', 'const b = () => <b>{s.value}</b>;', 'b()'],
  ])('%s in a helper stays a plain function', async (_, declaration, call) => {
    const modules = await compile(
      inApp(
        `const make = () => { ${declaration} return ${call}; };\n  return <div>{make()}</div>;`
      ),
      isServer
    );
    expect(brokenOrDeadCode(modules)).toEqual([]);
    expect(modules.map(({ code }) => code).join('\n')).not.toMatch(componentOf('[Bb]'));
  });

  test('a plain function component in a $() body stays a plain function', async () => {
    const modules = await compile(
      inApp(`const q = $(() => { const B = () => <b>{s.value}</b>; return B; });
  return <button onClick$={() => q()}>x</button>;`),
      isServer
    );
    expect(brokenOrDeadCode(modules)).toEqual([]);
    expect(modules.map(({ code }) => code).join('\n')).not.toMatch(componentOf('B'));
  });

  describe('an uppercase JSX function', () => {
    /** `Row` compiled with a component's `(props, ctx)` signature, under any parameter name. */
    const isRowComponent = (modules: Awaited<ReturnType<typeof compile>>) =>
      /Row\w* = \(\w+, ctx\)|function Row\w*\(\w+, ctx\)/.test(
        modules.map(({ code }) => code).join('\n')
      );

    test.each([
      ['the setup calls in a hole', false, `${row}\n  return <ul>{Row(1)}</ul>;`],
      [
        'a helper calls',
        false,
        `const make = () => { ${row} return Row(1); };\n  return <ul>{make()}</ul>;`,
      ],
      [
        'only an event handler calls',
        false,
        `const view = useSignal(null);\n  ${row}\n  return <button onClick$={() => { view.value = Row(1); }}>x</button>;`,
      ],
      [
        'written as a function declaration the setup calls',
        false,
        'function Row(item) { return <li>{item}{s.value}</li>; }\n  return <ul>{Row(1)}</ul>;',
      ],
      ['the setup only renders as a tag', true, `${row}\n  return <ul><Row /></ul>;`],
      [
        'the setup only passes to a function',
        true,
        `const wrap = (X) => X;\n  ${row}\n  const V = wrap(Row);\n  return <ul><V /></ul>;`,
      ],
    ])('%s compiles as a component: %s', async (_, isComponent, body) => {
      const modules = await compile(inApp(body), isServer);
      expect(brokenOrDeadCode(modules)).toEqual([]);
      expect(isRowComponent(modules)).toBe(isComponent);
    });

    test.each([
      ['a .map callback calls', false, 'items.value.map((i) => Row(i))'],
      ['a .map gets as its callback', true, 'items.value.map(Row)'],
    ])('%s compiles as a component: %s', async (_, isComponent, rows) => {
      const modules = await compile(
        inApp(`const items = useSignal([1, 2]);\n  ${row}\n  return <ul>{${rows}}</ul>;`),
        isServer
      );
      // Both still leave a dead `Row` declaration: a gap of row callbacks, not of this rule.
      expect(emittedCodeErrors(modules)).toEqual([]);
      expect(isRowComponent(modules)).toBe(isComponent);
    });

    test('a helper calls beside component$ of it stays a plain function', async () => {
      const modules = await compile(
        'export function make(label) { const Fn = () => <div>{label}</div>; return [component$(Fn), Fn()]; }',
        isServer
      );
      expect(brokenOrDeadCode(modules)).toEqual([]);
      expect(modules.map(({ code }) => code).join('\n')).toMatch(
        /const Fn = \(\) => q_\w+\.w\(\[label\]\);/
      );
    });

    test('the setup both calls and renders as a tag is refused', async () => {
      await expect(
        compile(inApp(`${row}\n  return <ul>{Row(1)}<Row /></ul>;`), isServer)
      ).rejects.toThrow('"Row" called as a function and also rendered as <Row />');
    });
  });

  test.each([
    [
      'an element event handler',
      'const bump = () => s.value++;',
      'const bump = $(() => s.value++);',
      'return <button onClick$={bump}>x</button>;',
      '"q-e:click"',
    ],
    [
      'a component event prop',
      'const bump = (v) => { s.value = v; };',
      'const bump = $((v) => { s.value = v; });',
      'return <Child onPick$={bump} />;',
      '"onPick$"',
    ],
  ])('a local passed by name as %s passes its QRL like a $() one', async (...cases) => {
    const [, local, qrl, render, event] = cases;
    const [lifted, explicit] = await Promise.all(
      [local, qrl].map(async (declaration) => {
        const modules = await compile(withChild(inApp(`${declaration}\n  ${render}`)), isServer);
        return modules.find(({ path }) => path.includes('App_component'))!.code;
      })
    );
    // The $() version binds the QRL to `bump`; the lifted one must pass that same QRL in place.
    const [, bound] = /const bump = (.+);/.exec(explicit)!;
    const passed = explicit
      .split('\n')
      .find((line) => line.includes(event))!
      .replace(/\bbump\b/, bound);
    expect(lifted).toContain(passed.trim());
  });

  test.each([
    ['an element', 'return <button {...rest} onClick$={bump}>x</button>;'],
    ['a component', 'return <Child {...rest} onClick$={bump} />;'],
  ])('a local passed by name as an event next to a spread on %s is its QRL', async (_, render) => {
    const modules = await compile(
      withChild(inApp(`const bump = () => s.value++;\n  const rest = { id: 'x' };\n  ${render}`)),
      isServer
    );
    expect(modules.map(({ code }) => code).join('\n')).toMatch(
      /"onClick\$": q_app_bump_segment_\w+\.w\(\[s\]\)/
    );
  });

  test.each([
    ['an event handler', 'return <button onClick$={g}>x</button>;', '"q-e:click"'],
    ['a $ prop', 'return <Child then$={g} />;', '"then$"'],
  ])('an alias passed by name as %s passes its target QRL', async (_, render, prop) => {
    const modules = await compile(
      withChild(inApp(`const f = () => s.value;\n  const g = f;\n  ${render}`)),
      isServer
    );
    expect(brokenOrDeadCode(modules)).toEqual([]);
    expect(modules.map(({ code }) => code).join('\n')).toMatch(
      new RegExp(`${prop.replace('$', '\\$')}.*q_app_f_segment_\\w+\\.w\\(\\[s\\]\\)`)
    );
  });

  test('a row key reading a function declaration of the row is refused in authored terms', async () => {
    const code = inApp(`const items = useSignal([1, 2]);
  return <ul>{items.value.map((n) => { function k(m) { return m + 1; } const id = k(n); return <li key={id}>{n}</li>; })}</ul>;`);
    await expect(compile(code, isServer)).rejects.toThrow('a collection key capturing "k"');
  });

  test('a reassigned local component rendered in place prints both components inline', async () => {
    const modules = await compile(
      inApp(`let B = component$(() => <b>{s.value}</b>);
  if (show.value) B = component$(() => <i>{s.value}</i>);
  return <div><B/></div>;`),
      isServer
    );
    expect(emittedCodeErrors(modules)).toEqual([]);
    expect(modules.filter(({ path }) => path.includes('_B_segment_'))).toEqual([]);
  });

  test('a lifted component of a plain function leaves its other declarators', async () => {
    const modules = await compile(
      `export function make() { const s = useSignal(0); const a = 1, B = component$(() => <b>{s.value + a}</b>); return $(() => B); }`,
      isServer
    );
    expect(emittedCodeErrors(modules)).toEqual([]);
    expect(modules.find(({ path }) => path === 'src/app.tsx')!.code).toMatch(/const a = 1;\n/);
  });

  test.each([
    ['in parentheses', '(component$(() => <b>{s.value}</b>))'],
    ['cast with as', 'component$(() => <b>{s.value}</b>) as any'],
    ['checked with satisfies', 'component$(() => <b>{s.value}</b>) satisfies unknown'],
  ])('a local component %s lifts when a boundary reads it', async (_, component) => {
    const inSetup = inApp(`const B = ${component};
  return <div>{show.value && <B/>}</div>;`);
    const inPlainFunction = `export function make() { const s = useSignal(0); const B = ${component}; return $(() => B); }`;
    for (const code of [inSetup, inPlainFunction]) {
      const modules = await compile(code, isServer, false);
      expect(modules.some(({ path }) => path.includes('_B_segment_'))).toBe(true);
    }
  });

  test('a lifted function* declaration stays a generator', async () => {
    const modules = await compile(
      inApp(`function* f() { yield s.value; }
  return <button onClick$={() => [...f()]}>x</button>;`),
      isServer
    );
    expect(emittedCodeErrors(modules)).toEqual([]);
    expect(modules.some(({ code }) => code.includes('function* f('))).toBe(true);
  });
});

describe.each([false, true])('a custom hook its setup lowering refuses (SSR: %s)', (isServer) => {
  // A `for` header hook makes the setup lowering refuse, so the hook prints as authored code.
  const refused = (body: string) =>
    `export function useFoo() { const s = useSignal(0); ${body} for (const x of [useSignal(1)]) { console.log(x); } return s; }`;

  test('lifts its locals in the authored fallback', async () => {
    const modules = await compile(
      refused(`useTask$(() => { f(); }); const f = () => s.value;`),
      isServer
    );
    expect(brokenOrDeadCode(modules)).toEqual([]);
  });

  test('extracts the $() calls its refused setup already reached', async () => {
    const modules = await compile(
      refused(`const g = [() => $(() => s.value)]; console.log(g);`),
      isServer
    );
    expect(modules[0].code).not.toContain('$(() =>');
  });
});

test.each([
  ['routeHref', false, { stripCtxName: ['route', 'server'] }],
  ['serverTime', true, { stripCtxName: ['client'], regCtxName: ['server'] }],
  ['browserLang', true, { stripCtxName: ['client', 'browser'] }],
])(
  'a lifted local named %s is not a stripped or registered marker (SSR: %s)',
  async (name, isServer, strip) => {
    const modules = await compile(
      inApp(`const ${name} = () => 'x' + s.value;
  const v = ${name}();
  return <button onClick$={() => ${name}()}>{v}</button>;`),
      isServer,
      true,
      [],
      strip
    );
    expect(emittedCodeErrors(modules)).toEqual([]);
    expect(modules.some(({ code }) => code.includes('_regSymbol'))).toBe(false);
  }
);

// Keeps the checker honest: it must report what the tests above expect to be absent.
test('the emitted-code checker reports dead code, undeclared names and missing chunk imports', () => {
  const modules = [
    {
      path: 'src/a.tsx',
      code: `import { $, b } from 'x';\nimport { seg } from "./a.tsx_b";\nimport { other } from "./a.tsx_c";\nlet f = b;\nb(c, seg, other);`,
    },
    { path: 'src/a.tsx_b.js', code: `export const other = 1;`, segment: { ctxName: 'b' } },
  ];
  expect(unusedDeclarations(modules, ['$'])).toEqual([
    `src/a.tsx: 'f' is declared but its value is never read. | let f = b;`,
  ]);
  expect(emittedCodeErrors(modules)).toEqual([
    `src/a.tsx: Module '"./a.tsx_b"' has no exported member 'seg'. | import { seg } from "./a.tsx_b";`,
    `src/a.tsx: Cannot find module './a.tsx_c' or its corresponding type declarations. | import { other } from "./a.tsx_c";`,
    `src/a.tsx: Cannot find name 'c'. | b(c, seg, other);`,
  ]);
});

/** Evaluates the emitted main module and client segments as one script and returns `name`. */
function loadEmitted(
  modules: readonly { path: string; code: string }[],
  name: string,
  runtime: object = {}
) {
  const segments = modules.filter(({ path }) => path.includes('_segment_'));
  for (const { path, code } of segments) {
    // ESM refuses a module importing its own export; the one script would hide that.
    expect(code).not.toContain(`from "./${path.slice(path.lastIndexOf('/') + 1, -'.js'.length)}"`);
  }
  const script = [modules.find(({ path }) => path === 'src/app.tsx')!, ...segments]
    .map(({ code }) => code.replace(/^(import .*|export \{.*)$/gm, '').replace(/^export /gm, ''))
    .join('\n');
  // A `$()` the main module passes on is a QRL it never calls here.
  const qrl = () => ({ w: () => null });
  return runInNewContext(`${script}\n${name}`, {
    ...runtime,
    _capturesObj,
    _withCaptures: withCaptures,
    qrl,
  });
}

/** The export of the emitted client segment of `kind`. */
function segmentName(modules: readonly { path: string; code: string }[], kind = '_q_e_click') {
  const segment = modules.find(({ path }) => path.includes(`${kind}_segment_`))!;
  return /export const (\w+) =/.exec(segment.code)![1];
}

test.each([
  [
    'a self-recursive function declaration',
    'function fact(n) { return n ? n * fact(n - 1) : s.value; }',
    'fact(3)',
    30,
  ],
  ['a self-recursive arrow', 'const fact = (n) => (n ? n * fact(n - 1) : s.value);', 'fact(3)', 30],
  ['mutually recursive functions', mutualPair, 'a(4)', 5],
  ['an alias of a local function', 'const f = (n) => n + s.value;\n  const g = f;', 'g(1)', 6],
  [
    'a chain of two aliases',
    'const f = (n) => n + s.value;\n  const g = f;\n  const h = g;',
    'h(1)',
    6,
  ],
  [
    'a function declaration reading arguments',
    'function count() { return arguments.length + s.value; }',
    'count(1, 2)',
    7,
  ],
  [
    'a function declaration with no captures reading arguments',
    'function count() { return arguments.length; }',
    'count(1, 2)',
    2,
  ],
  [
    'a function declaration reading this',
    'function who() { return this?.x ?? s.value; }',
    'who.call({ x: 1 })',
    1,
  ],
  ['a function declaration called with new', 'function P() { this.v = s.value; }', 'new P().v', 5],
  [
    'a default parameter calling another lifted local',
    'const g = () => s.value;\n  const f = (x = g()) => x;',
    'f()',
    5,
  ],
  [
    'a function declaration whose default parameter calls another lifted local',
    'const g = () => s.value;\n  function f(x = g()) { return x; }',
    'f()',
    5,
  ],
])('%s runs from its emitted client segments', async (_, declarations, call, expected) => {
  const modules = await compile(
    inApp(`${declarations}\n  return <button onClick$={() => ${call}}>x</button>;`),
    false
  );
  const click = loadEmitted(modules, segmentName(modules));
  expect(withCaptures(click, [{ value: 5 }])()).toBe(expected);
});

test.each([
  ['an arrow', 'const f = (m) => m + n;'],
  ['a function declaration', 'function f(m) { return m + n; }'],
])('%s of a plain function runs from the emitted $() segment calling it', async (_, local) => {
  const modules = await compile(
    `export function show(n) { ${local} return $(() => f(1)); }`,
    false
  );
  const qrl = loadEmitted(modules, segmentName(modules, '_qrl'));
  expect(withCaptures(qrl, [5])()).toBe(6);
});

test('a lifted function expression its scope calls as a method sees its receiver', async () => {
  const modules = await compile(
    `export function show(n) { const f = function () { return this.n + n; }; const o = { n: 1, f }; return [o.f(), $(() => f.call({ n: 2 }))]; }`,
    false
  );
  const show = loadEmitted(modules, 'show');
  const qrl = loadEmitted(modules, segmentName(modules, '_qrl'));
  expect([show(5)[0], withCaptures(qrl, [5])()]).toEqual([6, 7]);
});

test.each(
  Object.entries(helperComponents).flatMap(([spelling, declare]) => [
    [spelling, 'reading a signal of its scope', declare('<b>{s.value}</b>'), ['5', '6']],
    [spelling, 'with no captures', declare('<b>hi</b>'), ['hi', 'hi']],
  ])
)(
  'a component %s a lifted local function returns renders as a dynamic tag, %s',
  async (_, __, declaration, texts) => {
    const modules = await compile(
      inApp(`const view = useSignal(null);
  const make = () => { ${declaration} return B; };
  return <button onClick$={() => { view.value = make(); }}>x</button>;`),
      false
    );
    const make = loadEmitted(modules, segmentName(modules, '_make'), core);
    const s = new core.Signal(5);
    const B = withCaptures(make, [s])();
    const document = createDocument();
    const scheduler = new Scheduler(() => {});
    const owner = core.createOwner(null);
    try {
      // The runtime renders a component held in a signal as a dynamic tag.
      const node: Element = core.runWithOwner(owner, () =>
        core.createDynamicTag(B, {}, { document, scheduler } as never)
      );
      await scheduler.flushInteraction();
      expect(node.outerHTML).toBe(`<b>${texts[0]}</b>`);
      s.value = 6;
      await scheduler.flushInteraction();
      expect(node.textContent).toBe(texts[1]);
    } finally {
      await core.disposeOwner(owner);
    }
  }
);

test.each(Object.entries(helperComponents))(
  'a component %s the setup gets from a lifted local function renders on the server',
  async (_, declare) => {
    const modules = await compile(
      inApp(`const make = () => { ${declare('<b>{s.value}</b>')} return B; };
  const V = make();
  return <div><V/><button onClick$={() => make()}>x</button></div>;`),
      true
    );
    expect(readRenderedText(await renderAppOnServer(modules), 'b')).toEqual(['0']);
  }
);

/** The HTML the emitted `App` renders on the server, its segments mirrored into its module. */
async function renderAppOnServer(modules: Awaited<ReturnType<typeof compile>>) {
  const app = modules.find(({ path }) => path.includes('App_component'))!;
  const [, component] = /export function (\w+)/.exec(app.code)!;
  const render = loadDefaultFunction(
    { ...app, code: `${app.code}\nexport default ${component};` },
    {
      ...core,
      get _capturesObj() {
        return core._capturesObj;
      },
    },
    true
  );
  const { html } = await renderToStringCompiled((_, ctx) => render({}, ctx));
  return html;
}

/** The texts of `selector` the emitted `App` renders on the client, each QRL resolving its segment. */
async function renderAppOnClient(modules: Awaited<ReturnType<typeof compile>>, selector: string) {
  const globals: Record<string, unknown> = {
    ...core,
    get _capturesObj() {
      return core._capturesObj;
    },
    qrl: (_: unknown, symbol: string) =>
      core.qrl(async () => ({ [symbol]: globals[symbol] }), symbol),
  };
  for (const module of modules) {
    if (module.segment) {
      const { name } = module.segment;
      globals[name] = loadDefaultFunction(
        { ...module, code: `${module.code}\nexport default ${name};` },
        globals
      );
    }
  }
  const app = modules.find(({ segment }) => segment?.ctxName === 'component$')!.segment!.name;
  const document = createDocument();
  const scheduler = new Scheduler(() => {});
  const owner = core.createOwner(null);
  try {
    const nodes = core.runWithOwner(owner, () =>
      core.createComponent(globals[app] as never, {}, { document, scheduler })
    );
    for (const node of [nodes].flat()) {
      document.body.appendChild(node);
    }
    await scheduler.flushInteraction();
    return Array.from(document.querySelectorAll(selector), (element) => element.textContent);
  } finally {
    await core.disposeOwner(owner);
  }
}

describe.each([
  ['the setup', `${row}\n  return <ul>{Row(1)}{Row(2)}</ul>;`, ['10', '20']],
  [
    'a helper',
    `const make = () => { ${row} return Row(1); };\n  return <ul>{make()}</ul>;`,
    ['10'],
  ],
])('an uppercase JSX function %s calls directly', (_, body, texts) => {
  test('renders what the call returns on the client', async () => {
    const modules = await compile(inApp(body), false);
    expect(await renderAppOnClient(modules, 'li')).toEqual(texts);
  });

  test('renders what the call returns on the server', async () => {
    const modules = await compile(inApp(body), true);
    expect(readRenderedText(await renderAppOnServer(modules), 'li')).toEqual(texts);
  });
});

describe('a list row writing a captured local', () => {
  /** Rows of `items` that run `write` first, then render `prefix` through a nested text segment. */
  const rowsWriting = (write: string) =>
    inApp(`const items = useSignal(['a', 'b']);
  let prefix = 'initial';
  const run = (action) => action();
  return <ul>{items.value.map((item) => { ${write} return <li key={item}>{prefix + s.value}</li>; })}</ul>;`);

  describe.each([
    ['through a callback it passes to a helper', 'run(() => { prefix = item; });', ['a0', 'b0']],
    ['by an array pattern', '[prefix] = [item];', ['a0', 'b0']],
    ['by an object pattern', '({ name: prefix } = { name: item });', ['a0', 'b0']],
    // Each row starts from its own copy, so the second row never sees what the first one added.
    ['with +=', 'prefix += item;', ['initiala0', 'initialb0']],
  ])('%s', (_, write, texts) => {
    test.each([false, true])('compiles to declared, live code (SSR: %s)', async (isServer) => {
      const modules = await compile(rowsWriting(write), isServer);
      expect(brokenOrDeadCode(modules, write.includes('run(') ? [] : ['run'])).toEqual([]);
    });

    test('renders the value each row wrote on the client', async () => {
      const modules = await compile(rowsWriting(write), false);
      expect(await renderAppOnClient(modules, 'li')).toEqual(texts);
    });

    test('renders the value each row wrote on the server', async () => {
      const modules = await compile(rowsWriting(write), true);
      expect(readRenderedText(await renderAppOnServer(modules), 'li')).toEqual(texts);
    });
  });

  test.each([
    ['only reads it shares its row events across rows', '', true],
    ['writes it builds its row events per row', 'prefix = item;', false],
  ])('a row that %s', async (_, write, isShared) => {
    const modules = await compile(
      inApp(`const items = useSignal(['a', 'b']);
  let prefix = 'initial';
  return <ul>{items.value.map((item) => { ${write} return <li key={item} onClick$={() => console.log(prefix, item)}>{item}{s.value}</li>; })}</ul>;`),
      false
    );
    expect(brokenOrDeadCode(modules)).toEqual([]);
    expect(modules.some(({ code }) => code.includes('.rowEvents ??='))).toBe(isShared);
  });
});

describe('an uppercase function returning a list', () => {
  const list = 'items.value.map((item) => <li key={item}>{item}{s.value}</li>)';
  const footer = `function Footer() { return ${list}; }`;
  const items = "const items = useSignal(['a', 'b']);";

  describe.each([
    ['declared before the return', `${items}\n  ${footer}\n  return <ul><Footer /></ul>;`],
    ['declared after the return', `${items}\n  return <ul><Footer /></ul>;\n  ${footer}`],
  ])('rendered as a tag, %s', (_, body) => {
    test.each([false, true])('compiles as a component (SSR: %s)', async (isServer) => {
      const modules = await compile(inApp(body), isServer);
      expect(brokenOrDeadCode(modules)).toEqual([]);
      expect(modules.map(({ code }) => code).join('\n')).toMatch(componentOf('Footer\\w*'));
    });

    test('renders its rows on the client', async () => {
      const modules = await compile(inApp(body), false);
      expect(await renderAppOnClient(modules, 'li')).toEqual(['a0', 'b0']);
    });

    test('renders its rows on the server', async () => {
      const modules = await compile(inApp(body), true);
      expect(readRenderedText(await renderAppOnServer(modules), 'li')).toEqual(['a0', 'b0']);
    });
  });

  test.each([
    ['a lowercase twin', `function footer() { return ${list}; }`, 'footer'],
    ['called directly', footer, 'Footer'],
  ])('%s stays a plain function', async (_, declaration, name) => {
    for (const isServer of [false, true]) {
      const modules = await compile(
        inApp(`${items}\n  ${declaration}\n  return <ul>{${name}()}</ul>;`),
        isServer
      );
      expect(emittedCodeErrors(modules)).toEqual([]);
      expect(modules.map(({ code }) => code).join('\n')).not.toMatch(componentOf(`${name}\\w*`));
    }
  });
});
