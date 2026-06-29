import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import { format as formatCode } from 'prettier';
import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';

interface TestInput {
  code: string;
  path?: string;
}

const baseOptions = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

async function testInput(snapshotName: string, input: TestInput) {
  const moduleInput = {
    path: input.path ?? 'src/component.tsx',
    code: input.code,
  };
  const ssr = await transformModules(baseOptions(moduleInput, true));
  const csr = await transformModules(baseOptions(moduleInput, false));
  await expect(await snapshotResult(input.code, { ssr, csr })).toMatchFileSnapshot(
    `./snapshots/${snapshotName}.snap`
  );
  return { ssr, csr };
}

async function snapshotResult(
  code: string,
  result: { ssr: TransformOutput; csr: TransformOutput }
) {
  let output = `==INPUT==\n\n${code}`;

  output += await snapshotTransformOutput('SSR', result.ssr);
  output += await snapshotTransformOutput('CSR', result.csr);
  return output;
}

async function snapshotTransformOutput(label: string, result: TransformOutput) {
  let output = `\n== ${label} OUTPUT ==\n`;

  for (const module of result.modules) {
    const isEntry = module.isEntry ? '(ENTRY POINT)' : '';
    const code = await formatSnapshotCode(module.code);
    output += `\n============================= ${module.path} ${isEntry}==\n\n${code}\n\n${module.map}`;
    if (module.segment) {
      output += `\n/*\n${JSON.stringify(module.segment, null, 2)}\n*/`;
    }
  }

  output += `\n== ${label} DIAGNOSTICS ==\n\n${JSON.stringify(result.diagnostics, null, 2)}`;
  return output;
}

async function formatSnapshotCode(code: string) {
  if (!code.trim()) {
    return code;
  }
  try {
    return (
      await formatCode(code, {
        parser: 'babel',
        printWidth: 100,
        singleQuote: true,
        trailingComma: 'es5',
      })
    ).trimEnd();
  } catch {
    return code;
  }
}

