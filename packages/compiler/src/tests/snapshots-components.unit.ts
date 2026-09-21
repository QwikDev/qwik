/** Golden snapshots: component targets, props and children. */
import { describe, expect, test } from 'vitest';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should forward an event-named component prop as an ordinary prop', async () => {
    const output = await testInput(mode, 'component-forwarded-handler', {
      code: `import { component$, Slot } from '@qwik.dev/core';
export const Button = component$<any>(({ onClick$, href }: any) => {
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} onClick$={onClick$}>
      <Slot />
    </Tag>
  );
});
export default component$(() => <Button onClick$={() => console.log('go')}>go</Button>);`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should keep an async component body async and await through its setup', async () => {
    const output = await testInput(mode, 'component-async', {
      code: `import { component$ } from '@qwik.dev/core';
import { load } from './load';
export const AsyncCmp = component$(async (props) => {
  const value = await load(props.id);
  return <span id="async-result">{value}</span>;
});
export default component$(() => <div><h1 id="prefix">Prefix</h1><AsyncCmp id="a" /></div>);`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should compile component$ returned from a plain function', async () => {
    await testInput(mode, 'component-factory', {
      code: `import { component$ } from '@qwik.dev/core';
export function factory(Component) {
  return component$((props) => {
    return <div class="wrapped"><Component {...props} /></div>;
  });
}
export const Plain = component$(() => <b>plain</b>);
export const Wrapped = factory(Plain);
export default component$(() => <main><Wrapped label="x" /></main>);`,
    });
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
  test('should treat any tag that does not start lowercase as a component', async () => {
    const output = await testInput(mode, 'component-underscore-tag', {
      code: `import Layout from './layout';
const _Layout = Layout;
function _createContent(props) {
  return <p>{props.text}</p>;
}
export default () => <_Layout><_createContent text="hi" /></_Layout>;`,
    });
    expect(output.diagnostics).toEqual([]);
  });
  test('should keep a body rest of props live like a parameter rest', async () => {
    const output = await testInput(mode, 'component-body-prop-rest', {
      code: `import { Slot } from '@qwik.dev/core';
export const Child = ({ label }) => <section title={label}><Slot /></section>;
export default (props) => {
  const { title: heading = 'heading', ...rest } = props;
  return <Child {...rest} title={heading}><Slot /></Child>;
};`,
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
    // a module binding passed to `$` aliases its export instead of wrapping it
    expect(code).toMatch(/component_fallbackqrl_segment_\w+ = Fallback;/);
    expect(code).toContain('return { a: count.value }');
  });

  test('should render a QRL callback prop the child invokes itself', async () => {
    const output = await testInput(mode, 'component-qrl-prop-call', {
      code: `import { component$ } from '@qwik.dev/core';
export const ProductRelations = component$((props: any) => {
  return <div>{props.render$(['from render$'])}</div>;
});
export default component$(() => (
  <ProductRelations render$={(products: string[]) => <b id="r">{products.join('hi')}</b>} />
));
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should lift a body component a branch arm renders', async () => {
    const output = await testInput(mode, 'component-local-lifted', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export const Footer = component$(() => {
  const n = useSignal(0);
  function Filter({ filter }: { filter: string }) {
    return <li onClick$={() => n.value++}>{filter}</li>;
  }
  return <ul>{n.value > 0 ? <Filter filter="a" /> : null}</ul>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // the arm rebinds the component's own segment; the closure never rides a capture
    expect(code).not.toContain('Filter)');
    expect(code).toMatch(/const Filter = _withCaptures\(\w*Filter\w*, \[n\]\)/);
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
