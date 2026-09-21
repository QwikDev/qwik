/** Golden snapshots: collections and their rows. */
import { describe, expect, test } from 'vitest';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should pass through a foreign TypeScript module', async () => {
    await testInput(mode, 'foreign-passthrough-ts', {
      path: 'src/plain.ts',
      code: `const value: number = 1;
export default value;
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
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>Item</li>)}</ul>;
});
`,
    });
  });

  test('should render a reactive text hole inside a collection row', async () => {
    await testInput(mode, 'collection-reactive-row', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>{item.label}</li>)}</ul>;
});
`,
    });
  });

  test('should wire a row event handler capturing the loop item', async () => {
    await testInput(mode, 'collection-row-event', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
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
});
`,
    });
  });

  test('should materialize collection aliases in event handlers', async () => {
    await testInput(mode, 'collection-event-aliases', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
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
});`,
    });
  });

  test('should preserve receivers when calling collection aliases', async () => {
    await testInput(mode, 'collection-alias-calls', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const rows = useSignal([]);
  return <ul>{rows.value.map(({ id, save, api }) => <li key={id}>
    <button title={save()} onClick$={() => save()}>save</button>
    <button onClick$={(value = save?.()) => [value, (save)(), api.save()]}>optional</button>
  </li>)}</ul>;
});`,
    });
  });

  test('should give a capture-less row handler the plain ctx signature', async () => {
    await testInput(mode, 'collection-row-event-plain', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
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
});
`,
    });
  });

  test('should render a literal array collection with an inline row', async () => {
    await testInput(mode, 'collection-array-source', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$(() => {
  return <ul>{['first', 'second'].map(() => <li>Item</li>)}</ul>;
});
`,
    });
  });

  test('should renumber rows through a reactive index param', async () => {
    await testInput(mode, 'collection-index-signal', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map((item, index) => <li key={item.id}>{index}</li>)}</ul>;
});
`,
    });
  });

  test('should wrap a fragment row in a comment marker range', async () => {
    await testInput(mode, 'collection-fragment-row', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <>{item.label}<b>!</b></>)}</ul>;
});
`,
    });
  });

  test('should wrap a text-only fragment row in a comment marker range', async () => {
    await testInput(mode, 'collection-text-row', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <>{item.label}</>)}</ul>;
});
`,
    });
  });

  test('should interpolate lexical loop params in an inline array row', async () => {
    await testInput(mode, 'collection-array-index', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$(() => {
  return <ul>{['first', 'second'].map((item, index) => <li>{index}:{item}</li>)}</ul>;
});
`,
    });
  });

  test('should reconcile an unkeyed reactive collection by position', async () => {
    await testInput(mode, 'collection-unkeyed', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ label: 'Alpha' }]);
  return <ul>{items.value.map((item) => <li>{item.label}</li>)}</ul>;
});
`,
    });
  });

  test('should destructure the row param into member reads', async () => {
    await testInput(mode, 'collection-destructured-param', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map(({ id, label }) => <li key={id}>{label}</li>)}</ul>;
});
`,
    });
  });

  test('should rewrite destructured names inside an opaque row expression', async () => {
    await testInput(mode, 'collection-destructured-opaque', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return <ul>{items.value.map(({ id, label }) => <li key={id}>{label + '!' + id}</li>)}</ul>;
});
`,
    });
  });

  test('should bind a dynamic class on a collection row root', async () => {
    await testInput(mode, 'collection-row-dynamic-class', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([{ id: 'a', label: 'Alpha', done: false }]);
  return <ul>{items.value.map((item) => <li key={item.id} class={item.done ? 'done' : 'todo'}>{item.label}</li>)}</ul>;
});
`,
    });
  });

  test('should render a reactive expression inside an inline array row', async () => {
    await testInput(mode, 'collection-inline-signal-text', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  return <ul>{['a', 'b'].map((item) => <li>{item + count.value}</li>)}</ul>;
});
`,
    });
  });

  test('should render a props read inside an inline array row', async () => {
    await testInput(mode, 'collection-inline-props-text', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$((props) => {
  return <ul>{['a', 'b'].map((item) => <li>{props.title + item}</li>)}</ul>;
});
`,
    });
  });

  test('should set attributes read from an inline array row once', async () => {
    const output = await testInput(mode, 'collection-inline-row-attr', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$(() => {
  return <ul>{['a', 'b'].map((item) => <li id={'row-' + item} class={item}>x</li>)}</ul>;
});
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
      code: `import { component$ } from '@qwik.dev/core';
const prefix = 'p-';
export default component$(() => {
  return <ul>{['a', 'b'].map((item) => <li>{prefix + item}</li>)}</ul>;
});
`,
    });
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
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { items: { id: number; title: string; visible: boolean }[] }) => {
  const items = useSignal([{ id: 1, title: 'Title', visible: true }]);
  return <ul>{${source}.map(${params} => <li key={item.id}>{${text}}</li>)}</ul>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['object', '{ id, details: { title = fallback.value }, ...rest }', 'title + rest.suffix'],
    ['array', '[id, , title = fallback.value, ...rest]', 'title + rest.length'],
  ])('should destructure collection parameters: %s', async (kind, pattern, text) => {
    const output = await testInput(mode, `collection-param-${kind}`, {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([]);
  const fallback = useSignal('Untitled');
  return <ul>{items.value.map((${pattern}) => <li key={id} onClick$={() => console.log(title)}>{${text}}</li>)}</ul>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test.each([
    ['identifier', 'item = fallback.value', 'item.id', 'item.title'],
    ['object', '{ id, title } = fallback.value', 'id', 'title'],
    ['array', '[id, title] = fallback.value', 'id', 'title'],
  ])('should default collection parameters: %s', async (kind, pattern, key, title) => {
    const output = await testInput(mode, `collection-param-default-${kind}`, {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const items = useSignal([]);
  const fallback = useSignal(null);
  return <ul>{items.value.map((${pattern}) => <li key={${key}} onClick$={() => console.log(${title})}>{${title}}</li>)}</ul>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should keep collection keys independent of empty arms', async () => {
    const output = await testInput(mode, 'collection-key-empty-arms', {
      code: `import { component$ } from '@qwik.dev/core';
export default component$((props: { items: { id: string; primary: boolean }[]; visible: boolean; prefix: string }) => <ul>{props.items.map(({ id, primary }, index) => {
  const visible = props.visible;
  const key = props.prefix + id;
  return primary
    ? (visible ? <li key={key}>{id}</li> : null)
    : visible && <li key={index}>{id}</li>;
})}</ul>);`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should key nested conditional collection arms', async () => {
    const output = await testInput(mode, 'collection-key-nested-conditional', {
      code: `import { component$ } from '@qwik.dev/core';
export const Primary = component$(() => <b>Primary</b>);
export default component$((props) => <ul>{props.items.map(({ id, primary, secondary }, index) => {
  const prefix = props.prefix;
  const key = prefix + id;
  return primary ? <Primary key={key} /> : (
    secondary ? <li key={id}>Secondary</li> : <li key={index}>Other</li>
  );
})}</ul>);`,
    });
    expect(output.diagnostics).toEqual([]);
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

  test('should read a signal held by a row value', async () => {
    const output = await testInput(mode, 'collection-row-signal', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const signals = useSignal([useSignal(1), useSignal(2)]);
  return <ul>{signals.value.map((signal, index) => <li key={index}>{signal.value}</li>)}</ul>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules.map((module) => module.code).join('\n')).toContain('signal.value');
  });

  test('should select collection key setup by binding dependencies', async () => {
    const output = await testInput(mode, 'collection-key-const', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$((props: { title: string }) => {
  const items = useSignal([]);
  const separator = useSignal(':');
  return <ul>{items.value.map(({ id, type }, index) => {
    const prefix = type + separator.value, title = props.title;
    const key = prefix + id + index;
    return <li key={key}>{title}</li>;
  })}</ul>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });
});