describe('transformModules', () => {
  test('emits a static SSR renderer from an exported function component', async () => {
    await testInput('static_function', {
      code: `export function App() {
  return <main className="shell" hidden={true}><h1>Hello</h1><p>Qwik</p></main>;
}
`,
    });
  });

  test('emits a static CSR DOM renderer from an exported arrow component', async () => {
    await testInput('static_arrow_fragment', {
      code: `export const App = () => (
  <>
    <h1>Hello</h1>
    <p className="copy">Qwik</p>
  </>
);
`,
    });
  });

  test('emits scalar CSR output from a single-child fragment', async () => {
    await testInput('static_single_child_fragment', {
      code: `export const App = () => (
  <>
    <span>One</span>
  </>
);
`,
    });
  });

  test('strips TypeScript syntax from generated component setup', async () => {
    await testInput('typescript_setup', {
      code: `import { createContextId } from '@qwik.dev/core';
import { createContextProvider, createSignal, type Signal } from '@qwik.dev/core/spark';

export const App = () => {
  const contextId = createContextId<Signal<string>>('context');
  const source: Signal<string> = createSignal('hello');
  createContextProvider(contextId, source);
  return <p>{source.value}</p>;
};
`,
    });
  });

  test('discovers default function components', async () => {
    await testInput('default_function', {
      code: `export default function App() {
  return <section>Default function</section>;
}
`,
    });
  });

  test('discovers default arrow components', async () => {
    await testInput('default_arrow', {
      code: `export default () => <section>Default arrow</section>;`,
    });
  });

  test('unwraps component$ components', async () => {
    await testInput('component_dollar', {
      code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div>Hello</div>);
export default component$(function Home() {
  return <section>Default wrapped</section>;
});
`,
    });
  });

  test('inlines useId calls', async () => {
    await testInput('use_id', {
      path: 'src/use-id.tsx',
      code: `import { useId } from '@qwik.dev/core';

export function App() {
  const id = useId();
  return <label for={id}>Name</label>;
}
`,
    });
  });

  test('passes useId seed to child components', async () => {
    await testInput('use_id_child_component', {
      path: 'src/use-id-child.tsx',
      code: `import { useId } from '@qwik.dev/core';

export function Child() {
  useId();
  return <span />;
}

export function App() {
  return <Child />;
}
`,
    });
  });

  test('extracts event handlers into QRL-style modules', async () => {
    await testInput('event_handler_qrl', {
      code: `export function App() {
  return <button onClick$={(ev) => console.log(ev.type)}>Click</button>;
}
`,
    });
  });

  test('uses _captures for extracted event lexical scope', async () => {
    await testInput('event_handler_captures', {
      code: `import { createSignal } from "@qwik.dev/core";
export function App() {
  const count = createSignal(1);
  return <button onClick$={() => count.value++}>Count</button>;
}
`,
    });
  });

  test('imports module-level helpers into extracted events', async () => {
    await testInput('event_handler_module_helpers', {
      code: `function buildData(count: number) {
  return Array.from({ length: count }, (_, i) => i);
}

export function App() {
  const rows = { value: [] as number[] };
  return <button onClick$={() => (rows.value = buildData(3))}>Create</button>;
}
`,
    });
  });

  test('extracts multiple event names and scopes', async () => {
    await testInput('event_handler_scopes', {
      code: `export function App() {
  return <div onClick$={() => 1} onDblClick$={() => 2} window:onScroll$={() => 3} document:onKeyDown$={() => 4} />;
}
`,
    });
  });

  test('emits createOn with explicit qrl handler', async () => {
    await testInput('create_on_explicit_qrl', {
      code: `import { $ } from '@qwik.dev/core';
import { createOn, createOnDocument, createSignal } from '@qwik.dev/core/spark';

export function App() {
  const count = createSignal(0);
  createOn('click', $(() => count.value++));
  createOnDocument('qinit', $(() => count.value += 2), { capture: true, preventdefault: true });
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('supports SSR and CSR dynamic text', async () => {
    await testInput('dynamic_signal_text', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return <p>{count.value}</p>;
}
`,
    });
  });

  test('emits SSR range text for mixed dynamic text', async () => {
    await testInput('ssr_dynamic_range_text', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return <p>Hello {count.value}</p>;
}
`,
    });
  });

  test('preserves multiline text spacing before dynamic text', async () => {
    await testInput('ssr_dynamic_range_text_multiline_spacing', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return (
    <p>
      Count: {count.value}
    </p>
  );
}
`,
    });
  });

  test('emits SSR range text boundaries before static text', async () => {
    await testInput('ssr_dynamic_range_text_boundary', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return <p>Hello {count.value} world</p>;
}
`,
    });
  });

  test('emits local marker indexes for multiple SSR range texts', async () => {
    await testInput('ssr_dynamic_range_text_multiple', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const first = createSignal(1);
  const second = createSignal(2);
  return <p>{first.value}{second.value}</p>;
}
`,
    });
  });

  test('emits SSR text expression QRLs', async () => {
    await testInput('ssr_dynamic_text_expression', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(1);
  return <p>{count.value + 1}</p>;
}
`,
    });
  });

  test('emits SSR dynamic attrs', async () => {
    await testInput('ssr_dynamic_attrs', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const title = createSignal('hello');
  const classes = createSignal('active');
  const style = createSignal('color:red');
  return <div title={title.value} className={classes.value} style={style.value}>Attrs</div>;
}
`,
    });
  });

  test('emits dynamic DOM attrs through attr expression QRLs', async () => {
    await testInput('dynamic_dom_attrs_props_qrl', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return (
    <div
      title={\`count \${count.value}\`}
      className={{ active: count.value > 0 }}
      style={{ color: count.value % 2 === 0 ? 'green' : 'blue' }}
      data-kind="counter"
    >
      Attrs
    </div>
  );
}
`,
    });
  });

  test('hoists SSR dynamic attrs before async child output', async () => {
    await testInput('dynamic_dom_attrs_after_component', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
function Child() {
  return <span>Child</span>;
}
export function App() {
  const count = createSignal(0);
  return (
    <main>
      <Child />
      <p style={{ color: count.value > 5 ? 'red' : 'blue' }}>After</p>
    </main>
  );
}
`,
    });
  });

  test('emits DOM spread props with override order', async () => {
    await testInput('dom_spread_props', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const attrs = createSignal({
    title: 'from-spread',
    children: 'ignored',
    className: { active: true },
  });
  const title = createSignal('final');
  return <div {...attrs.value} title={title.value} onClick$={() => (title.value = 'clicked')} data-id="static">Child</div>;
}
`,
    });
  });

  test('emits component spread rest props and event pass-through', async () => {
    await testInput('component_spread_rest_props', {
      code: `export function Button({ kind, ...rest }: { kind: string; title: string; onClick$?: unknown }) {
  return <button {...rest} data-kind={kind}>Click</button>;
}

export function Parent() {
  const attrs = { title: 'Save' };
  const label = 'clicked';
  return <Button {...attrs} kind="primary" onClick$={() => label} />;
}
`,
    });
  });

  test('passes component event props through native events', async () => {
    await testInput('component_event_prop_passthrough', {
      code: `import type { QRL } from '@qwik.dev/core';

export function Button(props: { onClick$: QRL<() => any> }) {
  return <button onClick$={props.onClick$}>Click</button>;
}

export function Parent() {
  return <Button onClick$={() => 1} />;
}
`,
    });
  });

  test('emits SSR and CSR ternary branch renderers', async () => {
    await testInput('branch_ternary', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return (
    <section>
      {count.value % 2 === 0 ? (
        <p className="even">Even {count.value}</p>
      ) : (
        <button onClick$={() => count.value++}>Odd {count.value}</button>
      )}
    </section>
  );
}
`,
    });
  });

  test('emits SSR and CSR logical branch renderers', async () => {
    await testInput('branch_logical_and', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const visible = createSignal(true);
  const label = createSignal('ready');
  const attrs = createSignal({ role: 'status' });
  return <div>{visible.value && <span {...attrs.value} title={\`label \${label.value}\`}>{label.value + '!'}</span>}</div>;
}
`,
    });
  });

  test('emits dynamic text inside logical branch renderers', async () => {
    await testInput('branch_logical_and_dynamic_text', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(0);
  return <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>;
}
`,
    });
  });

  test('imports local child components inside branch renderers', async () => {
    await testInput('branch_local_components', {
      code: `import { createSignal } from '@qwik.dev/core/spark';

function Counter({ count }: { count: number }) {
  return <p>Count: {count}</p>;
}

function Hello({ name }: { name: string }) {
  return <p>Hello, {name}!</p>;
}

export function App() {
  const count = createSignal(0);
  return <section>{count.value < 2 ? <Hello name="Qwik" /> : <Counter count={count.value} />}</section>;
}
`,
    });
  });

  test('folds literal branches', async () => {
    await testInput('branch_literal_fold', {
      code: `export function App() {
  return (
    <section>
      {false && <p>Hidden</p>}
      {true ? <span>Shown</span> : <em>Hidden</em>}
      {null ? <b>Never</b> : null}
    </section>
  );
}
`,
    });
  });

  test('supports keyed JSX loops', async () => {
    await testInput('jsx_loops_keyed', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const items = createSignal([{ id: 'a', label: 'Alpha', selected: true, attrs: { title: 'Alpha' } }]);
  return (
    <ul>
      {items.value.map((row, index) => (
        <li key={row.id} {...row.attrs}>
          <span data-index={index} className={{ active: row.selected }}>
            {row.label}
          </span>
          <button onClick$={() => (row.selected = !row.selected)}>Toggle</button>
        </li>
      ))}
    </ul>
  );
}
`,
    });
  });

  test('emits CSR templates for keyed table row loops', async () => {
    await testInput('jsx_loop_row_template', {
      code: `import { createSignal } from '@qwik.dev/core/spark';
export function App() {
  const rows = createSignal([{ id: 1, label: 'Alpha', selected: false }]);
  return (
    <table>
      <tbody>
        {rows.value.map((row) => (
          <tr key={row.id} className={{ danger: row.selected }}>
            <td className="col-md-1">{row.id}</td>
            <td className="col-md-4">
              <a onClick$={() => (row.selected = true)}>{row.label}</a>
            </td>
            <td className="col-md-1">
              <a>
                <span className="glyphicon glyphicon-remove" aria-hidden="true"></span>
              </a>
            </td>
            <td className="col-md-6"></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`,
    });
  });

  test('transforms implicit dollar calls in component setup', async () => {
    await testInput('implicit_dollar_setup', {
      code: `import { createSignal, createComputed$ } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(1);
  const double = createComputed$(() => count.value * 2);
  return <p>{double.value}</p>;
}
`,
    });
  });

  test('transforms serializer object literals in component setup', async () => {
    await testInput('serializer_object_setup', {
      code: `import { createSerializer$, createSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = createSignal(1);
  const custom = createSerializer$({
    initial: 2,
    deserialize: (value = 0) => ({ count: value + count.value }),
    serialize: (value) => value.count,
  });
  return <p>{custom.value.count}</p>;
}
`,
    });
  });

  test('emits nested child component renderers', async () => {
    await testInput('component_child_nested', {
      code: `export function Child() {
  return <span>Child</span>;
}

export function Parent() {
  return <section><Child /></section>;
}
`,
    });
  });

  test('passes literal and expression props to child components', async () => {
    await testInput('component_child_props', {
      code: `import { createSignal } from '@qwik.dev/core/spark';

export function Child(props: { label: string; count: number }) {
  return <p>{props.label}: {props.count}</p>;
}

export function Parent() {
  const count = createSignal(1);
  return <Child label="Hi" count={count.value} />;
}
`,
    });
  });

  test('passes child component children through props.children', async () => {
    await testInput('component_child_props_children', {
      code: `export function Wrapper(props: { children?: unknown }) {
  return <section>{props.children}</section>;
}

export function Parent() {
  return <Wrapper><p>Projected</p></Wrapper>;
}
`,
    });
  });

  test('projects default Slot children', async () => {
    await testInput('component_child_slot_default', {
      code: `import { Slot } from '@qwik.dev/core';

export function Wrapper() {
  return <section><Slot /></section>;
}

export function Parent() {
  return <Wrapper><p>Projected</p></Wrapper>;
}
`,
    });
  });

  test('projects named Slot children', async () => {
    await testInput('component_child_slot_named', {
      code: `import { Slot } from '@qwik.dev/core';

export function Wrapper() {
  return <section><header><Slot name="header" /></header><main><Slot /></main></section>;
}

export function Parent() {
  return <Wrapper><h1 q:slot="header">Title</h1><p>Body</p></Wrapper>;
}
`,
    });
  });

  test('inherits context across child component renderers', async () => {
    await testInput('component_child_context', {
      code: `import { createContext, createContextProvider, createSignal } from '@qwik.dev/core/spark';
import { Context } from './context';

export function Child() {
  const value = createContext(Context);
  return <p>{value.value}</p>;
}

export function Parent() {
  const value = createSignal('provided');
  createContextProvider(Context, value);
  return <section><Child /></section>;
}
`,
    });
  });

  test('emits task setup with async generator lowering', async () => {
    await testInput('task_async_generator', {
      code: `import { createSignal, createTask$, createVisibleTask$ } from '@qwik.dev/core/spark';

export function App() {
  const count = createSignal(0);
  createTask$(async ({ cleanup }) => {
    const before = count.value;
    await Promise.resolve();
    cleanup(async () => {
      await Promise.resolve(before);
    });
    count.value;
  });
  createVisibleTask$(async () => {
    await Promise.resolve();
    count.value;
  }, { strategy: 'document-ready' });
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('emits async signal setup with async generator lowering', async () => {
    await testInput('async_signal_generator', {
      code: `import { createAsync$, createSignal } from '@qwik.dev/core/spark';

export function App() {
  const count = createSignal(0);
  const data = createAsync$(async () => {
    const before = count.value;
    await Promise.resolve();
    return before + count.value;
  }, { initial: 0 });
  return <button>{data.value}</button>;
}
`,
    });
  });
});
