/** Golden snapshots: JSX as a value, branches and dynamic content. */
import { describe, expect, test } from 'vitest';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should hand a module-level JSX value to renderToStream as a JSX value', async () => {
    // the starter entry: the root is JSX, which the compiler hands over as a resumable value
    const output = await testInput(mode, 'jsx-value-root', {
      code: `import { renderToStream } from '@qwik.dev/core/server';
import Root from './root';
export default function (opts) {
  return renderToStream(<Root />, opts);
}`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules[0].code).toMatch(/renderToStream\(q_component_jsx_segment_0_\w+, opts\)/);
  });

  test('should keep a $() inside a conditional JSX value with its own render program', async () => {
    // a helper: each arm is a JSX value whose program extracts the handler, spliced once
    const output = await testInput(mode, 'jsx-value-conditional-handler', {
      code: `import { $ } from '@qwik.dev/core';
export const form = ({ action, onSubmit$, ...rest }) =>
  action
    ? <form {...rest} onSubmit$={[onSubmit$, $(async (_evt, form) => { await action.submit(form); })]} />
    : <form {...rest} onSubmit$={onSubmit$} />;`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules[0].code).toMatch(
      /action \? q_\w+\.w\(\[[^\]]*\]\) : q_\w+\.w\(\[[^\]]*\]\);/
    );
  });

  test('should keep only the arm a build constant decides', async () => {
    const output = await testInput(mode, 'branch-build-constant', {
      code: `import { component$, isServer, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  return (
    <div>
      {isServer ? <button onClick$={() => count.value++}>server only</button> : <b>client</b>}
    </div>
  );
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // the condition and the arm that cannot run leave the artifact, chunks included
    expect(code).not.toContain('branch_condition');
    expect(code).not.toContain(mode === 'ssr' ? 'client' : 'server only');
    expect(output.modules.some((module) => /branch_(then|else)/.test(module.path))).toBe(false);
  });

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

  test('should lower a Suspense boundary to the runtime race', async () => {
    await testInput(mode, 'suspense-boundary', {
      code: `import { component$, useSignal, Suspense } from '@qwik.dev/core';
import { Slow } from './slow';
export default component$(() => {
  const label = useSignal('Loading');
  return (
    <section>
      <Suspense fallback$={() => <p class="fallback">{label.value}</p>} delay={50}>
        <Slow id="one" />
      </Suspense>
    </section>
  );
});`,
    });
  });

  test('should compile an expression-body arrow component', async () => {
    await testInput(mode, 'expression-body-arrow', {
      code: `export default () => <p>Hello Qwik</p>;
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
});
