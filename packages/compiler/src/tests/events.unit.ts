import { describe, expect, test } from 'vitest';
import { eventModifierName, eventScopeName } from '../analyse/events';
import { transformModules } from '../transform-modules';
import { analyseModule, generateJsSsr, linkPlans } from '../index';
import { EntryKind, LinkResultKind } from '../schema';
import {
  createTestLowerContext,
  deepFreeze,
  loadChunkFunction,
  serverSpecialization,
} from './fixtures';
import { parseModule } from '../analyse/ast/parse';
import { lowerEventAttribute } from '../analyse/lower-event';
import { _await } from '../../../qwik/src/core/reactive/tracking';

test('bodyless handlers are ignored without allocating a QRL', () => {
  const source = 'const view = <button onClick$={function () {}} />;';
  const { program } = parseModule('component.tsx', source);
  const statement = program.body[0];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const element = statement.declarations[0].init;
  if (element?.type !== 'JSXElement') {
    throw new Error('expected JSX');
  }
  const attribute = element.openingElement.attributes[0];
  if (
    attribute.type !== 'JSXAttribute' ||
    attribute.value?.type !== 'JSXExpressionContainer' ||
    attribute.value.expression.type !== 'FunctionExpression'
  ) {
    throw new Error('expected a function handler');
  }
  attribute.value.expression.body = null;
  const { ctx } = createTestLowerContext(program, source);
  expect(lowerEventAttribute(attribute, ctx, 'onClick$', 'q-e:click')).toBeNull();
  expect(ctx.plan.qrls).toEqual([]);
  expect(ctx.plan.payloads).toEqual([]);
});

test.each([false, true])(
  'block handlers preserve control flow and captures (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const count = useSignal(0);
  const title = 'outer';
  return <button onClick$={(event) => {
    let next = count.value;
    for (const step of event.steps) { next += step; }
    if (next > 10) return title;
    function read() { return count.value; }
    { const count = 'inner'; event.reads.push(count); }
    try {
      if (event.fail) throw new Error('failed');
      count.value = next;
      return read();
    } finally {
      event.reads.push('finally');
    }
  }}>go</button>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    expect(chunk.segment!.captureNames).toEqual(['count', 'title']);
    const count = { value: 2 };
    const handler = loadChunkFunction(chunk, [count, 'outer']);
    const event = { steps: [1, 2], reads: [] as string[], fail: false };
    expect(handler(event)).toBe(5);
    expect(count.value).toBe(5);
    expect(event.reads).toEqual(['inner', 'finally']);
    event.steps = [6];
    event.reads = [];
    expect(handler(event)).toBe('outer');
    expect(count.value).toBe(5);
    expect(event.reads).toEqual([]);
    event.steps = [];
    event.fail = true;
    expect(() => handler(event)).toThrow('failed');
    expect(event.reads).toEqual(['inner', 'finally']);
  }
);

