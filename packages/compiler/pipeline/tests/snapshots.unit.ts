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
  test('shares JSX lowering across constructor arguments and assignments', async () => {
    await testInput(mode, 'jsx-assignment', {
      code: `import { Box } from './box';
export default function App() {
  let content;
  content = new Box(<b>assigned</b>).value;
  const alias = content;
  return <main>{content}{alias}</main>;
}`,
    });
  });

  test('preserves native context in captured JSX values', async () => {
    await testInput(mode, 'jsx-function-context', {
      code: `export function makeNode(label) {
  return (() => <button onClick$={() => this.total.value += arguments[0].length}>
    {this.prefix + arguments[0]}:{arguments.length}
  </button>)();
}`,
    });
  });

  test('should flatten imported fragments and retain collection keys', async () => {
    await testInput(mode, 'jsx-fragment', {
      code: `import { Fragment, Fragment as F, Slot, useSignal } from '@qwik.dev/core';
const Frame = () => <article><Slot name="title" /><Slot /></article>;
export default () => {
  const rows = useSignal([{ id: 'one' }, { id: 'two' }]);
  const stored = <F><em>stored</em><F /></F>;
  return <Fragment><Frame><F><h1 q:slot="title">title</h1>{stored}</F></Frame>
    <section>{rows.value.map(row => <F key={row.id}><b>{row.id}</b><i>end</i></F>)}</section>
  </Fragment>;
};`,
    });
  });

  test('should preserve module and local JSX helper functions', async () => {
    await testInputs(mode, 'jsx-helper', [
      {
        path: 'src/helper.tsx',
        code: `export function makeNode(label) { return <b>{label}</b>; }
export const makeFactory = (prefix) => (label) => <i>{prefix + label}</i>;
`,
      },
      {
        path: 'src/app.tsx',
        code: `import { makeNode, makeFactory } from './helper';
import { Display } from './display';
const sibling = (label) => <u>{label}</u>, App = () => {
  const values = [makeNode('one'), makeFactory('prefix:')('two'), local('three'), sibling('four')];
  function local(label) { return <span>{label}</span>; }
  return <Display values={values} />;
};
export default App;
`,
      },
    ]);
  });

  test('preserves native Promises and nested async JSX callbacks', async () => {
    const output = await testInput(mode, 'jsx-async', {
      code: `import { useSignal, useComputed$ } from '@qwik.dev/core';
import { register, load } from './consumer';
export default function App() {
  const count = useSignal(0);
  register((value: string) => Promise.resolve(<b>{value}</b>));
  register((value: string) => load(value).then((label: string) => <i>{label}</i>));
  register(async (value: string) => { const label: string = await load(value); return <b>{label}</b>; });
  const result = useComputed$(async () => {
    const create = async (_await) => {
      await load(_await);
      const label = count.value;
      return { label, view: <b>{label}</b> };
    };
    return create('ready');
  });
  return <output>{result.value?.label}</output>;
}`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('compiles JSX in QRL and ordinary callback bodies', async () => {
    const output = await testInput(mode, 'jsx-callback', {
      code: `import { $, useSignal, useTask$, useComputed$ } from '@qwik.dev/core';
import { consume } from './consumer';
export default function App() {
  const count = useSignal(0);
  const factory = $((value: number) => <b>{value}</b>);
  const computed = useComputed$(() => <i>computed</i>);
  useTask$(() => consume(<span>task</span>));
  consume((value: string) => { const label = value; return <strong>{label}</strong>; });
  return <button onClick$={() => {
    const native = (value) => <small>{value}</small>;
    consume(native(count.value), factory, computed.value, <b>event</b>);
  }}>run</button>;
}`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('passes JSX factories as props', async () => {
    const output = await testInput(mode, 'jsx-factory-prop', {
      code: `import { useSignal } from '@qwik.dev/core';
import { Display } from './display';
export default function App() {
  const count = useSignal(0);
  const options = useSignal({ title: 'title' });
  return <main>
    <Display render={(value: number) => <button onClick$={() => count.value += value}>{value}</button>} />
    <Display {...options.value} onResolved={({ label }: { label: string }) => { const text = label; return <b>{text}</b>; }} />
  </main>;
}`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('passes JSX values in component props', async () => {
    const output = await testInput(mode, 'jsx-prop', {
      code: `import { useSignal } from '@qwik.dev/core';
import { Display } from './display';
export function Direct() { return <Display fallback={<b>ready</b>} />; }
export function Spread() {
  const options = useSignal({ title: 'title' });
  return <Display {...options.value} fallback={<b>ready</b>} />;
}
export function Rows() {
  return <ul>{[1, 2].map(row => <li><Display fallback={<b>{row}</b>} /></li>)}</ul>;
}`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('preserves native calls with embedded JSX arguments', async () => {
    const output = await testInput(mode, 'jsx-call', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { wrap, consume } from './wrappers';
export default component$(({ label }: { label: string }) => {
  const count = useSignal(0);
  consume(<span>{label}</span>);
  const content = wrap(<button onClick$={() => count.value++}>{count.value}</button>);
  return <main>{wrap(content)}{wrap(<b>{label}</b>)}{[1, 2].map(row => wrap(<i>{row}</i>))}</main>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('preserves native containers with embedded JSX values', async () => {
    const output = await testInput(mode, 'jsx-structures', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(({ label = 'count' }: { label?: string }) => {
  const count = useSignal(0);
  const views = { header: <h1>{label}</h1>, body: [<button onClick$={() => count.value++}>{count.value}</button>, [null, '<unsafe>']] };
  const content = { ...views, footer: <small>end</small> };
  return <main>{content.header}{content.body}{content.footer}</main>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('renders stored JSX through shared content ranges', async () => {
    const output = await testInput(mode, 'jsx-value', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  const content = <><button onClick$={() => count.value++}>{count.value}</button><span>stored</span></>;
  const alias = content;
  return <main>{alias}{content}</main>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('preserves ordinary component bodies and explicit shared state', async () => {
    const output = await testInput(mode, 'ordinary-component-body', {
      code: `import { $, component$, createContextId, getLocale, useSignal } from '@qwik.dev/core';
const before = observe('before'), Header = () => <h1>Title</h1>, after = observe('after');
export default component$((props: { title: string; hidden?: boolean; failed?: boolean }) => {
  let count = useSignal(1);
  var suffix = '!';
  const context = createContextId('body');
  const locale = getLocale();
  const label = useSignal('ready');
  const increment = $(() => { count.value++; });
  count.value = 4;
  function format(value) { return String(value); }
  label.value = format(count.value);
  suffix += '!';
  function Child() { return <p>{props.title}</p>; }
  if (props.hidden) return;
  try {
    if (props.failed) throw new Error('failed');
    return <section><Header /><Child /><button onClick$={increment}>increment</button><button onClick$={() => { label.value = count.value + suffix; }}>{label.value}</button></section>;
  } catch (error) {
    observe(error);
    return null;
  } finally {
    observe(context, locale);
  }
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should share module bindings with QRL chunks', async () => {
    const output = await testInput(mode, 'qrl-module-bindings', {
      code: `import { useSignal, useComputed$, useTask$ } from '@qwik.dev/core';
const prefix = 'Saved';
const settings = { suffix: '!' };
function format(value) { return prefix + ': ' + value; }
export default () => {
  const count = useSignal(2);
  const title = useComputed$(() => format(count.value));
  useTask$(() => console.log(settings.suffix, title.value));
  return <button onClick$={() => console.log(format(count.value), settings)}>{title.value}</button>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should import module references in event computed and task chunks', async () => {
    const output = await testInput(mode, 'qrl-imports', {
      code: `import { useSignal, useComputed$, useTask$ } from '@qwik.dev/core';
import { calculate, save } from './pricing';
export default () => {
  const count = useSignal(2);
  const total: { value: number } = useComputed$(() => calculate(count.value));
  useTask$(() => save(total.value));
  return <button onClick$={() => save(count.value)}>{total.value}</button>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should lower component$ through the ordinary component pipeline', async () => {
    const output = await testInput(mode, 'component-marker', {
      code: `import { component$ as component, useSignal } from '@qwik.dev/core';
export const Counter = component(({ initial = 0 }) => {
  const count = useSignal(initial);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
export default component(() => <Counter initial={1} />);`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should forward reactive component rest props and project children', async () => {
    const output = await testInput(mode, 'component-prop-rest', {
      code: `import { Slot } from '@qwik.dev/core';
export const Child = ({ label }) => <section title={label}><Slot /></section>;
export default ({ title: heading = 'heading', ...rest }) => (
  <Child {...rest} title={heading}><Slot /></Child>
);`,
    });
    expect(output.diagnostics).toEqual([]);
  });
  test('should initialize prop defaults once and retain reactive alias reads', async () => {
    const output = await testInput(mode, 'component-prop-defaults', {
      code: `import { createTitle, createHandler } from './defaults';
export default ({ title: heading = createTitle(), suffix = '!', onSave$: save = createHandler() }) => {
  const initial = heading;
  return <button title={heading} onClick$={() => save({ heading, initial })}>{heading + suffix}</button>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should evaluate prop defaults in parameter scope and in order', async () => {
    const output = await testInput(mode, 'component-prop-default-scope', {
      code: `const fallback = 'outer';
function side(value) { console.log(value); return value; }
export default ({ a = side('a'), b = a, label = fallback }) => {
  const fallback = 'inner';
  return <p title={fallback}>{a}{b}{label}</p>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Defaults are generated parameters: JS evaluates them left to right in the parameter scope,
    // so \`b = a\` sees the resolved prop and a body-local \`fallback\` cannot shadow the default.
    expect(main).toMatch(
      /\(props, ctx, defaultValue = untrack\(\(\) => props\.a === void 0\) \? \(side\("a"\)\) : void 0, defaultValue0 = untrack\(\(\) => props\.b === void 0\) \? \(\(props\.a === void 0 \? defaultValue : props\.a\)\) : void 0, defaultValue1 = untrack\(\(\) => props\.label === void 0\) \? \(fallback\) : void 0\) => \{/
    );
  });

  test('should capture enclosing callback locals in nested QRLs', async () => {
    const output = await testInput(mode, 'nested-qrl-captures', {
      code: `import { component$, $, useSignal, useTask$ } from '@qwik.dev/core';
import { log } from './log';
export const useCounter = (step) => {
  const c = useSignal(0);
  useTask$(({ track }) => {
    const v = track(() => c.value);
    const report = $(() => log(v + step));
    return report();
  });
  return c;
};
export default component$(() => {
  const c = useCounter(2);
  return (
    <button onClick$={() => { const n = c.value; const later = $(() => log(n)); later(); }}>
      {c.value}
    </button>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The hook body and every nested marker are extracted; nothing stays authored.
    expect(code).not.toContain('useTask$(');
    expect(code).not.toContain('$(()');
    // A nested QRL captures the enclosing callback's locals and parameters.
    expect(code).toContain('.w([v, step])');
    expect(code).toContain('.w([n])');
    // A replaced marker callee is no longer a read, so no chunk imports `$`.
    expect(code).not.toMatch(/import \{[^}]*\s\$[,\s][^}]*\} from "@qwik.dev\/core"/);
  });

  test('should keep setup aliases of props, stores and signals live', async () => {
    const output = await testInput(mode, 'setup-live-aliases', {
      code: `import { useSignal, useStore } from '@qwik.dev/core';
import { Child } from './child';
export default (props: { label: string; title: string; as: string }) => {
  const label = props.label;
  const { title } = props;
  const count = useSignal(0);
  const n = count.value;
  const store = useStore({ item: { label: 'first' }, nested: { flip: false } });
  const { item } = store;
  const { flip = false } = store.nested;
  const Tag = props.as;
  return (
    <Tag onClick$={() => (store.item = { label: n + label })}>
      {label}{title}{n}{item.label}{flip ? 'y' : 'n'}
      <Child state={store} />
    </Tag>
  );
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // No snapshot constants: every alias reads its source, in render and inside the handler.
    for (const snapshot of [
      'const label',
      'const { title }',
      'const n =',
      'const { item }',
      'const { flip',
      'const Tag',
    ]) {
      expect(code).not.toContain(snapshot);
    }
    for (const read of [
      'propSource(props, "label")',
      'propSource(props, "title")',
      'count.value',
      'store.item.label',
      'store.nested.flip',
    ]) {
      expect(code).toContain(read);
    }
    expect(code).toContain('count.value + props.label');
    // A store passed as-is is not wrapped in a prop QRL.
    expect(code).toContain('"state": store }');
  });

  test('should read nested and computed parameter patterns as prop paths', async () => {
    const output = await testInput(mode, 'component-nested-params', {
      code: `const KEY = 'dyn';
export default ({ user: { name, tags: [first] }, [KEY]: keyed, meta: { count = 0 } }) => (
  <p title={keyed} onClick$={() => console.log(name, first)}>{name}{first}{count}</p>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    for (const read of ['props.user.name', 'props.user.tags[0]', 'props[KEY]']) {
      expect(code).toContain(read);
    }
    expect(code).toContain('(props.meta.count === void 0 ? 0 : props.meta.count)');
  });

  test('should preserve reactive prop aliases and aliased children', async () => {
    const output = await testInput(mode, 'component-prop-aliases', {
      code: `import { Slot } from '@qwik.dev/core';
export const Card = ({ title: heading, 'data-label': label, onSave$: save }) => (
  <section><h2>{heading}</h2><button onClick$={() => save({ label })}>{label}</button><Slot /></section>
);
export default () => <Card title="Title" data-label="Label"><p>Projected</p></Card>;`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['fragment', '<><Child /><b>tail</b></>'],
    ['conditional', 'props.visible ? <b>on</b> : null'],
    ['logical', 'props.visible && <b>on</b>'],
  ])('should lower a %s component return through render expressions', async (name, expression) => {
    const output = await testInput(mode, `component-return-${name}`, {
      code: `const Child = () => <><span>first</span><span>second</span></>;
export default (props) => { return ${expression}; };`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should preserve function component declarations and default bindings', async () => {
    const output = await testInput(mode, 'component-function-declarations', {
      code: `import { useSignal } from '@qwik.dev/core';
export function Wrapper() { return <App />; }
export default function App() { return <Child />; }
function Child() {
  const count = useSignal(1);
  return <button onClick$={() => count.value++}>{count.value}</button>;
}
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should preserve an anonymous default function component', async () => {
    const output = await testInput(mode, 'component-default-function', {
      code: 'export default function () { return <span>child</span>; }',
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should preserve local component declarations without exporting them', async () => {
    const output = await testInput(mode, 'component-local-declaration', {
      code: `const Settings = { label: 'ordinary value' };
export const Format = (value) => value;
const Child = (props) => <strong>{props.label}</strong>;
export default () => <main><Child label="child" /></main>;
`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules[0].code).toContain(
      mode === 'ssr'
        ? 'const Child = _markComponent((props, ctx) =>'
        : 'const Child = (props, ctx) =>'
    );
    expect(output.modules[0].code).not.toContain('export const Child');
  });

  test('should pass context through nested component scopes', async () => {
    const output = await testInput(mode, 'setup-context', {
      code: `import { createContextId, useSignal, useContextProvider as provide, useContext as read } from '@qwik.dev/core';
const Counter = createContextId('counter');
export const Child = () => {
  const count: { value: number } = read(Counter);
  return <button onClick$={() => count.value++}>{count.value}</button>;
};
export const Nested = () => {
  const count = useSignal(10);
  provide(Counter, count);
  return <Child />;
};
export default () => {
  const count = useSignal(1);
  provide(Counter, count);
  return <main><Child /><Nested /><Child /></main>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    // Resumed children find their provider through the serialized scope marker.
    const code = output.modules.map((module) => module.code).join('\n');
    const providers = code.match(/contextScopeRef\(\)/g)?.length ?? 0;
    expect(providers).toBe(mode === 'ssr' ? 2 : 0);
    expect(code.includes('"<!c="')).toBe(mode === 'ssr');
  });

  test('should compile store setup through a plain hook call', async () => {
    const output = await testInput(mode, 'setup-store', {
      code: `import { useStore as store } from '@qwik.dev/core';
export default (props: { initial: number }) => {
  const state = store(() => ({ count: props.initial }), { deep: false });
  return <button onClick$={() => state.count++}>{state.count}</button>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should restore await context across hook, explicit and event QRLs', async () => {
    await testInput(mode, 'qrl-await', {
      code: `import { $, useSignal, useTask$ } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(1);
  const run = $(async function run(value = props.initial) {
    await Promise.resolve(value);
    return count.value;
  });
  useTask$(async () => {
    await (await Promise.resolve(props.initial));
    const nested = async () => { await Promise.resolve(); };
    await nested();
    console.log(count.value);
  });
  return <button onClick$={async () => {
    try { await Promise.reject(props.initial); }
    catch { console.log(count.value); }
    await run();
  }}>run</button>;
};
`,
    });
  });

  test('should reuse one setup QRL across hooks and events', async () => {
    const output = await testInput(mode, 'setup-hook-qrl', {
      code: `import { $, useSignal, useTask$, useComputed$ } from '@qwik.dev/core';
import { useCustom$ as custom } from './hooks';
export default (props) => {
  const count = useSignal(1);
  const read = $(() => count.value);
  useTask$((read));
  custom(read, props.options);
  const total: { value: number } = useComputed$(read);
  return <button onClick$={read}>{total.value}</button>;
};
`,
    });
    expect(
      output.modules.filter((module) => module.segment && module.segment.ctxName !== 'content')
    ).toHaveLength(1);
    expect(output.modules.filter((module) => module.segment?.ctxName === 'content')).toHaveLength(
      0
    );
  });

  test('should compile generic setup hooks by their imported binding', async () => {
    await testInput(mode, 'setup-custom-hook', {
      code: `import { useSignal } from '@qwik.dev/core';
import { useCustom$ as custom } from './hooks';
export default (props: { title: string; options: object; args: unknown[] }) => {
  const count = useSignal(1);
  const { label }: { label: string } = custom(() => count.value, props.options);
  custom(() => props.title, ...props.args);
  return <span>{label}</span>;
};
`,
    });
  });

  test('should register visible tasks as resume events in SSR', async () => {
    const output = await testInput(mode, 'setup-visible-task', {
      code: `import { useVisibleTask$, useSignal } from '@qwik.dev/core';
export default () => {
  const status = useSignal('waiting');
  useVisibleTask$(() => { status.value = 'visible'; });
  useVisibleTask$(({ cleanup }) => { cleanup(() => console.log(status.value)); }, { strategy: 'document-ready' });
  useVisibleTask$(() => console.log(status.value), { strategy: 'document-idle' });
  return <output>{status.value}</output>;
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'ssr') {
      expect(code).toContain('useOn("qvisible", createVisibleTaskHandlerQrl(');
      expect(code).toContain('useOnDocument("qinit", createVisibleTaskHandlerQrl(');
      expect(code).toContain('useOnDocument("qidle", createVisibleTaskHandlerQrl(');
      expect(code).not.toContain('useVisibleTask$(');
    } else {
      expect(code).not.toContain('createVisibleTaskHandlerQrl');
    }
  });

  test('should rewrite $ hooks to their Qrl and function twins', async () => {
    const output = await testInput(mode, 'setup-marker-hooks', {
      code: `import { $, implicit$FirstArg, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
import { useCustom$ } from './hooks';
export const useLocalQrl = (qrl) => qrl;
export const useLocal = (fn) => fn;
export const useLocal$ = implicit$FirstArg(useLocalQrl);
export default () => {
  const count = useSignal(1);
  const read = $(() => count.value);
  useTask$(read);
  const total = useComputed$(() => count.value * 2, { initial: 0 });
  useCustom$(() => count.value);
  useLocal$(() => count.value);
  return <span>{total.value}</span>;
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain('useTaskQrl(read)');
    if (mode === 'ssr') {
      expect(code).toContain('import { useCustomQrl } from "./hooks";');
      expect(code).toContain('useComputedQrl(');
      expect(code).toContain('useCustomQrl(');
      expect(code).toContain('useLocalQrl(');
    } else {
      expect(code).toContain('import { useCustom } from "./hooks";');
      expect(code).toContain('useComputed(_withCaptures(');
      expect(code).toContain('useCustom(_withCaptures(');
      expect(code).toContain('useLocal(_withCaptures(');
    }
    expect(code).not.toContain('useCustom$(');
    expect(code).not.toContain('useLocal$(');
  });

  test('should compile global and scoped styles without QRLs', async () => {
    const output = await testInput(mode, 'setup-styles', {
      code: `import { useSignal, useStyles$, useStylesScoped$ } from '@qwik.dev/core';
const STYLE = \`.container { color: red; }\`;
export const Child = () => {
  useStylesScoped$(STYLE);
  return <div class="container">child</div>;
};
export default () => {
  useStyles$('.global { color: blue; }');
  const scope = useStylesScoped$(\`.local { color: green; }\`);
  const active = useSignal(false);
  return (
    <section class={scope}>
      <span>plain</span>
      <button class={{ active: active.value }} onClick$={() => (active.value = true)}>go</button>
      {active.value ? <b class="on">on</b> : null}
      <Child />
    </section>
  );
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    // Every element of a scoped component carries the scope; dynamic classes get it from the effect.
    expect(code).toMatch(/<span class=\\?"\u26a1\ufe0f[a-z0-9]+-\d\\?">plain<\/span>/);
    expect(code).toMatch(/<b class=\\?"\u26a1\ufe0f[a-z0-9]+-\d on\\?">on<\/b>/);
    expect(code).toMatch(/<div class=\\?"\u26a1\ufe0f[a-z0-9]+-\d container\\?">child<\/div>/);
    expect(code).toMatch(
      mode === 'ssr'
        ? /\], q_component_class_segment_\d+_[a-z0-9]+, undefined, "\u26a1\ufe0f[a-z0-9]+-\d"\)/
        : /ctx\.scheduler, "\u26a1\ufe0f[a-z0-9]+-\d"\);/
    );
    expect(code).toMatch(/useStyles\(".global \{ color: blue; \}", "[a-z0-9]+-\d"\);/);
    expect(code).toMatch(/useStylesScoped\(STYLE, "[a-z0-9]+-\d", true\);/);
    expect(code).toMatch(
      /const scope = useStylesScoped\(".local \{ color: green; \}", "[a-z0-9]+-\d", true\);/
    );
    expect(code).not.toContain('useStyles$(');
  });

  test('should compile serializer arguments as factories', async () => {
    const output = await testInput(mode, 'setup-serializer', {
      code: `import { useSerializer$, useSignal } from '@qwik.dev/core';
export default () => {
  const start = useSignal(5);
  const count = useSerializer$({
    deserialize: (value: number) => ({ n: value }),
    serialize: (value: { n: number }) => value.n,
    initial: start.value,
  });
  const date = useSerializer$(() => ({ deserialize: (value: string) => new Date(value), serialize: (date: Date) => date.toISOString() }));
  return <span>{count.value.n}{date.value.getFullYear()}</span>;
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'ssr') {
      expect(code.match(/useSerializerQrl\(/g)).toHaveLength(2);
    } else {
      expect(code).toContain('useSerializer(_withCaptures(');
      expect(code.match(/useSerializer\(/g)).toHaveLength(2);
    }
    expect(code).not.toContain('useSerializer$(');
  });

  test('should wait for initial tasks before rendering', async () => {
    const output = await testInput(mode, 'setup-task-wait', {
      code: `import { useTask$, useSignal } from '@qwik.dev/core';
export const Child = () => <b>child</b>;
export default () => {
  const ready = useSignal('pending');
  useTask$(async () => {
    await Promise.resolve();
    ready.value = 'done';
  });
  return <section><span>{ready.value}</span><Child /></section>;
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain(
      mode === 'ssr'
        ? 'maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx0, () => {'
        : 'maybeThen(invokeCtx0.pendingSetup, () => invoke(invokeCtx0, () => {'
    );
    if (mode === 'csr') {
      expect(code).toContain('useTask(_withCaptures(component_useTaskqrl_segment_0_');
    }
  });

  test('should compile local implicit hooks and task setup', async () => {
    await testInput(mode, 'setup-task-hook', {
      code: `import { implicit$FirstArg, useTaskQrl, useTask$ as task, useSignal } from '@qwik.dev/core';
const useCustom$ = implicit$FirstArg(useTaskQrl);
export default () => {
  const count = useSignal(1);
  useCustom$(({ cleanup }) => {
    const value = count.value;
    console.log(value);
    cleanup(() => console.log('cleanup', value));
  });
  task(() => console.log(count.value), { deferUpdates: true });
  return <span>{count.value}</span>;
};
`,
    });
  });

  test('should compile an async computed setup signal', async () => {
    const output = await testInput(mode, 'setup-computed-async', {
      code: `import { useSignal, useComputed$ } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  const doubled = useComputed$(async () => {
    await Promise.resolve();
    return count.value * 2;
  });
  return <span>{doubled.value}</span>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should forward computed options for inline and existing QRLs', async () => {
    const output = await testInput(mode, 'setup-computed-options', {
      code: `import { $, useComputed$ as computed } from '@qwik.dev/core';
export default (props: { initial: number }) => {
  const initial = props.initial;
  const options = { initial, timeout: 1000 };
  const read = $(async () => 42);
  const first = computed(async () => 42, { ...options, initial: () => initial });
  const second: { value: number } = computed(read, ...[options]);
  return <span>{first.value}:{second.value}</span>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(
      output.modules.filter((module) => module.segment && module.segment.ctxName !== 'content')
    ).toHaveLength(2);
    expect(output.modules.filter((module) => module.segment?.ctxName === 'content')).toHaveLength(
      0
    );
  });

  test('should compile a synchronous computed setup signal', async () => {
    await testInput(mode, 'setup-computed', {
      code: `import { useSignal, useComputed$ } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  const doubled = useComputed$(() => count.value * 2);
  return <span>{doubled.value}</span>;
};
`,
    });
  });

  test('should chain computed setup signals with captured props', async () => {
    await testInput(mode, 'setup-computed-chain', {
      code: `import { useSignal, useComputed$ as computed } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(1);
  const doubled = computed(() => count.value * 2);
  const label = computed(function () {
    const value = doubled.value;
    return props.prefix + value;
  });
  return <button title={label.value} onClick$={() => count.value++}>{label.value}</button>;
};
`,
    });
  });

  test('should reuse an explicit setup QRL across events', async () => {
    await testInput(mode, 'setup-qrl', {
      code: `import { $, useSignal } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(0);
  const onSave = $((event) => {
    count.value++;
    props.onSave$(props.id, event.type);
  });
  return <main><button onClick$={onSave}>save</button><button onClick$={onSave}>again</button></main>;
};
`,
    });
  });

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
      code: `export default (props: { title: string }) => {
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

  test('should extract native function event handlers', async () => {
    await testInput(mode, 'event-function-handlers', {
      code: `export const Button = (props) => <button onClick$={props.onSave$}>save</button>;
export default (props) => <main>
  <button onClick$={function onClick(event) { return [this, arguments.length, event.type]; }}>plain</button>
  <Button onSave$={function save(value = props.initial) { return props.onSave$(value); }} />
  <button onClick$={async function (event) { await Promise.resolve(); return props.onSave$(event.type); }}>async</button>
</main>;`,
    });
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
export const Card = (props: { title?: string; suffix: string; start: number }) => {
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
      code: `export default (props: { name: string }) => <p>{props.name}</p>;
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
      code: `export default (props: { title: string }) => {
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
      code: `export default (props: { enabled: boolean; label: string }) => {
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

  test('should key a derived collection by position when no key is authored', async () => {
    const output = await testInput(mode, 'collection-keyless-derived', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { items: string[] }) => {
  const filter = useSignal('');
  return (
    <ul>
      {props.items.filter((item) => item.includes(filter.value)).map((item) => <li>{item}</li>)}
    </ul>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // No key chunk: the runtime keys rows by index.
    expect(main).toMatch(
      mode === 'csr' ? /createCollection\([^;]*, null, / : /renderSsrCollection\([^;]*, undefined, /
    );
    expect(output.modules.some((module) => module.segment?.ctxName === 'collection:key')).toBe(
      false
    );
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

  test('should materialize collection aliases in event handlers', async () => {
    await testInput(mode, 'collection-event-aliases', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const rows = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{rows.value.map(({ id, label }, index) =>
    <li key={id}>
      <button title={JSON.stringify({ id, label, index })} onClick$={() => ({ id, label, index })}>read</button>
      <button onClick$={(value = id, position = index) => {
        const read = (id) => id;
        return [value, position, label, read('shadow')];
      }}>default</button>
    </li>
  )}</ul>;
};`,
    });
  });

  test('should preserve receivers when calling collection aliases', async () => {
    await testInput(mode, 'collection-alias-calls', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const rows = useSignal([]);
  return <ul>{rows.value.map(({ id, save, api }) => <li key={id}>
    <button title={save()} onClick$={() => save()}>save</button>
    <button onClick$={(value = save?.()) => [value, (save)(), api.save()]}>optional</button>
  </li>)}</ul>;
};`,
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

  test('should extract explicit $ calls wherever they appear', async () => {
    const output = await testInput(mode, 'explicit-qrl-anywhere', {
      code: `import { useOn, useSignal, $ } from '@qwik.dev/core';
export function later(run: () => void) {
  return $(() => run());
}
export default () => {
  const count = useSignal(0);
  useOn('click', $(() => { count.value++; }));
  const wrapped = [1].map((step) => $(() => (count.value += step)));
  return (
    <button onClick$={() => { const bump = $(() => count.value++); bump(); }} data-n={wrapped.length}>
      {count.value}
    </button>
  );
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Every `$(fn)` became a QRL reference; none survives as a runtime call.
    expect(code).not.toMatch(/\$\(/);
    expect(code).toContain('useOn("click", q_');
    expect(code).toMatch(/const bump = q_\w+\.w\(\[count\]\)/);
    expect(code).toMatch(/const wrapped = \[1\]\.map\(\(step\) => q_\w+\.w\(\[count, step\]\)\)/);
  });

  test('should ship function references and plain values as QRL factories', async () => {
    const output = await testInput(mode, 'qrl-value-arguments', {
      code: `import { component$, $, useTask$, useSignal } from '@qwik.dev/core';
import { config } from './config';
function tick() { console.log('tick'); }
export const greeting = $('hello');
export const settings = $(config);
export default component$(() => {
  const count = useSignal(1);
  useTask$(tick);
  const later = $(tick);
  const snapshot = $(count);
  return <button onClick$={later}>{count.value}</button>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Every marker is extracted; a non-function argument ships as a factory returning it.
    expect(code).not.toContain('$(');
    expect(code).not.toContain('useTask$');
    expect(code).toMatch(/return ["']hello["']/);
    for (const returned of ['return config', 'return tick', 'return count']) {
      expect(code).toContain(returned);
    }
    // The setup local is captured, the module function is imported.
    expect(code).toContain('const [count] = _captures;');
    expect(code).toMatch(/import \{ (?:__qwik_)?tick(?: as tick)? \} from "\.\/component\.tsx"/);
    // Replaced marker callees retain no authored core import.
    expect(code).not.toMatch(/import \{[^}]*\s\$[,\s][^}]*\} from "@qwik.dev\/core"/);
  });

  test('should ship $-suffixed component props as QRLs', async () => {
    const output = await testInput(mode, 'component-qrl-props', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Child } from './child';
const Fallback = () => <p>loading</p>;
export default component$(() => {
  const count = useSignal(1);
  const pick = (v) => v.x;
  return (
    <Child
      then$={pick}
      fallback$={Fallback}
      render$={(v) => <b>{v + count.value}</b>}
      data$={{ a: count.value }}
    />
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Every `$` prop is a QRL under its authored key, never a computed prop.
    expect(code).not.toContain('readExpression(');
    for (const name of ['then$', 'fallback$', 'render$', 'data$']) {
      expect(code).toMatch(new RegExp(`"${name.replace('$', '\\$')}": q_`));
    }
    // A body function passed as a `$` prop ships as its own segment, nothing wraps it.
    expect(code).toMatch(/"then\$": q_component_pick_segment_\w+/);
    expect(code).not.toContain('.w([pick])');
    expect(code).toContain('return Fallback');
    expect(code).toContain('return { a: count.value }');
  });

  test('should alias component$ of a component reference', async () => {
    const output = await testInput(mode, 'component-reference', {
      code: `import { component$, componentQrl, qrl } from '@qwik.dev/core';
import { Imported } from './imported';
function Body(props: { x: string }) {
  return <p>{props.x}</p>;
}
const plain = (props: { x: string }) => <i>{props.x}</i>;
export const App = component$(Body);
export const Marked = component$(plain);
export const Wrapped = component$(Imported);
export const Lazy = componentQrl(qrl(() => import('./body'), 'Body'));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The referenced functions compile as components; the runtime marker call is an identity.
    expect(main).toContain('function Body(props, ctx) {');
    expect(main).toContain(
      mode === 'ssr'
        ? 'const plain = _markComponent((props, ctx) =>'
        : 'const plain = (props, ctx) =>'
    );
    expect(main).toContain('export const App = component$(Body);');
    expect(main).toContain('export const Marked = component$(plain);');
    expect(main).toContain('export const Wrapped = component$(Imported);');
    // An authored QRL component stays as written.
    expect(main).toMatch(
      /export const Lazy = componentQrl\(qrl\(\(\) => import\(["']\.\/body["']\), ["']Body["']\)\);/
    );
  });

  test('should lower custom hook bodies and link their event facts', async () => {
    const output = await testInputs(mode, 'custom-hook-bodies', [
      {
        path: 'src/hooks.ts',
        code: `import { useOn, useSignal, useTask$ } from '@qwik.dev/core';
export const useClick = (handler) => {
  useOn('click', handler);
};
export function useCounter(start) {
  const count = useSignal(start);
  useTask$(() => {
    count.value;
  });
  return { count, bump: () => count.value++ };
}
export function useMaybeClick(flag, handler) {
  if (!flag) {
    return null;
  }
  useOn('click', handler);
  return flag;
}
`,
      },
      {
        code: `import { $, component$ } from '@qwik.dev/core';
import { useClick, useCounter, useMaybeClick } from './hooks';
export const Clicker = component$(() => {
  useClick($(() => console.log('click')));
  return <button>click</button>;
});
export const Counter = component$(() => {
  const { count, bump } = useCounter(1);
  return <button onClick$={bump}>{count.value}</button>;
});
export const Maybe = component$((props: { flag: boolean }) => {
  useMaybeClick(props.flag, $(() => 1));
  return <div>maybe</div>;
});
`,
      },
    ]);
    expect(output.diagnostics).toEqual([]);
    const hooks = output.modules.find((module) => module.path === 'src/hooks.ts')!.code;
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Hook bodies compile like component setup: their $ calls become QRLs or static callbacks.
    expect(hooks).toContain(mode === 'ssr' ? 'useTaskQrl(q_' : 'useTask(_withCaptures(');
    expect(hooks).not.toContain('useTask$(');
    // An early return stays ordinary JavaScript inside the compiled body.
    expect(hooks).toMatch(/if \(!flag\) \{\s*return null;\s*\}/);
    if (mode === 'ssr') {
      // Only the roots whose linked hooks register events ship as open-tag records.
      expect(main.match(/createSsrOpenTag\(/g)).toHaveLength(2);
      expect(main).toMatch(/createSsrOpenTag\("<button", ">"\)/);
    }
  });

  test('should merge setup useOn events into the root element on the server', async () => {
    const output = await testInputs(mode, 'setup-use-on', [
      {
        code: `import { useOn, useSignal, $ } from '@qwik.dev/core';
import { useClick } from './hooks';
export default () => {
  const count = useSignal(0);
  useOn('click', $(() => count.value++), { capture: true });
  return <button onClick$={() => count.value--}>{count.value}</button>;
};
`,
      },
      {
        path: 'src/headless.tsx',
        code: `import { useOnDocument, $ } from '@qwik.dev/core';
export default () => {
  useOnDocument('scroll', $(() => 1));
  return <>headless</>;
};
`,
      },
    ]);
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    const headless = output.modules.find((module) => module.path === 'src/headless.tsx')!.code;
    if (mode === 'ssr') {
      // The open tag is a record so the runtime joins the hook's registrations with the JSX handler.
      expect(main).toMatch(
        /createSsrOpenTag\(.*ctx\.eventAttr\("q-e:click", q_\w+\.w\(\[count\]\)\)/s
      );
      expect(main).not.toContain('eventAttrParts(');
    } else {
      expect(main).not.toContain('createSsrOpenTag');
    }
    // An element-less root keeps the runtime's script carrier.
    expect(headless).not.toContain('createSsrOpenTag');
  });

  test('should call custom $ hooks through their twins wherever they appear', async () => {
    const output = await testInput(mode, 'marker-qrl-anywhere', {
      code: `import { useSignal } from '@qwik.dev/core';
import { useCustom$ } from './hooks';
export function make(count) {
  return useCustom$(() => count.value);
}
export default () => {
  const count = useSignal(0);
  const handles = [useCustom$(() => count.value + 1)];
  return (
    <button onClick$={() => { useCustom$(() => count.value); }} data-n={handles.length}>
      {count.value}
    </button>
  );
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).not.toContain('useCustom$(');
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Setup and module helpers take the client fast path; a chunk body keeps the qrl twin.
    const twin = mode === 'ssr' ? 'useCustomQrl(q_' : 'useCustom(_withCaptures(';
    expect(main.match(new RegExp(twin.replace(/[$()]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(code).toMatch(/useCustomQrl\(q_\w+\.w\(\[count\]\)\);/);
  });

  test('should inline sync$ handlers under a stable key', async () => {
    const output = await testInput(mode, 'sync-handlers', {
      code: `import { sync$ } from '@qwik.dev/core';
export const stop = sync$((event: Event) => event.preventDefault());
export default () => (
  <a href="/x" onClick$={sync$((_event: Event, element: Element) => element.setAttribute('data-sync', 'ran'))}>
    go
  </a>
);
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The function stays inline under its symbol; no chunk is produced for it. A client event
    // takes the plain function; only a value needs the QRL.
    expect(main.match(/_qrlSync\(\w+, "\w+"\)/g)).toHaveLength(mode === 'ssr' ? 2 : 1);
    expect(main).not.toContain('sync$(');
    expect(output.modules.filter((module) => module.path.includes('sync'))).toHaveLength(0);
  });

  test('should extract every function of an event handler array', async () => {
    const output = await testInput(mode, 'event-handler-arrays', {
      code: `import { $, useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  const log = $(() => console.log(count.value));
  return (
    <button onClick$={[() => count.value++, [undefined, () => (count.value += 2)], null, log]}>
      {count.value}
    </button>
  );
};
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Nested arrays flatten, empty entries drop, each function is its own event QRL.
    expect(main).toMatch(
      mode === 'ssr'
        ? /eventAttrParts\("q-e:click", \[q_\w+\.w\(\[count\]\), q_\w+\.w\(\[count\]\), log\]\)/
        : /setEvent\(el0, "q-e:click", \[createCapturedEvent\(\w+, \[count\]\), createCapturedEvent\(\w+, \[count\]\), log\]\)/
    );
  });

  test('should scope window and document events and keep event modifiers', async () => {
    const output = await testInput(mode, 'event-scopes-modifiers', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  return (
    <div window:onDblClick$={() => count.value++} document:onScroll$={() => count.value++} passive:scroll>
      <a href="/x" preventdefault:click stoppropagation:click capture:click onClick$={() => count.value++}>
        go
      </a>
    </div>
  );
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain('"q-w:dblclick"');
    expect(code).toContain('"q-dp:scroll"');
    for (const modifier of ['preventdefault:click', 'stoppropagation:click', 'capture:click']) {
      expect(code).toContain(modifier);
    }
    expect(code).not.toContain('passive:');
  });

  test('should set attributes read from an inline array row once', async () => {
    const output = await testInput(mode, 'collection-inline-row-attr', {
      code: `export default () => {
  return <ul>{['a', 'b'].map((item) => <li id={'row-' + item} class={item}>x</li>)}</ul>;
};
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    const patch = mode === 'ssr' ? 'serializeAttrExpressionValue' : 'patchAttrValue';
    expect(code.match(new RegExp(`${patch}\\(`, 'g'))).toHaveLength(2);
    // A row constant never changes, so no effect and no chunk is emitted for it.
    expect(code).not.toContain(
      mode === 'ssr' ? 'renderSsrAttrExpression' : 'createAttrExpressionEffect'
    );
    expect(code).not.toMatch(/import\("\.\/component\.tsx_/);
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
      code: `export default (props: { title: string }) => {
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

  test('should pass local bindings as component props without a QRL', async () => {
    const output = await testInput(mode, 'component-binding-prop', {
      code: `import { useSignal } from '@qwik.dev/core';
export const Child = (props) => <strong>{props.count.value}</strong>;
export default () => {
  const show = useSignal(true);
  const count = useSignal(0);
  let label = 'a';
  label = 'b';
  return <div>{show.value ? <Child count={count} label={label} /> : null}</div>;
};
`,
    });
    expect(output.modules.map((module) => module.code).join('\n')).not.toContain('readExpression');
  });

  test('should expand object-literal element spreads into attributes', async () => {
    const output = await testInput(mode, 'element-literal-spread', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const clicks = useSignal(0);
  const id = 'main';
  return (
    <div {...{ 'data-clicks': String(clicks.value), title: 'fixed', id }} class="box" onClick$={() => clicks.value++}>
      x
    </div>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // A literal spread is ordinary attributes: no props effect, static parts stay flat.
    expect(main).not.toMatch(/createPropsEffect|renderSsrProps/);
    expect(main).toMatch(/title=\\?"fixed\\?"/);
    expect(main).toMatch(/class=\\?"box\\?"/);
    expect(main).toContain('"data-clicks"');
    expect(main).toContain('"id"');
  });

  test('should apply element spreads through one props effect', async () => {
    const output = await testInput(mode, 'element-spread-props', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { title: string }) => {
  const attrs = useSignal<Record<string, unknown>>({ class: 'last' });
  const box = useSignal<Element>();
  return (
    <div {...props} class="middle" {...attrs.value} ref={box} onClick$={() => (attrs.value = {})}>
      child
    </div>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The whole attribute list is one props object in authored order, so a later key wins.
    expect(code).toMatch(
      /\.\.\.props, "?class"?: "middle", \.\.\.attrs\.value, "?ref"?: box, "?onClick\$"?: q_/
    );
    if (mode === 'csr') {
      expect(main).toContain('createPropsEffect(el0, [attrs, box, props], ');
    } else {
      expect(main).toContain('renderSsrProps(id0, [attrs, box, props], ');
      expect(main).toContain('createSsrOpenTag(');
      expect(main).toContain('.attrs, ');
      expect(main).toContain('ctx.setRef(');
      expect(main).toContain('.innerHTML ?? ');
    }
  });

  test('should emit dangerouslySetInnerHTML as element content', async () => {
    const output = await testInput(mode, 'element-inner-html', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const markup = useSignal('<i>live</i>');
  return (
    <section>
      <div dangerouslySetInnerHTML="<span>raw</span>" />
      <p dangerouslySetInnerHTML={markup.value} onClick$={() => (markup.value = '<b>next</b>')}>
        ignored
      </p>
    </section>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Static markup is element content, never an attribute and never escaped.
    expect(main).toContain('<div><span>raw</span></div>');
    expect(main).not.toMatch(/dangerouslySetInnerHTML=/i);
    expect(main).not.toContain('ignored');
    // A live value binds the innerHTML through the attribute helpers under its authored name.
    expect(main).toContain('"dangerouslySetInnerHTML", markup');
  });

  test('should serialize static and dynamic attributes alike', async () => {
    const output = await testInput(mode, 'attribute-parity', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const on = useSignal(false);
  return (
    <section>
      <input required={false} aria-hidden={false} draggable={false} spellcheck={false} tabIndex={-1} data-n={2} hidden={true} />
      <input required={on.value} aria-hidden={on.value} draggable={on.value} spellcheck={on.value} tabIndex={-1} data-n={2} />
    </section>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Static literals fold to the bytes the runtime would serialize for the same values.
    expect(main).toMatch(
      /<input aria-hidden=\\?"false\\?" draggable=\\?"false\\?" spellcheck=\\?"false\\?" tabIndex=\\?"-1\\?" data-n=\\?"2\\?" hidden>/
    );
    expect(main).not.toMatch(/<input required/);
    // The dynamic twins bind under the same attribute names.
    for (const name of ['required', 'aria-hidden', 'draggable', 'spellcheck']) {
      expect(main).toContain(`"${name}", on`);
    }
  });

  test('should apply class and style combinations through the attribute helpers', async () => {
    const output = await testInput(mode, 'attribute-class-style', {
      code: `import { component$, useSignal, useStylesScoped$ } from '@qwik.dev/core';
export default component$(() => {
  useStylesScoped$('.base { color: red }');
  const active = useSignal(true);
  return (
    <button
      class={['base', { active: active.value, disabled: !active.value }]}
      style={{ opacity: active.value ? 1 : 0.5 }}
      onClick$={() => (active.value = !active.value)}
    />
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Arrays and objects serialize in the runtime helpers; the scoped style id rides along.
    expect(code).toMatch(/"class", \[active\], [^,]+, [^,]+, "⚡️/);
    expect(code).toContain('"style", [active]');
  });

  test('should render textarea and select values as content and selection', async () => {
    const output = await testInput(mode, 'form-values', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const text = useSignal('one');
  return (
    <form>
      <textarea value={text.value} />
      <textarea value="fixed" />
      <select value={text.value}>
        <option value="one">one</option>
        <option value="two">two</option>
      </select>
      <select value="two">
        <option value="one">one</option>
        <option value="two">two</option>
      </select>
    </form>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Literal values fold: textarea content and the matching option's `selected`.
    expect(main).toContain('<textarea>fixed</textarea>');
    expect(main).toMatch(/<option value=\\?"two\\?" selected>two<\/option>/);
    // Live values render once as content/selection and keep the `value` property binding.
    expect(main).toMatch(/text\.value === ["']one["']/);
    expect(main).toContain('"value", text');
  });

  test('should bind refs to their elements', async () => {
    const output = await testInput(mode, 'element-refs', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const input = useSignal<Element>();
  const show = useSignal(false);
  const calls: string[] = [];
  return (
    <section>
      <input ref={input} />
      <div ref={() => calls.push('ref')}>target</div>
      {show.value && <i ref={(el) => calls.push(el.tagName)}>late</i>}
    </section>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // A ref is applied once when its element exists, never as an attribute or an effect.
    expect(main).not.toMatch(/ ref=|"ref": |'ref', /);
    if (mode === 'csr') {
      expect(main).toContain('setRef(input, el');
      expect(main).toMatch(/setRef\(\(\) => calls\.push\(['"]ref['"]\), el/);
      expect(code).toContain('setRef((el) => calls.push(el.tagName), el');
    } else {
      expect(main).toContain('ctx.setRef(input, id');
      expect(main).toMatch(/ctx\.setRef\(\(\) => calls\.push\(['"]ref['"]\), id/);
      expect(code).toContain('setRef((el) => calls.push(el.tagName), id');
    }
  });

  test('should bind inputs both ways through the runtime bind handlers', async () => {
    const output = await testInput(mode, 'element-bind', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const checked = useSignal(false);
  const text = useSignal('one');
  return (
    <form>
      <input type="checkbox" bind:checked={checked} />
      <textarea bind:value={text} />
    </form>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The signal drives the property; the runtime handler writes the input back into it.
    expect(main).toContain('"checked", checked');
    expect(main).toContain('"value", text');
    expect(main).toContain("inlinedQrl(_chk, '_chk', [checked])");
    expect(main).toContain("inlinedQrl(_val, '_val', [text])");
    expect(main).not.toContain('bind:');
  });

  test('should pass handler arrays to components as QRL lists', async () => {
    const output = await testInput(mode, 'component-handler-array', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Button } from './button';
export default component$(() => {
  const count = useSignal(0);
  return <Button onClick$={[() => count.value++, () => console.log('clicked')]} />;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Each handler is its own QRL; the child element resolves the list in order.
    expect(main).toMatch(/"onClick\$": \[q_\w+\.w\(\[count\]\), q_\w+\]/);
  });

  test('should keep useId as a runtime call in setup and rows', async () => {
    const output = await testInput(mode, 'use-id', {
      code: `import { component$, useId } from '@qwik.dev/core';
export default component$((props: { items: string[] }) => {
  const id = useId();
  return (
    <ul id={id}>
      {props.items.map((item) => {
        const rowId = useId();
        return <li id={rowId}>{item}</li>;
      })}
    </ul>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The runtime counts ids per render; the compiler only keeps the calls and their import.
    expect(code).toContain('const id = useId();');
    expect(code).toContain('const rowId = useId();');
    expect(code).not.toContain('pendingSetup');
  });

  test('should keep static text markup-safe once, in both environments', async () => {
    const output = await testInput(mode, 'static-text-escaping', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div>
    <p>a &lt; b &amp;&amp; c</p>
    <span>{'tick: ' + 1}</span>
    <textarea value="x < y" />
  </div>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // JSX text is authored HTML: entities pass through untouched, never escaped a second time.
    expect(main).toContain('<p>a &lt; b &amp;&amp; c</p>');
    expect(main).not.toContain('&amp;lt;');
    expect(main).toContain('<span>tick: 1</span>');
    // A literal attribute string is decoded text, so it is escaped as content.
    expect(main).toContain('<textarea>x &lt; y</textarea>');
  });

  test('should keep script and style content a literal written as-is', async () => {
    const output = await testInput(mode, 'raw-text-elements', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$((props: { heading: string }) => (
  <div>
    <style>{'.a > b { color: red }'}</style>
    <script>{'if (a < b) { s = "</script>"; }'}</script>
    <title>{props.heading}</title>
  </div>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Raw text never decodes entities, so only a premature closer is guarded.
    expect(code).toContain('.a > b { color: red }');
    expect(code).toContain('if (a < b)');
    expect(code).toContain('<\\\\/script>');
    if (mode === 'ssr') {
      // A title decodes entities, so it keeps the usual escaping.
      expect(code.match(/escapeHTML\(text\d\)/g)).toHaveLength(1);
    }
  });

  test('should refuse a live value inside script and style', async () => {
    const output = await testInput(mode, 'raw-text-live-value', {
      code: `export default (props: { init: string }) => <script>{props.init}</script>;`,
    });
    expect(output.diagnostics).toMatchObject([{ code: 'raw-text-content' }]);
  });

  test('should build svg and math chunk templates in their namespace', async () => {
    const output = await testInput(mode, 'namespace-chunks', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { points: number[] }) => {
  const show = useSignal(false);
  return (
    <svg>
      {show.value && <circle r="1" />}
      {props.points.map((point) => <rect key={point} width={point} />)}
      <foreignObject>{show.value && <div>html</div>}</foreignObject>
      <foreignObject><math>{show.value && <mi>x</mi>}</math></foreignObject>
    </svg>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'csr') {
      // A chunk rooted inside svg or math parses inside a wrapper of that namespace.
      expect(code).toMatch(/_createElementTemplate\("<svg><circle r=\\"1\\"><\/circle><\/svg>"\)/);
      expect(code).toMatch(/_createElementTemplate\("<svg><rect><\/rect><\/svg>"\)/);
      expect(code).toMatch(/_createElementTemplate\("<math><mi>x<\/mi><\/math>"\)/);
      // foreignObject content is HTML again.
      expect(code).toMatch(/_createElementTemplate\("<div>html<\/div>"\)/);
    }
  });

  test('should infer the namespace of svg-only content outside an svg element', async () => {
    const output = await testInput(mode, 'namespace-inference', {
      code: `import { component$, useSignal, Slot } from '@qwik.dev/core';
export const Host = component$(() => <svg><Slot /></svg>);
export default component$(() => {
  const show = useSignal(false);
  return (
    <>
      <Host>
        {show.value && <path d="a" />}
        {show.value && <><circle r="1" /><mi>x</mi></>}
        {show.value && <title>t</title>}
      </Host>
      <svg>{show.value && <><rect /><circle /></>}</svg>
    </>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'csr') {
      // An svg-only root parses inside an svg wrapper wherever it is authored.
      expect(code).toMatch(/_createElementTemplate\("<svg><path d=\\"a\\"><\/path><\/svg>"\)/);
      // A fragment takes the namespace of its first element; a math tag after it follows suit.
      expect(code).toMatch(
        /createTemplate\("<svg><circle r=\\"1\\"><\/circle><mi>x<\/mi><\/svg>"\)/
      );
      expect(code).toMatch(/createTemplate\("<svg><rect><\/rect><circle><\/circle><\/svg>"\)/);
      // A name HTML also owns stays HTML.
      expect(code).toMatch(/_createElementTemplate\("<title>t<\/title>"\)/);
    }
  });

  test('should keep namespaced attribute names for the runtime', async () => {
    const output = await testInput(mode, 'namespaced-attributes', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const icon = useSignal('#a');
  return (
    <svg xml:lang="en">
      <use xlink:href={icon.value} />
      <use xlink:href="#static" />
    </svg>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The qualified name reaches the attribute helpers, which pick the namespace from it.
    expect(main).toContain('"xlink:href", icon');
    expect(main).toMatch(/xml:lang=\\?"en\\?"/);
    expect(main).toMatch(/xlink:href=\\?"#static\\?"/);
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

  test('should render mutable QRL event bindings', async () => {
    const output = await testInput(mode, 'mutable-qrl-event', {
      code: `import { $, useSignal } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(0);
  let action = $(() => { count.value++; });
  if (props.disabled) action = null;
  return <button onClick$={action}>{count.value}</button>;
};
`,
    });
    expect(output.diagnostics).toEqual([]);
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

  test.each([
    ['children-read', `export const Wrapper = (props) => <section>{props.children}</section>;`],
    ['children-read', `export const Wrapper = ({ children }) => <section>{children}</section>;`],
    ['children-read', `export const Wrapper = (props) => <p>{props.children?.length}<Slot /></p>;`],
    [
      'children-read',
      `import { Card } from './card';
export const Wrapper = (props) => <Card>{props.children}</Card>;`,
    ],
    [
      'children-attribute',
      `import { Card } from './card';
export const Wrapper = () => <Card children={<b>x</b>} />;`,
    ],
    [
      'children-read',
      `export const Wrapper = ({ children = <p>none</p> }) => <section><Slot /></section>;`,
    ],
    [
      'children-function',
      `import { Card } from './card';
export const Wrapper = () => <Card>{(value: number) => <b>{value}</b>}</Card>;`,
    ],
  ])('should diagnose children used as content: %s', async (code, source) => {
    const output = await testInput(mode, `children-contract-${code}-${source.length}`, {
      code: `import { Slot } from '@qwik.dev/core';\n${source}\nexport default () => <Wrapper><p>Projected</p></Wrapper>;\n`,
    });
    // Children is projected content: only <Slot /> renders it, useChildrenInfo() describes it.
    expect(output.diagnostics).toMatchObject([{ code }]);
  });

  test('should describe a q:type fragment as one child', async () => {
    const output = await testInput(mode, 'children-descriptor-fragment', {
      code: `import { component$, Fragment, Slot, useChildrenInfo } from '@qwik.dev/core';
export const List = component$(() => {
  const children = useChildrenInfo();
  return <ul>{children.length}<Slot /></ul>;
});
export default component$(() => (
  <List>
    <Fragment q:type="group">text<b>b</b></Fragment>
    <li q:type="row">y</li>
  </List>
));
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Text alone cannot carry q:type, so a typed fragment groups its content as one entry.
    expect(main).toContain('createSlotScope(null, [{ "type": "group" }, { "type": "row" }])');
    expect(main.match(/registerProjection\(/g)).toHaveLength(2);
  });

  test('should describe children as data a chunk can carry without imports', async () => {
    const output = await testInput(mode, 'children-descriptor-chunk', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export const Child = component$(() => <i>child</i>);
export default component$(() => {
  const tag = useSignal('section');
  const Tag = tag.value;
  return (
    <Tag>
      <button onClick$={() => (tag.value = 'article')} />
      <Child />
    </Tag>
  );
});
`,
    });
    // The descriptor is plain data: the dynamic tag chunk never references the child component.
    const chunk = output.modules.find((module) => module.path.includes('tag_dynamic'))!;
    expect(chunk.code).not.toContain('Child');
  });

  test.each([
    ['text', `export const Cmp = component$(() => <i>{String(useContext(ctx).on)}</i>);`],
    ['attribute', `export const Cmp = component$(() => <i title={useContext(ctx).on} />);`],
    ['branch', `export const Cmp = component$(() => <i>{flag ? useContext(ctx).on : null}</i>);`],
  ])('should diagnose a hook called inside a JSX expression: %s', async (shape, source) => {
    const output = await testInput(mode, `expression-hook-${shape}`, {
      code: `import { component$, createContextId, useContext } from '@qwik.dev/core';
const ctx = createContextId('ctx');
const flag = true;
${source}
`,
    });
    // A JSX expression re-runs from the scheduler; only the component body runs hooks.
    expect(output.diagnostics).toMatchObject([{ code: 'expression-hook' }]);
  });

  test('should describe projected children to a component that calls useChildrenInfo', async () => {
    const output = await testInput(mode, 'children-descriptor', {
      code: `import { component$, Slot, useChildrenInfo, useSignal } from '@qwik.dev/core';
import { Card } from './card';
export const Counter = component$(() => {
  const children = useChildrenInfo();
  return <p>{children.length}<Slot /></p>;
});
export const Plain = component$(() => <p><Slot /></p>);
export default component$(() => {
  const count = useSignal(1);
  return (
    <>
      <Counter><b q:type="bold">x</b>text<Card q:type="card" />{count.value}</Counter>
      <Plain><b>x</b></Plain>
      <Card><b>x</b></Card>
    </>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The parent describes the default projection only to a consumer that calls useChildrenInfo().
    expect(main).toContain(
      'createSlotScope(null, [{ "type": "bold" }, _EMPTY_OBJ, { "type": "card" }, _EMPTY_OBJ])'
    );
    expect(main).not.toContain('q:type');
    // A known consumer that never reads them gets a bare scope; an external one gets a description.
    expect(main.match(/createSlotScope\(\)/g)).toHaveLength(1);
    expect(main).toContain('createSlotScope(null, [_EMPTY_OBJ])');
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
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Wrapper = () => <section><Slot /></section>;
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
export default (props: { items: { id: number; title: string; visible: boolean }[] }) => {
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
export const Done = (props: { title: string }) => <b>{props.title}</b>;
export default (props: { items: { id: string; done: boolean }[]; prefix: string; title: string }) => {
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
      code: `export default (props: { items: { id: string; primary: boolean }[]; visible: boolean; prefix: string }) => <ul>{props.items.map(({ id, primary }, index) => {
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

  test.each([
    ['logical-or', 'return <div>{props.label || <b>none</b>}</div>;', 'content'],
    ['nullish', 'return <div>{props.content ?? <i>empty</i>}</div>;', 'content'],
    ['sequence', 'return <div>{props.label || (count.value, (<b>x</b>))}</div>;', 'content'],
    ['promise', 'return <div>{Promise.resolve(<b>late</b>)}</div>;', 'content'],
    ['function', 'return <div>{() => <b>fn</b>}</div>;', 'content'],
    ['nested-array', "return <div>{[1, [<b>a</b>, 'text'], null]}</div>;", 'static'],
    ['child-array', 'return <div>{[<b>a</b>, count.value]}</div>;', 'static'],
    ['store-member', 'const store = useStore({ v: 1 }); return <div>{store.v}</div>;', 'text'],
    [
      'conditional-array',
      "return <div>{count.value > 1 ? 'text' : [<b>a</b>, <i>b</i>]}</div>;",
      'branch',
    ],
  ] as const)('should classify the dynamic child %s as %s', async (name, body, kind) => {
    const output = await testInput(mode, `dynamic-child-${name}`, {
      code: `import { useSignal, useStore } from '@qwik.dev/core';
export default (props: { label?: string; content?: any }) => {
  const count = useSignal(1);
  ${body}
};`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const helpers = {
      content: ['createContentBlock', 'renderSsrContent'],
      text: ['createTextExpressionEffect', 'renderSsrTextExpression'],
      branch: ['createBranch', 'renderSsrBranch'],
      static: [],
    }[kind];
    if (helpers.length > 0) {
      expect(code).toContain(helpers[mode === 'ssr' ? 1 : 0]);
    }
    // A literal array in render position folds like a fragment instead of a content block.
    if (kind !== 'content') {
      expect(code).not.toContain('createContentBlock');
      expect(code).not.toContain('renderSsrContent');
    }
    if (name === 'nested-array') {
      expect(code).toContain('1<b>a</b>text');
    }
    if (name === 'conditional-array') {
      expect(code).toContain('<b>a</b><i>b</i>');
    }
  });

  test('should bind a prop member as its own source', async () => {
    const output = await testInput(mode, 'prop-sources', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Badge } from './badge';
export const Card = component$((props: { title: string; count: number }) => {
  const heading = props.title;
  return (
    <section class={props.title}>
      <h2>{heading}</h2>
      <Badge label={props.title} />
      <b>{props.count + 1}</b>
    </section>
  );
});
export const Defaulted = component$(({ title = 'Untitled' }: { title?: string }) => <h3>{title}</h3>);
export default component$(() => {
  const count = useSignal(1);
  return <Card title={'n=' + count.value} count={count.value} />;
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // One source per member and render function, shared by the attribute, hole and forward.
    expect(code.match(/propSource\(props, "title"\)/g)).toHaveLength(1);
    expect(code).toContain('"label": prop0');
    // An expression over a member keeps its chunk; a defaulted read keeps its fallback.
    expect(code).toContain('props.count + 1');
    expect(code).toContain('Untitled');
    // The parent registers a computed for a computed prop, not a bare QRL.
    expect(code).toContain('computedProp(');
  });

  test('should lower ordinary statements before a row return', async () => {
    const output = await testInput(mode, 'collection-row-statements', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const rows = useSignal([1]);
  return (
    <ul>
      {rows.value.map((row) => {
        let label = String(row);
        if (row > 1) { label += '!'; }
        function wrap(value: string) { return '[' + value + ']'; }
        label = wrap(label);
        return <li key={row}>{label}</li>;
      })}
      {[1, 2].map((n) => { let doubled = n * 2; doubled += 1; return <li>{doubled}</li>; })}
    </ul>
  );
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The transpiler may requote the authored statement; its shape must survive as written.
    expect(code).toMatch(/label \+= ['"]!['"]/);
    expect(code).toContain('doubled += 1');
  });

  test('should lower referenced and function-expression row callbacks as collections', async () => {
    const output = await testInput(mode, 'collection-callback-shapes', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
function renderDeclared(row: number) {
  return <li key={row}>{row}</li>;
}
export default component$(() => {
  const rows = useSignal([1]);
  const renderLocal = (row: number) => <li key={row}>{row}</li>;
  return (
    <div>
      <ul>{rows.value.map(renderLocal)}</ul>
      <ul>{rows.value.map(renderDeclared)}</ul>
      <ul>{rows.value.map(function (row) { return <li key={row}>{row}</li>; })}</ul>
    </div>
  );
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const collection = mode === 'ssr' ? 'renderSsrCollection' : 'createCollection';
    expect(code.match(new RegExp(`${collection}\\(`, 'g'))).toHaveLength(3);
    expect(code).not.toContain(mode === 'ssr' ? 'renderSsrContent(' : 'createContentBlock(');
  });

  test('should keep a leading newline the parser would drop in pre and textarea', async () => {
    const output = await testInput(mode, 'leading-newline', {
      code: `export default (props: { code: string }) => (
  <div>
    <pre>{props.code}</pre>
    <pre>{'\\nfixed'}</pre>
    <textarea value={props.code} />
  </div>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The static literal doubles at the analyser; a live value doubles when the server writes it.
    expect(code).toContain(String.raw`\n\nfixed`);
    if (mode === 'ssr') {
      expect(code.match(/\.replace\(\/\^\\n\/, '\\n\\n'\)/g)).toHaveLength(2);
    }
  });

  test('should fold several parts of text-only content into one hole', async () => {
    const output = await testInput(mode, 'text-only-content', {
      code: `export default (props: { page: string; line: string; count: number }) => (
  <div>
    <title>{props.page} - Site</title>
    <textarea>{props.line}{props.line}</textarea>
  </div>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Comment markers would render as text inside RCDATA elements.
    expect(code).not.toContain('<!t>');
    expect(code).toContain('`${props.page} - Site`');
  });

  test('should create a dynamic tag inside svg in its namespace', async () => {
    const output = await testInput(mode, 'dynamic-tag-namespace', {
      code: `export default (props: { shape: string }) => (
  <svg viewBox="0 0 10 10">
    <props.shape r="1" />
  </svg>
);`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Only the client creates the node, so only it needs the namespace.
    expect(code).toContain(
      mode === 'ssr'
        ? 'renderSsrDynamicTag(tag0, props0, ctx)'
        : "createDynamicTag(tag0, props0, ctx, 'svg')"
    );
  });

  test('should lift a local function into a segment its callers import', async () => {
    const output = await testInput(mode, 'local-functions', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Reveal } from './reveal';
export default component$(() => {
  const count = useSignal(1);
  const show = useSignal(true);
  function suffix(key: string) { return key + '!'; }
  const label = (key: string) => suffix(key) + count.value;
  async function load(key: string) { return key; }
  const direct = label('d');
  return (
    <Reveal>
      <b onClick$={() => console.log(label('h'))}>{label('x')}</b>
      {show.value && <i>{suffix('y')}</i>}
      {load('z')}
      {direct}
    </Reveal>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    const code = output.modules.map((module) => module.code).join('\n');
    // The body binds each function to its statically imported segment with its captures.
    expect(main).toMatch(
      /function suffix\(\) \{\n\s*return component_suffix_segment_\w+\.apply\(this, arguments\);/
    );
    expect(main).toMatch(
      /const label = \(\.\.\.args\) => _withCaptures\(component_label_segment_\w+, \[count\]\)\(\.\.\.args\);/
    );
    expect(main).toMatch(/function load\(\) \{\n\s*return component_load_segment_\w+\.apply/);
    expect(main).toMatch(/const direct = label\(["']d["']\);/);
    // A caller captures the function's captures, never the function, and rebinds it in its prelude.
    expect(code).not.toMatch(/\.w\(\[[^\]]*\b(label|suffix|load)\b[^\]]*\]\)/);
    expect(code).toMatch(
      /const \[count\] = _captures;\n\s*const label = _withCaptures\(component_label_segment_\w+, \[count\]\);/
    );
    expect(code).toMatch(/const suffix = component_suffix_segment_\w+;/);
    // The lifted async function keeps its authored shape.
    expect(code).toMatch(/export const component_load_segment_\w+ = async \(key\)/);
  });

  test('should register a projection under a dynamic slot name', async () => {
    const output = await testInput(mode, 'projection-dynamic-name', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Card } from './card';
export default component$(() => {
  const side = useSignal('left');
  return (
    <Card>
      <div q:slot={side.value}>content</div>
      <b q:slot="right">fixed</b>
    </Card>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // The client reads the name through a bound static function; the server serializes a QRL.
    expect(main).toMatch(
      mode === 'ssr'
        ? /registerProjection\(slotScope0, q_component_slot_name_segment_\w+\.w\(\[side\]\), /
        : /registerProjection\(slotScope0, \(\) => component_slot_name_segment_\w+\(side\), /
    );
    expect(main).toMatch(/registerProjection\(slotScope0, "right", /);
    // The scope carries the segment its consumer's live slots run.
    expect(main).toMatch(/createSlotScope\(q_component_slot_content_segment_\w+\)/);
    const nameChunk = output.modules.find((module) => module.path.includes('slot_name'))!;
    expect(nameChunk.code).toContain('return side.value;');
  });

  test('should mark every component with the symbol it serializes as', async () => {
    const output = await testInput(mode, 'component-serialization-marker', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
function Body(props: { x: string }) {
  return <p>{props.x}</p>;
}
export const App = component$(Body);
const Hidden = component$(() => <i>hidden</i>);
export const Picker = component$(() => {
  const chosen = useSignal([Hidden]);
  return <b>{chosen.value.length}</b>;
});
export default component$(() => <Picker />);
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Every component, private or not, is exported under its hashed symbol for resume to import.
    expect(main).toMatch(
      /export \{ Body as Body_component_\w+, Hidden as Hidden_component_\w+, Picker as Picker_component_\w+ \};/
    );
    expect(main).toMatch(/export const default_component_\w+ = /);
    expect(main).toMatch(/export default default_component_\w+;/);
    expect(main).toContain('export const App = component$(Body);');
    if (mode === 'ssr') {
      // Only the server serializes: it marks the function with symbol and chunk.
      expect(main).toMatch(/const Hidden = _markComponent\(\(props0, ctx\) => \{/);
      expect(main).toMatch(/_markComponent\(Body, "Body_component_\w+", "\.\/component\.tsx"\);/);
    } else {
      expect(main).not.toContain('_markComponent');
    }
  });

  test('should capture a local component alias used as a tag inside a boundary', async () => {
    const output = await testInput(mode, 'local-component-tag', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { A, B, choose } from './parts';
export default component$(() => {
  const content = useSignal<any[]>([A, B]);
  const show = useSignal(true);
  const Outer = content.value[0];
  const Inner = content.value[1];
  const Picked = choose(content.value);
  return (
    <Outer>
      {show.value && <Inner />}
      <Picked />
    </Outer>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const dynamic = mode === 'ssr' ? 'renderSsrDynamicTag' : 'createDynamicTag';
    // A literal-index alias stays live: the chunk captures the signal and re-reads the tag.
    expect(code).toContain('const tag0 = content.value[1];');
    // A plain const alias rides the captures like any setup local.
    expect(code).toContain('const [Picked] = _captures;');
    expect(code).toContain(`${dynamic}(Picked, `);
  });

  test('should defer plain-value and member tags to the runtime dynamic tag', async () => {
    const output = await testInput(mode, 'component-dynamic-tags', {
      code: `import { Badge, UI } from './ui';
export default (props: { as: string; component: any }) => {
  const Heading = 'h2';
  const Alias = Badge;
  const Chosen = props.as;
  return (
    <section>
      <Heading class="title">static</Heading>
      <Alias />
      <Chosen>chosen</Chosen>
      <UI.Button label="x" />
      <props.component />
    </section>
  );
};`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    const dynamic = mode === 'ssr' ? 'renderSsrDynamicTag' : 'createDynamicTag';
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    expect(main.match(new RegExp(`${dynamic}\\(`, 'g'))).toHaveLength(mode === 'ssr' ? 4 : 2);
    expect(main).toContain(`${dynamic}(Heading, `);
    expect(main).toContain('const tag0 = UI.Button;');
    // An alias of an imported component stays a direct call under its local name.
    expect(main).toContain('createComponent(Alias, ');
    // Tags read through props (directly or via a live alias) re-render inside content ranges.
    const content = mode === 'ssr' ? 'renderSsrContent' : 'createContentBlock';
    expect(main.match(new RegExp(`${content}\\(`, 'g'))).toHaveLength(2);
    expect(main).not.toContain('const Chosen');
    expect(code).toContain('const tag0 = props.as;');
    expect(code).toContain('const tag0 = props.component;');
  });

  test('should render a bare signal child as its tracked value', async () => {
    const output = await testInput(mode, 'text-hole-signal-child', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  return <span>{count}</span>;
};`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain(mode === 'ssr' ? 'renderSsrTextNode(' : 'createTextNodeEffect(');
    expect(code).not.toContain('createContentBlock');
    expect(code).not.toContain('renderSsrContent');
  });

  test('should read a signal held by a row value', async () => {
    const output = await testInput(mode, 'collection-row-signal', {
      code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const signals = useSignal([useSignal(1), useSignal(2)]);
  return <ul>{signals.value.map((signal, index) => <li key={index}>{signal.value}</li>)}</ul>;
};`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules.map((module) => module.code).join('\n')).toContain('signal.value');
  });

  test('should select collection key setup by binding dependencies', async () => {
    const output = await testInput(mode, 'collection-key-const', {
      code: `import { useSignal } from '@qwik.dev/core';
export default (props: { title: string }) => {
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

test('csr mounts a bare-root slot through a marker so the component output stays sync', async () => {
  const output = await testInput('csr', 'bare-root-slot', {
    code: `import { component$, Slot } from '@qwik.dev/core';
export const Wrapper = component$(() => <Slot />);
export const Shell = component$((props: { id: string }) => (
  <div id={props.id}><Slot name="start" /><Slot /><b>{props.id}</b></div>
));
`,
  });
  const code = output.modules.map((module) => module.code).join('\n');
  // The slot resolves asynchronously; a component must never return that promise as its nodes.
  expect(code).not.toContain('return createSlot();');
  // Later sibling locators resolve before the first slot replaces its marker.
  expect(code).toMatch(/const el1 = _last\(el0\);\n(.*\n)*.*createSlot\("start"\)/);
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
