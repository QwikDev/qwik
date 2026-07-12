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
    output += `\n============================= ${module.path} ${isEntry}==\n\n${code}`;
    if (module.map) {
      output += `\n\n${module.map}`;
    }
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
  test('simple function component', async () => {
    await testInput('simple_function_component', {
      code: `export function App() {
  return <main>Qwik</main>;
}
`,
    });
  });

  test('simple const component', async () => {
    await testInput('simple_const_component', {
      code: `export const App = () => {
  return <main>Qwik</main>;
}
`,
    });
  });

  test('simple default function component', async () => {
    await testInput('simple_default_function_component', {
      code: `export default function App() {
  return <main>Qwik</main>;
}
`,
    });
  });

  test('component with signal', async () => {
    await testInput('component_with_signal', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
  export function App() {
      const count = useSignal(0);
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('component with renamed signal', async () => {
    await testInput('component_with_renamed_signal', {
      code: `import { useSignal as signal } from '@qwik.dev/core/spark';
  export function App() {
      const count = signal(0);
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('preserves an identifier props parameter', async () => {
    await testInput('component_props_identifier', {
      code: `export function App(input: { value: string }) {
  return <button onClick$={() => input.value}>Save</button>;
}
`,
    });
  });

  test('destructures an object props parameter', async () => {
    await testInput('component_props_destructured', {
      code: `export function App({ label: text, count = 0, ...rest } = { label: 'Save' }) {
  return <button onClick$={() => [text, count, rest]}>Save</button>;
}
`,
    });
  });

  test('renders an identifier props value as text', async () => {
    await testInput('component_props_text', {
      code: `export function App(props: { label: string }) {
  return <p>{props.label}</p>;
}
`,
    });
  });

  test('renders an identifier props value as an attribute', async () => {
    await testInput('component_props_attribute', {
      code: `export function App(props: { title: string }) {
  return <button title={props.title}>Save</button>;
}
`,
    });
  });

  test('passes an event prop to a native element', async () => {
    await testInput('component_props_event', {
      code: `import type { QRL } from '@qwik.dev/core';

export function App(props: { onClick$: QRL<() => void> }) {
  return <button onClick$={props.onClick$}>Save</button>;
}
`,
    });
  });

  test('spreads props onto a native element', async () => {
    await testInput('component_props_spread', {
      code: `export function App(props: { title: string; hidden: boolean }) {
  return <button {...props}>Save</button>;
}
`,
    });
  });

  test('spreads props returned by a call expression', async () => {
    await testInput('component_props_call_spread', {
      code: `export function App(props: { getAttrs: () => { title: string } }) {
  return <button {...props.getAttrs()}>Save</button>;
}
`,
    });
  });

  test('spreads props selected by conditional and logical expressions', async () => {
    await testInput('component_props_branch_spread', {
      code: `export function Conditional(props: { enabled: boolean; active: object; inactive: object }) {
  return <button {...(props.enabled ? props.active : props.inactive)}>Conditional</button>;
}

export function Logical(props: { attrs: object | null }) {
  return <button {...(props.attrs ?? {})}>Logical</button>;
}
`,
    });
  });

  test('preserves static attribute overrides around a spread', async () => {
    await testInput('component_props_spread_override', {
      code: `export function App(props: { title: string; hidden: boolean }) {
  return <button title="before" data-before="base" {...props} title="after" hidden={false} data-after="final">Save</button>;
}
`,
    });
  });

  test('preserves source order across multiple dynamic spreads', async () => {
    await testInput('component_props_multiple_spreads', {
      code: `export function App(props: { base: object; overrides: object }) {
  return <button title="before" {...props.base} hidden {...props.overrides} title="after">Save</button>;
}
`,
    });
  });

  test('spreads an object literal onto a native element', async () => {
    await testInput('component_object_spread', {
      code: `export function App() {
  return <button title="before" {...{ title: 'spread', hidden: true }} {...{ 'aria-disabled': false }} title="after" hidden={false}>Save</button>;
}
`,
    });
  });

  test('keeps a dynamic object literal spread reactive', async () => {
    await testInput('component_dynamic_object_spread', {
      code: `export function App(props: { title: string }) {
  return <button {...{ title: props.title }}>Save</button>;
}
`,
    });
  });

  test('renders a local member expression as text', async () => {
    await testInput('component_local_text', {
      code: `export function App() {
  const local = { value: 'Hello' };
  return <p>{local.value}</p>;
}
`,
    });
  });

  test('renders grouped text expressions', async () => {
    await testInput('component_text_expressions', {
      code: `export function App(props: { count: number; label: string; hidden: boolean }) {
  return <p>{props.count + 1} {\`Hello \${props.label}\`} {!props.hidden}</p>;
}
`,
    });
  });

  test('simple component with attributes', async () => {
    await testInput('simple_component_with_attributes', {
      code: `export function App() {
  return <main className="shell" hidden={true}></main>;
}
`,
    });
  });

  test('normalizes static and dynamic className attributes', async () => {
    await testInput('component_class_name', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const classes = useSignal('active');
  return <main className="shell"><button className={classes.value}>Toggle</button></main>;
}
`,
    });
  });

  test('ignores static and dynamic key attributes', async () => {
    await testInput('component_key_attribute', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const itemKey = useSignal('dynamic');
  return <main key="static"><button key={itemKey.value}>Button</button></main>;
}
`,
    });
  });

  test('serializes null and boolean attributes', async () => {
    await testInput('component_null_attribute', {
      code: `export function App() {
  return <main title={null} hidden={false} aria-hidden={false} aria-busy={true} draggable={false}>Qwik</main>;
}
`,
    });
  });

  test('simple component with nested elements', async () => {
    await testInput('simple_component_nested_elements', {
      code: `export function App() {
  return <main className="shell" hidden={true}><h1 aria-label="Hello">Hello</h1><p>Qwik</p></main>;
}
`,
    });
  });

  test('supports void elements', async () => {
    await testInput('component_void_elements', {
      code: `export function App() {
  return <main><input disabled /><br /><img src="/logo.png" alt="Qwik" /></main>;
}
`,
    });
  });

  test('simple component with fragment', async () => {
    await testInput('static_component_fragment', {
      code: `export const App = () => {
  return (
    <>
      <h1>Hello</h1>
      <>
        <p className="copy">Qwik</p>
      </>
    </>
  )
};
`,
    });
  });

  test('simple component with fragment and single child', async () => {
    await testInput('static_single_child_fragment', {
      code: `export const App = () => (
  <>
    <span>One</span>
  </>
);
`,
    });
  });

  test('component with signal as attribute', async () => {
    await testInput('component_with_signal_attribute', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
  export function App() {
      const count = useSignal(0);
  return <button test={count.value}>Click</button>;
}
`,
    });
  });

  test('component with context and signal', async () => {
    await testInput('component_with_context_and_signal', {
      code: `import { createContextId } from '@qwik.dev/core/spark';
import { useContextProvider, useSignal, type Signal } from '@qwik.dev/core/spark';

export const App = () => {
  const contextId = createContextId<Signal<string>>('context');
  const source: Signal<string> = useSignal('hello');
  useContextProvider(contextId, source);
  return <p>{source.value}</p>;
};
`,
    });
  });

  test('component with multiple context providers', async () => {
    await testInput('component_with_multiple_context_providers', {
      code: `import { createContextId, useContextProvider } from '@qwik.dev/core/spark';

export function App() {
  const firstContext = createContextId<string>('first');
  const secondContext = createContextId<number>('second');
  useContextProvider(firstContext, 'one');
  useContextProvider(secondContext, 2);
  return <p>Provided</p>;
}
`,
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

  test('component with event handler', async () => {
    await testInput('component_event_handler', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export const App = () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
};
`,
    });
  });

  test('component with visible task carrier', async () => {
    await testInput('component_visible_task_carrier', {
      code: `import { useSignal, useVisibleTask$ } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  useVisibleTask$(() => count.value++, { strategy: 'document-ready' });
  return <button>Ready</button>;
}
`,
    });
  });

  test('component with nested QRL', async () => {
    await testInput('component_nested_qrl', {
      code: `import { useSignal, $ } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <button onClick$={() => $(() => count.value++)}>Run</button>;
}
`,
    });
  });

  test('component event module dependency closure', async () => {
    await testInput('component_event_module_dependencies', {
      code: `const base = 10;
const source = { helper: () => base };
const { helper } = source;

export function App() {
  return <button onClick$={() => helper()}>Run</button>;
}
`,
    });
  });

  test('does not lower third-party dollar hooks as Qwik hooks', async () => {
    await testInput('component_third_party_dollar_hook', {
      code: `import { useTask$ } from 'third-party-library';
export function App() {
  useTask$(() => console.log('external'));
  return <main>Ready</main>;
}
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

  test('lowers global useStyles$', async () => {
    await testInput('use_styles_global', {
      path: 'src/use-styles.tsx',
      code: `import { useStyles$ } from '@qwik.dev/core';
import styles from './app.css?inline';

export function App() {
  useStyles$(styles);
  return <div class="container">Hello</div>;
}
`,
    });
  });

  test('lowers scoped static classes', async () => {
    await testInput('use_styles_scoped_static', {
      path: 'src/use-styles-scoped.tsx',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
import styles from './app.css?inline';

export function App() {
  useStylesScoped$(styles);
  return <div class="container">Hello</div>;
}
`,
    });
  });

  test('lowers scoped dynamic object class updates', async () => {
    await testInput('use_styles_scoped_dynamic', {
      path: 'src/use-styles-scoped-dynamic.tsx',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core/spark';
import styles from './app.css?inline';

export function App() {
  useStylesScoped$(styles);
  const active = useSignal(false);
  return <button class={{ container: true, active: active.value }} onClick$={() => active.value = true}>Toggle</button>;
}
`,
    });
  });

  test('lowers multiple scoped styles', async () => {
    await testInput('use_styles_scoped_multiple', {
      path: 'src/use-styles-scoped-multiple.tsx',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
import red from './red.css?inline';
import blue from './blue.css?inline';

export function App() {
  useStylesScoped$(red);
  useStylesScoped$(blue);
  return <div class="container">Hello</div>;
}
`,
    });
  });

  test('keeps scoped classes on projected JSX owner', async () => {
    await testInput('use_styles_scoped_projection', {
      path: 'src/use-styles-scoped-projection.tsx',
      code: `import { Slot, useStylesScoped$ } from '@qwik.dev/core';
import parentStyles from './parent.css?inline';
import childStyles from './child.css?inline';

export function Child() {
  useStylesScoped$(childStyles);
  return <section class="child"><Slot /></section>;
}

export function App() {
  useStylesScoped$(parentStyles);
  return <Child><span class="projected">Projected</span></Child>;
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
      code: `import { useSignal } from "@qwik.dev/core";
export function App() {
  const count = useSignal(1);
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
import { createOn, createOnDocument, useSignal } from '@qwik.dev/core/spark';

export function App() {
  const count = useSignal(0);
  createOn('click', $(() => count.value++));
  createOnDocument('qinit', $(() => count.value += 2), { capture: true, preventdefault: true });
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('supports SSR and CSR dynamic text', async () => {
    await testInput('dynamic_signal_text', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <p>{count.value}</p>;
}
`,
    });
  });

  test('emits SSR range text for mixed dynamic text', async () => {
    await testInput('ssr_dynamic_range_text', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <p>Hello {count.value}</p>;
}
`,
    });
  });

  test('preserves multiline text spacing before dynamic text', async () => {
    await testInput('ssr_dynamic_range_text_multiline_spacing', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
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
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <p>Hello {count.value} world</p>;
}
`,
    });
  });

  test('emits local marker indexes for multiple SSR range texts', async () => {
    await testInput('ssr_dynamic_range_text_multiple', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const first = useSignal(1);
  const second = useSignal(2);
  return <p>{first.value}{second.value}</p>;
}
`,
    });
  });

  test('emits SSR text expression QRLs', async () => {
    await testInput('ssr_dynamic_text_expression', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(1);
  return <p>{count.value + 1}</p>;
}
`,
    });
  });

  test('emits SSR dynamic attrs', async () => {
    await testInput('ssr_dynamic_attrs', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const title = useSignal('hello');
  const classes = useSignal('active');
  const style = useSignal('color:red');
  return <div title={title.value} className={classes.value} style={style.value}>Attrs</div>;
}
`,
    });
  });

  test('emits dynamic DOM attrs through attr expression QRLs', async () => {
    await testInput('dynamic_dom_attrs_props_qrl', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
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

  test('falls back to expression effects for plain value objects', async () => {
    await testInput('plain_value_object_fallback', {
      code: `export function App() {
  const foo = { value: 'hello' };
  return <p title={foo.value}>{foo.value}<span>{'Hi ' + foo.value}</span></p>;
}
`,
    });
  });

  test('falls back to expression effects for unknown source factories', async () => {
    await testInput('unknown_source_factory_fallback', {
      code: `function maybeSignal() {
  return { value: 'maybe' };
}

export function App() {
  const foo = maybeSignal();
  return <div title={foo.value}>{foo.value}</div>;
}
`,
    });
  });

  test('hoists SSR dynamic attrs before async child output', async () => {
    await testInput('dynamic_dom_attrs_after_component', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
function Child() {
  return <span>Child</span>;
}
export function App() {
  const count = useSignal(0);
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
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const attrs = useSignal({
    title: 'from-spread',
    children: 'ignored',
    className: { active: true },
  });
  const title = useSignal('final');
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
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
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
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const visible = useSignal(true);
  const label = useSignal('ready');
  const attrs = useSignal({ role: 'status' });
  return <div>{visible.value && <span {...attrs.value} title={\`label \${label.value}\`}>{label.value + '!'}</span>}</div>;
}
`,
    });
  });

  test('emits logical branch renderers in fragments', async () => {
    await testInput('branch_fragment_logical_and', {
      code: `import { useSignal } from '@qwik.dev/core/spark';

function InnerCmp() {
  return <div>Hello world</div>;
}

export function App() {
  const groupSig = useSignal('1');
  return (
    <>
      Some text:{'  '}
      <button onClick$={() => (groupSig.value = '2')}>click</button>
      {groupSig.value === '2' && <InnerCmp />}
    </>
  );
}
`,
    });
  });

  test('emits dynamic text inside logical branch renderers', async () => {
    await testInput('branch_logical_and_dynamic_text', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>;
}
`,
    });
  });

  test('imports local child components inside branch renderers', async () => {
    await testInput('branch_local_components', {
      code: `import { useSignal } from '@qwik.dev/core/spark';

function Counter({ count }: { count: number }) {
  return <p>Count: {count}</p>;
}

function Hello({ name }: { name: string }) {
  return <p>Hello, {name}!</p>;
}

export function App() {
  const count = useSignal(0);
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
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const items = useSignal([{ id: 'a', label: 'Alpha', selected: true, attrs: { title: 'Alpha' } }]);
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
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const rows = useSignal([{ id: 1, label: 'Alpha', selected: false }]);
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

  test('does not lower unknown value maps to ForNode', async () => {
    const result = await testInput('jsx_unknown_value_map_fallback', {
      code: `function getItems() {
  return { value: [{ id: 'a', label: 'Alpha' }] };
}

export function App() {
  const items = getItems();
  return (
    <ul>
      {items.value.map((row) => (
        <li key={row.id}>{row.label}</li>
      ))}
    </ul>
  );
}
`,
    });
    expect(result.csr.modules.map((module) => module.code).join('\n')).not.toContain(
      'createForBlock'
    );
  });

  test('transforms implicit dollar calls in component setup', async () => {
    await testInput('implicit_dollar_setup', {
      code: `import { useSignal, useComputed$ } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(1);
  const double = useComputed$(() => count.value * 2);
  return <p>{double.value}</p>;
}
`,
    });
  });

  test('transforms serializer object literals in component setup', async () => {
    await testInput('serializer_object_setup', {
      code: `import { useSerializer$, useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(1);
  const custom = useSerializer$({
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
      code: `import { useSignal } from '@qwik.dev/core/spark';

export function Child(props: { label: string; count: number }) {
  return <p>{props.label}: {props.count}</p>;
}

export function Parent() {
  const count = useSignal(1);
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
      code: `import { useContext, useContextProvider, useSignal } from '@qwik.dev/core/spark';
import { Context } from './context';

export function Child() {
  const value = useContext(Context);
  return <p>{value.value}</p>;
}

export function Parent() {
  const value = useSignal('provided');
  useContextProvider(Context, value);
  return <section><Child /></section>;
}
`,
    });
  });

  test('emits task setup with async await tracking', async () => {
    await testInput('task_async_await', {
      code: `import { useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core/spark';

export function App() {
  const count = useSignal(0);
  useTask$(async ({ cleanup }) => {
    const before = count.value;
    await Promise.resolve();
    cleanup(async () => {
      await Promise.resolve(before);
    });
    count.value;
  });
  useVisibleTask$(async () => {
    await Promise.resolve();
    count.value;
  }, { strategy: 'document-ready' });
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('emits async signal setup with async await tracking', async () => {
    await testInput('async_signal_await', {
      code: `import { useAsync$, useSignal } from '@qwik.dev/core/spark';

export function App() {
  const count = useSignal(0);
  const data = useAsync$(async () => {
    const before = count.value;
    await Promise.resolve();
    return before + count.value;
  }, { initial: 0 });
  return <button>{data.value}</button>;
}
`,
    });
  });

  test('transforms JSX values declared in component setup', async () => {
    await testInput('jsx_value_setup', {
      code: `export function App() {
  const someJsx = <div>Some JSX</div>;
  return <button>{someJsx}</button>;
}
`,
    });
  });

  test('creates fresh CSR DOM for repeated JSX value use', async () => {
    await testInput('jsx_value_repeated', {
      code: `export function App() {
  const item = <span>Item</span>;
  return <div>{item}{item}</div>;
}
`,
    });
  });

  test('collects dynamic JSX value segments', async () => {
    await testInput('jsx_value_dynamic', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  const button = <button onClick$={() => count.value++}>{count.value}</button>;
  return <section>{button}</section>;
}
`,
    });
  });

  test('handles function call in JSX', async () => {
    await testInput('handle_function_call', {
      code: `import { useSignal } from '@qwik.dev/core/spark';
      import { fun } from './utils';

function renderItem(value: number) {
  return fun(value);
}

function renderFallback(value: number) {
  return fun(value);
}

export function App() {
  const count = useSignal(1);
  const renderers = { item: fun };
  return (
    <section>
      {fun(count.value)}
      {renderers.item(count.value + 1)}
      {count.value > 1 ? renderItem(count.value) : renderFallback(0)}
      {count.value && renderItem(count.value)}
    </section>
  );
}
`,
    });
  });
});