test.each([false, true])(
  'block handlers retain empty, implicit and async returns (SSR: %s)',
  async (isServer) => {
    for (const [handler, expected] of [
      ['() => {}', undefined],
      ['() => { 42; }', undefined],
      ['() => { return; // trailing comment\n}', undefined],
      ['async () => { const value = await Promise.resolve(42); return value; }', 42],
    ] as const) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        input: [
          {
            path: 'src/component.tsx',
            code: `export default () => <button onClick$={${handler}}>go</button>;`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
      expect(chunk.segment!.captureNames).toBeUndefined();
      expect(await loadChunkFunction(chunk, [], { _await })()).toBe(expected);
    }
  }
);

test.each([false, true])('handler parameter semantics (SSR: %s)', async (isServer) => {
  for (const { handler, args, expected, captures = [] } of [
    {
      handler:
        '({ nested: { value }, ...rest }, [first, ...tail], ...extra) => [value, rest, first, tail, extra]',
      args: [{ nested: { value: 1 }, label: 'rest' }, [2, 3, 4], 5, 6],
      expected: [1, { label: 'rest' }, 2, [3, 4], [5, 6]],
    },
    {
      handler: '({ value }) => value + fallback',
      args: [{ value: 2 }],
      expected: 9,
      captures: ['fallback'],
    },
    {
      handler: '({ value = fallback } = {}, next = value, ...rest) => [value, next, rest]',
      args: [undefined, undefined, 3],
      expected: [7, 7, [3]],
      captures: ['fallback'],
    },
    {
      handler: '(value = fallback) => value',
      args: [null],
      expected: null,
      captures: ['fallback'],
    },
    {
      handler: '({ value = fallback } = {}) => { value++; return value; }',
      args: [],
      expected: 8,
      captures: ['fallback'],
    },
    {
      handler: '(read = () => fallback) => { const fallback = 99; return [read(), fallback]; }',
      args: [],
      expected: [7, 99],
      captures: ['fallback'],
    },
    {
      handler:
        '(value = fallback, read = () => value) => { var value = 99; return [read(), value]; }',
      args: [],
      expected: [7, 99],
      captures: ['fallback'],
    },
    {
      handler: '({ [fallback]: value }) => value',
      args: [{ 7: 'selected' }],
      expected: 'selected',
      captures: ['fallback'],
    },
    {
      handler: '({ fallback = 3 } = {}) => fallback',
      args: [],
      expected: 3,
    },
    {
      handler:
        'async ({ value = fallback } = {}, ...args0) => { return await Promise.resolve([value, args0]); }',
      args: [undefined, 2],
      expected: [7, [2]],
      captures: ['fallback'],
    },
  ]) {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `export default () => {
  const fallback = 7;
  return <button onClick$={${handler}}>go</button>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    expect(chunk.segment!.captureNames ?? [], handler).toEqual(captures);
    expect(
      await loadChunkFunction(
        chunk,
        captures.map(() => 7),
        { _await }
      )(...args)
    ).toEqual(expected);
  }
});

test.each([false, true])('handler defaults retain parameter TDZ (SSR: %s)', async (isServer) => {
  for (const handler of [
    '(first = later, later = fallback) => first',
    '(first = first, later = fallback) => first',
  ]) {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `export default () => {
  const fallback = 7;
  return <button onClick$={${handler}}>go</button>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    expect(() => loadChunkFunction(chunk, [7])()).toThrow(/before initialization/);
  }
});

test.each([false, true])(
  'event handlers capture live component props (SSR: %s)',
  async (isServer) => {
    for (const { handler, captures, expected, expectedAfterUpdate } of [
      {
        handler: '() => input.onSave$(input.id + suffix)',
        captures: ['suffix', 'input'],
        expected: 'first!',
        expectedAfterUpdate: 'second!',
      },
      {
        handler: '(value = input.id) => value',
        captures: ['input'],
        expected: 'first',
        expectedAfterUpdate: 'second',
      },
      {
        handler: '({ value = input.id } = {}) => { return input.onSave$(value + suffix); }',
        captures: ['suffix', 'input'],
        expected: 'first!',
        expectedAfterUpdate: 'second!',
      },
      {
        handler:
          '(read = () => input.id) => { const input = { id: "shadow" }; return [read(), input.id]; }',
        captures: ['input'],
        expected: ['first', 'shadow'],
        expectedAfterUpdate: ['second', 'shadow'],
      },
      {
        handler:
          'async (value = input.id) => { await Promise.resolve(); return input.onSave$(value); }',
        captures: ['input'],
        expected: 'first',
        expectedAfterUpdate: 'second',
      },
      {
        handler: '(input = { id: "shadow" }) => input.id',
        captures: [],
        expected: 'shadow',
        expectedAfterUpdate: 'shadow',
      },
    ]) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        input: [
          {
            path: 'src/component.tsx',
            code: `export default (input) => {
  const suffix = '!';
  return <button onClick$={${handler}}>save</button>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
      expect(chunk.segment!.captureNames ?? [], handler).toEqual(captures);
      const input = { id: 'first', onSave$: (value: string) => value };
      const invoke = loadChunkFunction(
        chunk,
        captures.map((name) => (name === 'input' ? input : '!')),
        { _await }
      );
      expect(await invoke()).toEqual(expected);
      input.id = 'second';
      expect(await invoke()).toEqual(expectedAfterUpdate);
    }
  }
);

test.each([false, true])(
  'row handlers materialize captured aliases (SSR: %s)',
  async (isServer) => {
    for (const { handler, expected, updated } of [
      {
        handler: '() => [id, label, index]',
        expected: ['a', 'Alpha', 0],
        updated: ['b', 'Beta', 2],
      },
      {
        handler: '() => ({ id, label, index })',
        expected: { id: 'a', label: 'Alpha', index: 0 },
        updated: { id: 'b', label: 'Beta', index: 2 },
      },
      {
        handler:
          '() => { const read = (id, index) => ({ id, index }); return [id, label, index, read("shadow", 9)]; }',
        expected: ['a', 'Alpha', 0, { id: 'shadow', index: 9 }],
        updated: ['b', 'Beta', 2, { id: 'shadow', index: 9 }],
      },
      {
        handler: '(value = id, position = index) => [value, label, position]',
        expected: ['a', 'Alpha', 0],
        updated: ['b', 'Beta', 2],
      },
      {
        handler: '(value = { id, label, index }) => value',
        expected: { id: 'a', label: 'Alpha', index: 0 },
        updated: { id: 'b', label: 'Beta', index: 2 },
      },
      {
        handler: 'async () => { await Promise.resolve(); return [id, label, index]; }',
        expected: ['a', 'Alpha', 0],
        updated: ['b', 'Beta', 2],
      },
      {
        handler: 'function () { return [id, label, index]; }',
        expected: ['a', 'Alpha', 0],
        updated: ['b', 'Beta', 2],
      },
      {
        handler: 'function read(value = id) { return [value, label, index, arguments.length]; }',
        expected: ['a', 'Alpha', 0, 0],
        updated: ['b', 'Beta', 2, 0],
      },
    ]) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const rows = useSignal([]);
  return <ul>{rows.value.map(({ id, label }, index) => <button key={id} title={JSON.stringify({ id, label, index })} onClick$={${handler}}>read</button>)}</ul>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
      expect(chunk.segment!.captureNames).toEqual(['item', 'index']);
      const row = { id: 'a', label: 'Alpha' };
      const index = { value: 0 };
      const invoke = loadChunkFunction(chunk, [row, index], { _await });
      const titleChunk = output.modules.find((module) => module.segment?.ctxName === 'title')!;
      const readTitle = loadChunkFunction(titleChunk);
      expect(readTitle(row, index)).toBe(JSON.stringify({ id: 'a', label: 'Alpha', index: 0 }));
      expect(await invoke(), handler).toEqual(expected);
      row.id = 'b';
      row.label = 'Beta';
      index.value = 2;
      expect(await invoke(), handler).toEqual(updated);
    }
  }
);

test.each([false, true])('alias calls preserve authored receivers (SSR: %s)', async (isServer) => {
  for (const [handler, expected] of [
    ['() => save()', 'bare'],
    ['() => (save)()', 'bare'],
    ['() => save?.()', 'bare'],
    ['() => save`tag`', 'bare'],
    ['(value = save()) => value', 'bare'],
    ['() => api.save()', 'api'],
    ['() => save.call(api)', 'api'],
    ['() => { const save = () => "shadow"; return [save(), api.save()]; }', ['shadow', 'api']],
  ] as const) {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const rows = useSignal([]);
  return <ul>{rows.value.map(({ id, save, api }) => <button key={id} title={save()} onClick$={${handler}}>save</button>)}</ul>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    function save(this: { name: string } | undefined) {
      return this === undefined ? 'bare' : this.name;
    }
    const row = { name: 'row', save, api: { name: 'api', save } };
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    expect(chunk.segment!.captureNames).toEqual(['item']);
    expect(loadChunkFunction(chunk, [row])(), handler).toEqual(expected);
    const title = output.modules.find((module) => module.segment?.ctxName === 'title')!;
    expect(loadChunkFunction(title)(row)).toBe('bare');
    if (handler === '() => save?.()') {
      expect(loadChunkFunction(chunk, [{ save: null }])()).toBeUndefined();
    }
  }
});

test.each([false, true])(
  'native function handlers preserve their scope (SSR: %s)',
  async (isServer) => {
    for (const { handler, args, expected, captures = [] } of [
      {
        handler: 'function (value) { return [this.label, arguments.length, value]; }',
        args: [3, 4],
        expected: ['receiver', 2, 3],
      },
      {
        handler:
          'function factorial(value) { return value <= 1 ? 1 : value * factorial(value - 1); }',
        args: [4],
        expected: 24,
      },
      {
        handler: 'function (value) { return [this.label, props.label, arguments.length, value]; }',
        args: [3],
        expected: ['receiver', 'outer', 1, 3],
        captures: ['props'],
      },
      {
        handler:
          'function named({ value = props.label } = {}, ...rest) { return [this.label, value, rest, arguments.length]; }',
        args: [undefined, 3],
        expected: ['receiver', 'outer', [3], 2],
        captures: ['props'],
      },
      {
        handler:
          'function (read = () => props.label) { const props = { label: "inner" }; return [read(), props.label]; }',
        args: [],
        expected: ['outer', 'inner'],
        captures: ['props'],
      },
      {
        handler:
          'async function named(value = props.label) { await Promise.resolve(); return [this.label, arguments.length, value]; }',
        args: [],
        expected: ['receiver', 0, 'outer'],
        captures: ['props'],
      },
      {
        handler: 'function (props) { return props.label; }',
        args: [{ label: 'parameter' }],
        expected: 'parameter',
      },
    ]) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        input: [
          {
            path: 'src/component.tsx',
            code: `export default (props) => <button onClick$={${handler}}>save</button>;`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
      expect(chunk.segment!.ctxKind).toBe('eventHandler');
      expect(chunk.segment!.captureNames ?? []).toEqual(captures);
      const invoke = loadChunkFunction(
        chunk,
        captures.map(() => ({ label: 'outer' })),
        { _await }
      );
      expect(await invoke.call({ label: 'receiver' }, ...args), handler).toEqual(expected);
    }
  }
);

test.each([false, true])(
  'named handlers retain captures through their self reference (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `export default (props) =>
  <button onClick$={function read(value) { return value ? props.label : read; }} />;`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    const captures = [{ label: 'outer' }];
    const read = loadChunkFunction(chunk, captures)(false);
    captures[0] = { label: 'different invocation' };
    expect(read(true)).toBe('outer');
  }
);

test.each(['function () { return this; }', 'function read(value = props.label) { return this; }'])(
  'function handler preserves strict receivers: %s',
  async (handler) => {
    const output = await transformModules({
      srcDir: 'src',
      input: [
        {
          path: 'src/component.tsx',
          code: `export default (props) => <button onClick$={${handler}} />;`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    const invoke = loadChunkFunction(chunk, [{ label: 'outer' }]);
    expect(invoke()).toBeUndefined();
    expect(invoke.call(null)).toBeNull();
    expect(invoke.call(3)).toBe(3);
  }
);

test('generator handlers remain explicitly unsupported', async () => {
  await expect(
    transformModules({
      srcDir: 'src',
      input: [
        {
          path: 'src/component.tsx',
          code: 'export default () => <button onClick$={function* () { yield 1; }} />;',
        },
      ],
    })
  ).rejects.toThrow('a generator QRL callback');
});

test('captured parameter plans survive serialization and immutable linking', async () => {
  const plan = await analyseModule(
    {
      path: 'src/component.tsx',
      code: `export default (props) => {
  const fallback = 7;
  return <button onClick$={function read(value = props.initial + fallback) { return value; }} />;
};`,
    },
    {}
  );
  const frozen = deepFreeze(JSON.parse(JSON.stringify(plan)));
  const linked = linkPlans(
    [frozen],
    [{ kind: EntryKind.Module, module: plan.path }],
    serverSpecialization(),
    { edges: {} },
    { claims: [], policies: [], emissions: [] },
    true
  );
  expect(linked.kind).toBe(LinkResultKind.Linked);
  if (linked.kind !== LinkResultKind.Linked) {
    throw new Error('expected linked handler');
  }
  const output = await generateJsSsr(deepFreeze(JSON.parse(JSON.stringify(linked.plan))), {});
  const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
  expect(chunk.segment!.captureNames).toEqual(['fallback', 'props']);
  expect(loadChunkFunction(chunk, [7, { initial: 2 }])()).toBe(9);
  expect(frozen).toEqual(plan);
});

test('compiles JSX in event parameter defaults', async () => {
  await expect(
    transformModules({
      srcDir: 'src',
      input: [
        {
          path: 'src/component.tsx',
          code: 'export default () => <button onClick$={(value = <span />) => value} />;',
        },
      ],
    })
  ).resolves.toMatchObject({ diagnostics: [] });
});

describe('eventScopeName', () => {
  test('element events map to q-e: scope keys', () => {
    expect(eventScopeName('onClick$')).toBe('q-e:click');
    expect(eventScopeName('onDblClick$')).toBe('q-e:dblclick');
    expect(eventScopeName('onKeyDown$')).toBe('q-e:keydown');
    expect(eventScopeName('on-CustomEvent$')).toBe('q-e:-custom-event');
    expect(eventScopeName('onDOMContentLoaded$')).toBe('q-e:-d-o-m-content-loaded');
  });

  test('non-event names pass through as attributes', () => {
    expect(eventScopeName('onClick')).toBe(null);
    expect(eventScopeName('online$')).toBe(null);
    expect(eventScopeName('title')).toBe(null);
    expect(eventScopeName('window:online$')).toBe(null);
  });

  test('window and document events map to their scope keys', () => {
    expect(eventScopeName('window:onDblClick$')).toBe('q-w:dblclick');
    expect(eventScopeName('document:onScroll$')).toBe('q-d:scroll');
  });

  test('passive events select the passive scope key', () => {
    const passive = new Set(['scroll']);
    expect(eventScopeName('onScroll$', passive)).toBe('q-ep:scroll');
    expect(eventScopeName('window:onScroll$', passive)).toBe('q-wp:scroll');
    expect(eventScopeName('document:onScroll$', passive)).toBe('q-dp:scroll');
    expect(eventScopeName('onClick$', passive)).toBe('q-e:click');
  });
});

describe('eventModifierName', () => {
  test('modifiers normalize their event name', () => {
    expect(eventModifierName('preventdefault:dblClick')).toBe('preventdefault:dblclick');
    expect(eventModifierName('stoppropagation:click')).toBe('stoppropagation:click');
    expect(eventModifierName('capture:click')).toBe('capture:click');
    expect(eventModifierName('title')).toBe(null);
  });
});

describe('handler lists', () => {
  const HEAD = `import { component$, $ } from '@qwik.dev/core';
import spaInit from './spa-init';
import { linkPrefetchInit } from './link-prefetch';
`;

  async function main(jsx: string, isServer = false) {
    const output = await transformModules({
      srcDir: 'src',
      transpileTs: true,
      transpileJsx: true,
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `${HEAD}export default component$(() => {\n  return ${jsx};\n});\n`,
        },
      ],
    });
    return {
      code: output.modules.find((module) => module.path === 'src/component.tsx')!.code,
      chunks: output.modules.filter((module) => module.segment !== null).length,
    };
  }

  test('a module binding is already a handler, so it stands as written', async () => {
    const { code, chunks } = await main(`<b onClick$={spaInit}></b>`);

    expect(code).toContain('setEvent(el0, "q-e:click", spaInit)');
    expect(chunks).toBe(0);
  });

  test('a list of module bindings keeps the authored order and allocates nothing', async () => {
    const { code, chunks } = await main(
      `<script document:onQCInit$={[spaInit, linkPrefetchInit]}></script>`
    );

    expect(code).toContain('setEvent(el0, "q-d:qcinit", [spaInit, linkPrefetchInit])');
    expect(chunks).toBe(0);
  });

  test('every extracted handler in a list gets its own chunk', async () => {
    const { chunks } = await main(
      `<button onClick$={[$(() => { document.title = 'a'; }), () => { document.title = 'b'; }]}></button>`
    );

    expect(chunks).toBe(2);
  });

  test('a list mixing an extracted handler with a module binding emits both in place', async () => {
    const { code, chunks } = await main(
      `<u onClick$={[$(() => { document.title = 'f'; }), spaInit]}></u>`
    );

    expect(code).toMatch(/setEvent\(el0, "q-e:click", \[component_qrl_segment_0_\w+, spaInit\]\)/);
    expect(chunks).toBe(1);
  });

  test('the server prints the same list through its event attribute', async () => {
    const { code } = await main(
      `<script document:onQCInit$={[spaInit, linkPrefetchInit]}></script>`,
      true
    );

    expect(code).toContain('eventAttrParts("q-d:qcinit", [spaInit, linkPrefetchInit])');
  });
});
