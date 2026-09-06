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

  test('should emit block event handlers through the shared QRL emitter', async () => {
    const output = await testInput(mode, 'event-block-body', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default () => {
  const count = useSignal(0);
  return <Button onSave$={() => {
    const next = count.value + 1;
    if (next > 10) return;
    count.value = next;
  }} />;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should preserve event parameter patterns and captured defaults', async () => {
    await testInput(mode, 'event-parameter-patterns', {
      code: `export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default () => {
  const fallback = 'click';
  return <Button
    onSave$={({ type = fallback } = {}, ...rest) => [type, rest.length]}
    onReset$={([first, ...rest], { id = 'button' }) => [first, rest, id]}
  />;
};`,
    });
  });

  test('should capture component props in event bodies and defaults', async () => {
    await testInput(mode, 'event-props-captures', {
      code: `export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default (input) => {
  const suffix = '!';
  return <main>
    <button onClick$={() => input.onSave$(input.id + suffix)}>save</button>
    <Button onSave$={({ value = input.initial } = {}) => input.onSave$(value)} />
  </main>;
};`,
    });
  });

  test('should lower component const setup with hook and event captures', async () => {
    const output = await testInput(mode, 'component-const-setup', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Card = (props) => {
  const { title = 'Untitled', ...rest } = props;
  const label = title.toUpperCase(), suffix = rest.suffix;
  const count = useSignal(props.start), initial = count.value;
  return <button onClick$={() => console.log(count.value++, label)}>
    {label + suffix + initial}:{count.value}
  </button>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
    const event = output.modules.find((module) => module.segment?.ctxName === 'onClick$');
    expect(event?.segment?.captureNames).toEqual(['count', 'label']);
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
    const output = await testInput(mode, 'component-call-local', {
      code: `export const Child = () => <strong>child</strong>;
export default () => <Child />;
`,
    });
    expect(output.modules[0].code).toContain('createComponent(Child, null, ctx)');
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

  test('should project component children through props.children', async () => {
    await testInput(mode, 'component-children-props', {
      code: `export const Wrapper = (props) => <section>{props.children}</section>;
export default () => <Wrapper><p>Projected</p></Wrapper>;
`,
    });
  });

  test('should project component children through a destructured prop', async () => {
    await testInput(mode, 'component-children-destructured', {
      code: `export const Wrapper = ({ children }) => <section>{children}</section>;
export default () => <Wrapper><p>Projected</p></Wrapper>;
`,
    });
  });

  test('should project component children through the Slot marker', async () => {
    await testInput(mode, 'component-children-slot', {
      code: `import { Slot } from '@qwik.dev/core';
export const Wrapper = () => <section><Slot /></section>;
export default () => <Wrapper><p>Projected</p></Wrapper>;
`,
    });
  });

  test('should capture signals used by projected component children', async () => {
    await testInput(mode, 'component-children-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Wrapper = (props) => <section>{props.children}</section>;
export default () => {
  const count = useSignal(1);
  return <Wrapper><p>{count.value}</p></Wrapper>;
};
`,
    });
  });

  test('should project component children through static named slots', async () => {
    await testInput(mode, 'component-children-named-slot', {
      code: `import { Slot } from '@qwik.dev/core';
export const Card = () => <article><header><Slot name="header" /></header><Slot /></article>;
export default () => <Card><h1 q:slot="header">Title</h1><p>Content</p></Card>;
`,
    });
  });

  test('should project nested fragments into default and named slots', async () => {
    const code = `import { Slot, useSignal } from '@qwik.dev/core';
export const Card = () => <article><header><Slot name="header" /></header><Slot /></article>;
export default () => {
  const count = useSignal(1);
  return <Card><><h1 q:slot="header">Title</h1><>{/* comment */}<p>Count:<> </>{count.value}<i /><b /><em /></p></></></Card>;
};
`;
    const flattened = await transformModules({
      srcDir: 'src',
      transpileTs: true,
      transpileJsx: true,
      isServer: mode === 'ssr',
      input: [{ path: 'src/component.tsx', code: code.replaceAll('<>', '').replaceAll('</>', '') }],
    });
    const output = await testInput(mode, 'component-children-fragments', { code });
    expect(output.modules.map((module) => module.code)).toEqual(
      flattened.modules.map((module) => module.code)
    );
  });

  test('should project mapped rows into static named slots', async () => {
    const output = await testInput(mode, 'component-children-mapped-slots', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot name="footer" /><Slot /></main>;
export default () => {
  const items = useSignal([{ id: 1, title: 'Title' }]);
  return <Panel>{items.value.map((item) => <h2 key={item.id} q:slot="header">{item.title}</h2>)}{['End'].map((label) => <p q:slot="footer">{label}</p>)}{items.value.map((item) => <section key={item.id}><span q:slot="nested">{item.title}</span></section>)}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    if (mode === 'csr') {
      const projections = output.modules.filter(
        (module) => module.segment?.ctxName === 'slot:render'
      );
      expect(projections).toHaveLength(3);
      for (const projection of projections) {
        expect(projection.code).toContain('return [...fragment0.childNodes];');
      }
    }
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title', description: 'Body' }]"],
  ])('should split mapped fragments into slots: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-fragments-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default () => {
  const items = useSignal([{ title: 'Title', description: 'Body' }]);
  return <Panel>{${source}.map((item) => <><h2 q:slot="header">{item.title}</h2><><b q:slot="header">!</b><p>{item.description}</p></></>)}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title', featured: true, visible: false }]"],
  ])('should project conditional mapped rows: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-conditions-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default () => {
  const items = useSignal([{ title: 'Title', featured: true, visible: false }]);
  return <Panel>{${source}.map(({ title, featured, visible }, index) => featured && index === 0 ? <h2 q:slot="header">{index}:{title}</h2> : visible && <p>{title}</p>)}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title' }]"],
  ])('should project rows with a single return block: %s', async (kind, source) => {
    const row = '<h2 q:slot="header">{title}</h2>';
    const callback = `({ title }) => { /* row */ return (${row}); }`;
    const code = `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /></main>;
export default () => {
  const items = useSignal([{ title: 'Title' }]);
  return <Panel>{${source}.map(${callback})}</Panel>;
};
`;
    const output = await testInput(mode, `component-children-mapped-return-${kind}`, { code });
    expect(output.diagnostics).toEqual([]);
    if (kind === 'reactive') {
      const concise = await transformModules({
        srcDir: 'src',
        transpileTs: true,
        transpileJsx: true,
        isServer: mode === 'ssr',
        input: [
          { path: 'src/component.tsx', code: code.replace(callback, `({ title }) => ${row}`) },
        ],
      });
      expect(output.modules.map((module) => module.code)).toEqual(
        concise.modules.map((module) => module.code)
      );
    }
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ title: 'Title' }]"],
  ])('should preserve local consts in mapped projections: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-const-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /></main>;
export default () => {
  const suffix = useSignal('!');
  const items = useSignal([{ title: 'Title' }]);
  return <Panel>{${source}.map(({ title }, index) => {
    const label = title.toUpperCase() + suffix.value;
    const numbered = index + ':' + label, visible = label.length > 0;
    return visible && <h2 q:slot="header" title={numbered} onClick$={() => console.log(label)}>{label}:{numbered}</h2>;
  })}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['reactive', 'items.value'],
    ['array', "[{ details: { parts: ['First', 'Skip', 'Last'] }, fallback: 'Title' }]"],
  ])('should destructure local consts in mapped projections: %s', async (kind, source) => {
    const output = await testInput(mode, `component-children-mapped-destructure-${kind}`, {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /></main>;
export default () => {
  const suffix = useSignal('!');
  const items = useSignal([{ details: { parts: ['First', 'Skip', 'Last'] }, fallback: 'Title' }]);
  return <Panel>{${source}.map(({ details, fallback }, index) => {
    const { title: label = fallback, copy = label, [index]: position = suffix.value, ...rest } = details;
    const [first = copy, , ...tail] = rest.parts;
    return <h2 q:slot="header" onClick$={() => console.log(label, first, tail)}>{label}:{first}:{position}:{tail.length}</h2>;
  })}</Panel>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['props', 'props.items', '(item)', 'item.title'],
    [
      'filtered',
      'items.value.filter((item) => item.visible)',
      '(item, index)',
      'index + item.title',
    ],
  ])('should render expression collection sources: %s', async (kind, source, params, text) => {
    const output = await testInput(mode, `collection-source-${kind}`, {
      code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([{ id: 1, title: 'Title', visible: true }]);
  return <ul>{${source}.map(${params} => <li key={item.id}>{${text}}</li>)}</ul>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['object', '{ id, details: { title = fallback.value }, ...rest }', 'title + rest.suffix'],
    ['array', '[id, , title = fallback.value, ...rest]', 'title + rest.length'],
  ])('should destructure collection parameters: %s', async (kind, pattern, text) => {
    const output = await testInput(mode, `collection-param-${kind}`, {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([]);
  const fallback = useSignal('Untitled');
  return <ul>{items.value.map((${pattern}) => <li key={id} onClick$={() => console.log(title)}>{${text}}</li>)}</ul>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['identifier', 'item = fallback.value', 'item.id', 'item.title'],
    ['object', '{ id, title } = fallback.value', 'id', 'title'],
    ['array', '[id, title] = fallback.value', 'id', 'title'],
  ])('should default collection parameters: %s', async (kind, pattern, key, title) => {
    const output = await testInput(mode, `collection-param-default-${kind}`, {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([]);
  const fallback = useSignal(null);
  return <ul>{items.value.map((${pattern}) => <li key={${key}} onClick$={() => console.log(${title})}>{${title}}</li>)}</ul>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each(['items.value', 'props.items'])(
    'should key both conditional collection arms: %s',
    async (source) => {
      const output = await testInput(
        mode,
        source === 'items.value'
          ? 'collection-key-conditional-reactive'
          : 'collection-key-conditional-derived',
        {
          code: `import { useSignal } from '@qwik.dev/core';
export const Done = (props) => <b>{props.title}</b>;
export default (props) => {
  const items = useSignal([]);
  const selected = useSignal(true);
  return <ul>{${source}.map(({ id, done }, index) => {
    const visible = done && selected.value;
    const prefix = props.prefix;
    const title = props.title;
    return visible
      ? <Done key={prefix + id} title={title} />
      : <li key={index + ':' + id}>{title}</li>;
  })}</ul>;
};`,
        }
      );
      expect(output.diagnostics).toEqual([]);
    }
  );

  test('should keep collection keys independent of empty arms', async () => {
    const output = await testInput(mode, 'collection-key-empty-arms', {
      code: `export default (props) => <ul>{props.items.map(({ id, primary }, index) => {
  const visible = props.visible;
  const key = props.prefix + id;
  return primary
    ? (visible ? <li key={key}>{id}</li> : null)
    : visible && <li key={index}>{id}</li>;
})}</ul>;`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should key nested conditional collection arms', async () => {
    const output = await testInput(mode, 'collection-key-nested-conditional', {
      code: `export const Primary = () => <b>Primary</b>;
export default (props) => <ul>{props.items.map(({ id, primary, secondary }, index) => {
  const prefix = props.prefix;
  const key = prefix + id;
  return primary ? <Primary key={key} /> : (
    secondary ? <li key={id}>Secondary</li> : <li key={index}>Other</li>
  );
})}</ul>;`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should select collection key setup by binding dependencies', async () => {
    const output = await testInput(mode, 'collection-key-const', {
      code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([]);
  const separator = useSignal(':');
  return <ul>{items.value.map(({ id, type }, index) => {
    const prefix = type + separator.value, title = props.title;
    const key = prefix + id + index;
    return <li key={key}>{title}</li>;
  })}</ul>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should forward slots and render fallback through fragments', async () => {
    const output = await testInput(mode, 'component-slot-forwarding-fragments', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot name="title" /></article>;
export const Wrapper = () => <Inner>{(<><Slot name="heading" q:slot="title"><><h2>Fallback</h2></></Slot></>)}</Inner>;
export default () => <main><Wrapper><><h1 q:slot="heading">Provided</h1></></Wrapper><Wrapper><>{/* empty */}<></></></Wrapper></main>;
`,
    });
    expect(output.modules).toHaveLength(3);
  });

  test('should switch component children through a dynamic slot name', async () => {
    await testInput(mode, 'component-children-dynamic-slot', {
      code: `import { Slot } from '@qwik.dev/core';
export const Switch = (props) => <Slot name={props.name} />;
export default (props) => <Switch name={props.pick}><i q:slot="a">Alpha</i><b q:slot="b">Bravo</b></Switch>;
`,
    });
  });

  test('should project a conditional child into its statically named slot', async () => {
    await testInput(mode, 'component-children-conditional-slot', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="start" /><Slot /></main>;
export default () => {
  const show = useSignal(true);
  return <Panel>{show.value && <span q:slot="start">start</span>}</Panel>;
};
`,
    });
  });

  test('should split a conditional child across its statically named slots', async () => {
    await testInput(mode, 'component-children-conditional-slot-split', {
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="x" /><Slot name="y" /></main>;
export default () => {
  const flip = useSignal(false);
  return <Panel>{flip.value ? <a q:slot="x">alpha</a> : <b q:slot="y">bravo</b>}</Panel>;
};
`,
    });
  });

  test('should render a slot fallback only without a projection', async () => {
    await testInput(mode, 'component-slot-fallback', {
      code: `import { Slot } from '@qwik.dev/core';
export const Card = () => <section><Slot><p>Empty</p></Slot></section>;
export default () => <main><Card /><Card><p>Projected</p></Card></main>;
`,
    });
  });

  test('should split nested conditional fragments into named and default projections', async () => {
    await testInput(mode, 'component-children-nested-conditional-fragments', {
      code: `import { Slot } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default (props) => <Panel>{props.show ? <><h1 q:slot="header">Title</h1>{props.details && <><p>Details</p><p>More</p></>}</> : null}</Panel>;
`,
    });
  });

  test('should forward a projection through a nested slot', async () => {
    const output = await testInput(mode, 'component-slot-forwarding', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot /></article>;
export const Wrapper = () => <Inner><Slot /></Inner>;
export default () => <Wrapper><p>Forwarded</p></Wrapper>;
`,
    });
    expect(output.modules).toHaveLength(2);
  });

  test('should forward a named projection under a different name', async () => {
    const output = await testInput(mode, 'component-slot-forwarding-named', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot name="title" /></article>;
export const Wrapper = () => <Inner><Slot name="heading" q:slot="title" /></Inner>;
export default () => <Wrapper><h1 q:slot="heading">Hello</h1></Wrapper>;
`,
    });
    expect(output.modules).toHaveLength(2);
  });

  test('should use a fallback when a forwarded named projection is absent', async () => {
    const output = await testInput(mode, 'component-slot-forwarding-fallback', {
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <article><Slot name="title" /></article>;
export const Wrapper = () => <Inner><Slot name="heading" q:slot="title"><h2>Fallback</h2></Slot></Inner>;
export default () => <main><Wrapper><h1 q:slot="heading">Provided</h1></Wrapper><Wrapper /></main>;
`,
    });
    expect(output.modules).toHaveLength(3);
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

test('csr replaces an embedded component marker in place', async () => {
  await testInput('csr', 'component-call-siblings', {
    code: `export const Child = () => <strong>child</strong>;
export default () => <main><span>before</span><Child /><span>after</span></main>;
`,
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
  test.todo('suspense, reveal, dynamic q:slot names');
  test.todo('styles, context, custom hooks, tasks');
  test.todo('natives-as-JS, library mode');
  test.todo('incomplete link during per-module transform matches legacy conservative output');
  test.todo('complete link at generateBundle produces the artifact');
  test.todo('recognition parity — segment/marker/id/subscription counts per mode');
  test.todo('constants sweep across every payload carrier');
  test.todo('generateRustSsr shared should-generate corpus');
  test.todo('generateRustSsr should-reject corpus (unsupported-variant error arms)');
});
