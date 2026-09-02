/**
 * Golden snapshots (DESIGN.md "Phases"): per test one file PER MODE (`snapshots/<name>.ssr.snap`,
 * `<name>.csr.snap`) in the legacy suite's form. Files were seeded from the legacy oracle; until
 * the cutover deletes `../../src`, reseed the same way. Updates via `vitest -u` come from the
 * STAGED pipeline — review the diff against the fixture's intent before accepting.
 */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { snapshotResult } from './snapshot-format';

interface TestInput {
  code: string;
  path?: string;
}

async function testInput(mode: 'ssr' | 'csr', snapshotName: string, input: TestInput) {
  return testInputs(mode, snapshotName, [input]);
}

async function testInputs(mode: 'ssr' | 'csr', snapshotName: string, inputs: readonly TestInput[]) {
  const output = await transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: mode === 'ssr',
    input: inputs.map((input) => ({
      path: input.path ?? 'src/component.tsx',
      code: input.code,
    })),
  });
  const source =
    inputs.length === 1
      ? inputs[0].code
      : inputs.map((input) => `// ${input.path ?? 'src/component.tsx'}\n${input.code}`).join('\n');
  await expect(
    await snapshotResult(source, mode === 'ssr' ? 'SSR' : 'CSR', output)
  ).toMatchFileSnapshot(`snapshots/${snapshotName}.${mode}.snap`);
  return output;
}

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should pass through a foreign TypeScript module', async () => {
    await testInput(mode, 'foreign-passthrough-ts', {
      path: 'src/plain.ts',
      code: `const value: number = 1;
export default value;
`,
    });
  });

  test('should compile a static default-arrow component', async () => {
    await testInput(mode, 'static-default-arrow', {
      code: `export default () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should compile a named const-export component', async () => {
    await testInput(mode, 'named-const-export', {
      code: `export const App = () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should compile two components in one module', async () => {
    await testInput(mode, 'two-components', {
      code: `export const Header = () => {
  return <h1>Hi</h1>;
};
export default () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should compile an expression-body arrow component', async () => {
    await testInput(mode, 'expression-body-arrow', {
      code: `export default () => <p>Hello Qwik</p>;
`,
    });
  });

  test('should emit static attributes, bare booleans, JSX aliases, and aria', async () => {
    await testInput(mode, 'static-attributes', {
      code: `export default () => {
  return <main className="shell" htmlFor="x" hidden aria-hidden="false" title="A&B"></main>;
};
`,
    });
  });

  test('should fold a nested tree with void tags and raw text', async () => {
    await testInput(mode, 'nested-tree-void-raw-text', {
      code: `export default () => {
  return <section><h1 title="hi">A&B</h1><br/><p>x</p></section>;
};
`,
    });
  });

  test('should normalize multi-line JSX text', async () => {
    await testInput(mode, 'multi-line-jsx-text', {
      code: `export default () => {
  return (
    <p>
      one
      two
    </p>
  );
};
`,
    });
  });

  test('should compile a component with an unused props param', async () => {
    await testInput(mode, 'unused-props-param', {
      code: `export default (props) => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should reuse the authored props param name', async () => {
    await testInput(mode, 'authored-props-name', {
      code: `export default (myProps) => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should keep a const sibling statement', async () => {
    await testInput(mode, 'const-sibling-statement', {
      code: `const title = 'Hello';
export default () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should allocate a fresh name around a module binding named ctx', async () => {
    await testInput(mode, 'ctx-module-binding', {
      code: `const ctx = 1;
export default () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should keep an import sibling', async () => {
    await testInput(mode, 'import-sibling', {
      code: `import { something } from './helpers';
export default () => {
  return <p>Hello Qwik</p>;
};
`,
    });
  });

  test('should render a text hole reading props', async () => {
    await testInput(mode, 'text-hole-props', {
      code: `export default (props) => {
  return <p>{props.title}</p>;
};
`,
    });
  });

  test('should render a text hole in an expression-body arrow', async () => {
    await testInput(mode, 'text-hole-expression-body', {
      code: `export default (props) => <p>{props.name}</p>;
`,
    });
  });

  test('should subscribe a signal-read text hole', async () => {
    await testInput(mode, 'use-signal-hole', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>{count.value}</p>;
};
`,
    });
  });

  test('should capture a signal in an event handler', async () => {
    await testInput(mode, 'capturing-event', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>go</button>;
};
`,
    });
  });

  test('should compose the counter from events, captures, and signal reads', async () => {
    await testInput(mode, 'counter', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
};
`,
    });
  });

  test('should wire an event handler without captures', async () => {
    await testInput(mode, 'event-no-captures', {
      code: `export default () => {
  return <button onClick$={() => console.log(1)}>go</button>;
};
`,
    });
  });

  test('should wire an event handler with a parameter', async () => {
    await testInput(mode, 'event-with-param', {
      code: `export default () => {
  return <button onDblClick$={(ev) => console.log(ev)}>go</button>;
};
`,
    });
  });

  test('should wire an event handler alongside static attributes', async () => {
    await testInput(mode, 'event-alongside-static-attrs', {
      code: `export default () => {
  return <button class="cta" onClick$={() => console.log(1)} hidden>go</button>;
};
`,
    });
  });

  test('should render a props text hole with sibling children', async () => {
    await testInput(mode, 'text-hole-siblings-props', {
      code: `export default (props) => {
  return <p>a{props.title}b</p>;
};
`,
    });
  });

  test('should render a signal-read text hole with sibling children', async () => {
    await testInput(mode, 'text-hole-siblings-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>Count: {count.value}!</p>;
};
`,
    });
  });
  test('should bind a dynamic attribute reading props', async () => {
    await testInput(mode, 'dynamic-attr-props', {
      code: `export default (props) => {
  return <p title={props.title}>x</p>;
};
`,
    });
  });

  test('should bind a signal-read dynamic attribute', async () => {
    await testInput(mode, 'dynamic-attr-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <div class={count.value}>x</div>;
};
`,
    });
  });

  test('should render a ternary branch on a signal', async () => {
    await testInput(mode, 'branch-ternary-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const show = useSignal(false);
  return <div>{show.value ? <b>on</b> : <i>off</i>}</div>;
};
`,
    });
  });

  test('should render a logical-and branch on a signal', async () => {
    await testInput(mode, 'branch-logical-and-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const show = useSignal(false);
  return <div>{show.value && <span>yes</span>}</div>;
};
`,
    });
  });

  test('should drop a null else arm like a logical-and branch', async () => {
    await testInput(mode, 'branch-else-null', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const show = useSignal(false);
  return <div>{show.value ? <b>on</b> : null}</div>;
};
`,
    });
  });

  test('should keep an empty then program for a null then arm', async () => {
    await testInput(mode, 'branch-then-null', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const show = useSignal(false);
  return <div>{show.value ? null : <i>off</i>}</div>;
};
`,
    });
  });

  test('should render a signal text hole inside a branch arm', async () => {
    await testInput(mode, 'branch-arm-signal-text', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const show = useSignal(false);
  const count = useSignal(0);
  return <div>{show.value ? <b>{count.value}</b> : null}</div>;
};
`,
    });
  });

  test('should render a props text hole inside a branch arm', async () => {
    await testInput(mode, 'branch-arm-props-text', {
      code: `export default (props) => {
  return <div>{props.enabled ? <b>{props.label}</b> : null}</div>;
};
`,
    });
  });

  test('should render an expression arm of a logical-and branch', async () => {
    await testInput(mode, 'branch-arm-expression', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>;
};
`,
    });
  });

  test('should decompose a concat into static text and a stringify signal hole', async () => {
    await testInput(mode, 'text-hole-concat', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>{'Count: ' + count.value}</p>;
};
`,
    });
  });

  test('should render a keyed collection with a static item', async () => {
    await testInput(mode, 'collection-static-item', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>Item</li>)}</ul>;
};
`,
    });
  });

  test('should render a reactive text hole inside a collection row', async () => {
    await testInput(mode, 'collection-reactive-row', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
};
`,
    });
  });

  test('should wire a row event handler capturing the loop item', async () => {
    await testInput(mode, 'collection-row-event', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a' }]);
  return (
    <ul>
      {items.value.map((item) => (
        <li key={item.id}>
          <button onClick$={() => console.log(item.id)}>x</button>
        </li>
      ))}
    </ul>
  );
};
`,
    });
  });

  test('should give a capture-less row handler the plain ctx signature', async () => {
    await testInput(mode, 'collection-row-event-plain', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a' }]);
  return (
    <ul>
      {items.value.map((item) => (
        <li key={item.id}>
          <button onClick$={() => console.log(1)}>x</button>
        </li>
      ))}
    </ul>
  );
};
`,
    });
  });

  test('should render a literal array collection with an inline row', async () => {
    await testInput(mode, 'collection-array-source', {
      code: `export default () => {
  return <ul>{['first', 'second'].map(() => <li>Item</li>)}</ul>;
};
`,
    });
  });

  test('should renumber rows through a reactive index param', async () => {
    await testInput(mode, 'collection-index-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map((item, index) => <li key={item.id}>{index}</li>)}</ul>;
};
`,
    });
  });

  test('should wrap a fragment row in a comment marker range', async () => {
    await testInput(mode, 'collection-fragment-row', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <>{item.label}<b>!</b></>)}</ul>;
};
`,
    });
  });

  test('should wrap a text-only fragment row in a comment marker range', async () => {
    await testInput(mode, 'collection-text-row', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <>{item.label}</>)}</ul>;
};
`,
    });
  });

  test('should interpolate lexical loop params in an inline array row', async () => {
    await testInput(mode, 'collection-array-index', {
      code: `export default () => {
  return <ul>{['first', 'second'].map((item, index) => <li>{index}:{item}</li>)}</ul>;
};
`,
    });
  });

  test('should reconcile an unkeyed reactive collection by position', async () => {
    await testInput(mode, 'collection-unkeyed', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <li>{item.label}</li>)}</ul>;
};
`,
    });
  });

  test('should destructure the row param into member reads', async () => {
    await testInput(mode, 'collection-destructured-param', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map(({ id, label }) => <li key={id}>{label}</li>)}</ul>;
};
`,
    });
  });

  test('should rewrite destructured names inside an opaque row expression', async () => {
    await testInput(mode, 'collection-destructured-opaque', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map(({ id, label }) => <li key={id}>{label + '!' + id}</li>)}</ul>;
};
`,
    });
  });

  test('should bind a dynamic class on a collection row root', async () => {
    await testInput(mode, 'collection-row-dynamic-class', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([{ id: 'a', label: 'Alpha', done: false }]);
  return <ul>{items.value.map((item) => <li key={item.id} class={item.done ? 'done' : 'todo'}>{item.label}</li>)}</ul>;
};
`,
    });
  });

  test('should render a reactive expression inside an inline array row', async () => {
    await testInput(mode, 'collection-inline-signal-text', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <ul>{['a', 'b'].map((item) => <li>{item + count.value}</li>)}</ul>;
};
`,
    });
  });

  test('should render a props read inside an inline array row', async () => {
    await testInput(mode, 'collection-inline-props-text', {
      code: `export default (props) => {
  return <ul>{['a', 'b'].map((item) => <li>{props.title + item}</li>)}</ul>;
};
`,
    });
  });

  test('should splice a module const inside an inline array row', async () => {
    await testInput(mode, 'collection-inline-module-const', {
      code: `const prefix = 'p-';
export default () => {
  return <ul>{['a', 'b'].map((item) => <li>{prefix + item}</li>)}</ul>;
};
`,
    });
  });

  test('should render an expression hole capturing a signal', async () => {
    await testInput(mode, 'expression-hole-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <p>{count.value + 1}</p>;
};
`,
    });
  });

  test('should render an expression hole capturing a signal and props', async () => {
    await testInput(mode, 'expression-hole-signal-props', {
      code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(0);
  return <p>{count.value + props.step}</p>;
};
`,
    });
  });

  test('should render a hole inside a nested element', async () => {
    await testInput(mode, 'nested-element-hole', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return <div><span>{count.value}</span></div>;
};
`,
    });
  });

  test('should render a sibling hole inside a nested element behind a static sibling', async () => {
    await testInput(mode, 'nested-element-hole-path', {
      code: `export default (props) => {
  return <div><b>bold</b><span>a{props.title}b</span></div>;
};
`,
    });
  });

  test('should render multiple signal-read text holes with sibling children', async () => {
    await testInput(mode, 'text-hole-multi-siblings-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  const name = useSignal('Qwik');
  return <p>{name.value} count: {count.value}!</p>;
};
`,
    });
  });

  test('should render a local component call', async () => {
    await testInput(mode, 'component-call-local', {
      code: `export const Child = () => <strong>child</strong>;
export default () => <Child />;
`,
    });
  });

  test('should pass static and signal props to a component', async () => {
    await testInput(mode, 'component-props', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <strong>{props.className}: {props.count}</strong>;
export default () => {
  const count = useSignal(1);
  return <Child className="total" count={count.value} />;
};
`,
    });
  });

  test('should pass a computed signal prop to a component', async () => {
    await testInput(mode, 'component-computed-prop', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <strong>{props.total}</strong>;
export default () => {
  const count = useSignal(2);
  return <Child total={count.value * 2} />;
};
`,
    });
  });

  test('should merge component prop spreads in authored order', async () => {
    await testInput(mode, 'component-props-spread', {
      code: `export const Child = (props) => <strong>{props.label}</strong>;
export default (props) => (
  <Child label="before" {...props.base} middle="middle" {...props.overrides} label="after" />
);
`,
    });
  });

  test('should proxy a reactive component prop spread', async () => {
    await testInput(mode, 'component-props-reactive-spread', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <strong>{props.label}</strong>;
export default () => {
  const attributes = useSignal({ label: 'first' });
  return <Child {...attributes.value} />;
};
`,
    });
  });

  test('should proxy mixed reactive component props in authored order', async () => {
    await testInput(mode, 'component-props-reactive-spread-mixed', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <strong>{props.title}: {props.count}</strong>;
export default () => {
  const count = useSignal(1);
  const attributes = useSignal({ title: 'spread' });
  return <Child title="before" {...attributes.value} count={count.value} title="after" />;
};
`,
    });
  });

  test('should keep event props lazy inside a reactive component props proxy', async () => {
    await testInput(mode, 'component-props-reactive-spread-event', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <button onClick$={props.onSave$}>{props.title}</button>;
export default () => {
  const count = useSignal(0);
  const attributes = useSignal({ title: 'save' });
  return <Child {...attributes.value} onSave$={() => count.value++} />;
};
`,
    });
  });

  test('should ignore empty event attributes', async () => {
    await testInput(mode, 'empty-event-attributes', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <button onClick$>{props.title}</button>;
export default () => {
  const attributes = useSignal({ title: 'save' });
  return <Child {...attributes.value} onSave$ />;
};
`,
    });
  });

  test('should forward an event prop through a component', async () => {
    await testInput(mode, 'component-event-prop', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <button onClick$={props.onSave$}>save</button>;
export default () => {
  const count = useSignal(0);
  return <Child onSave$={() => count.value++} on-save$={() => count.value--} />;
};
`,
    });
  });

  test('should render an aliased component imported from another module', async () => {
    await testInputs(mode, 'component-call-import', [
      {
        path: 'src/app.tsx',
        code: `import { Child as RenamedChild } from './child';
export default () => <main><RenamedChild /></main>;
`,
      },
      {
        path: 'src/child.tsx',
        code: `export const Child = () => <strong>child</strong>;
`,
      },
    ]);
  });
});

describe('pending slices', () => {
  test.todo('static markup and elements (declaration kinds, attributes, void tags, JSX text)');
  test.todo('JSX in a call argument lowers as an embedded function render');
  test.todo('JSX outside any candidate rejects with unsupported-runtime-jsx');
  test.todo('dynamic props, holes, events, bind, refs');
  test.todo('projections and slots');
  test.todo('branches (incl. build-constant conditions and residual isDev)');
  test.todo('collections (array/reactive/derived, inline and chunk rows)');
  test.todo('suspense, reveal, dynamic slots');
  test.todo('styles, context, custom hooks, tasks');
  test.todo('natives-as-JS, library mode');
  test.todo('incomplete link during per-module transform matches legacy conservative output');
  test.todo('complete link at generateBundle produces the artifact');
  test.todo('recognition parity — segment/marker/id/subscription counts per mode');
  test.todo('constants sweep across every payload carrier');
  test.todo('generateRustSsr shared should-generate corpus');
  test.todo('generateRustSsr should-reject corpus (unsupported-variant error arms)');
});
