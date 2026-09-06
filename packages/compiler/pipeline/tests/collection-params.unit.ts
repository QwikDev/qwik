import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { parseModule } from '../analyse/ast/parse';
import { transformModules } from '../compat/transform-modules';

function loadFunction(module: { path: string; code: string }, captures: unknown[] = []) {
  const declaration = parseModule(module.path, module.code).program.body.find(
    (statement) => statement.type === 'ExportNamedDeclaration'
  )?.declaration;
  if (declaration?.type !== 'VariableDeclaration') {
    throw new Error('expected an exported function');
  }
  const expression = declaration.declarations[0].init!;
  return runInNewContext(`(${module.code.slice(expression.start, expression.end)})`, {
    _captures: captures,
  });
}

test.each([false, true])(
  'empty arms do not affect collection keys or key captures (SSR: %s)',
  async (isServer) => {
    for (const row of [
      'visible ? <li key={key} /> : null',
      'visible ? null : <li key={key} />',
      'visible ? <li key={key} /> : undefined',
      'visible && <li key={key} />',
      'visible && (props.other ? <li key={key} /> : null)',
      'visible ? <li key={key} /> : (props.other ? null : undefined)',
    ]) {
      for (const source of ['items.value', 'props.items']) {
        const output = await transformModules({
          srcDir: 'src',
          isServer,
          transpileTs: true,
          input: [
            {
              path: 'src/component.tsx',
              code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([]);
  return <ul>{${source}.map(({ id }) => {
    const visible = props.visible;
    const key = props.prefix + id;
    return ${row};
  })}</ul>;
};`,
            },
          ],
        });
        expect(output.diagnostics).toEqual([]);
        const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
        expect(key).toBeDefined();
        expect(key.segment!.captureNames).toEqual(['props']);
        const getKey = loadFunction(key, [
          {
            prefix: '#',
            get visible() {
              throw new Error('visibility does not determine row identity');
            },
            get other() {
              throw new Error('empty branches do not determine row identity');
            },
          },
        ]);
        const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        expect(rows.map(getKey)).toEqual(['#a', '#b', '#c']);
        expect([...rows].reverse().map(getKey)).toEqual(['#c', '#b', '#a']);
        expect(key.code).not.toContain('props.visible');
        expect(key.code).not.toContain('props.other');
      }
    }
  }
);

test.each([false, true])(
  'empty arms preserve conditions that choose between keys (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `export default (props) => <ul>{props.items.map(item => props.choose
  ? (props.visible && <li key={item.id + props.a} />)
  : (props.visible ? null : <li key={item.id + props.b} />))}</ul>;`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
    const reads: string[] = [];
    let choose = true;
    const getKey = loadFunction(key, [
      {
        get choose() {
          reads.push('choose');
          return choose;
        },
        get visible() {
          throw new Error('visibility is not part of the key');
        },
        get a() {
          reads.push('a');
          return 'a';
        },
        get b() {
          reads.push('b');
          return 'b';
        },
      },
    ]);
    expect(getKey({ id: '1' })).toBe('1a');
    expect(reads).toEqual(['choose', 'a']);
    choose = false;
    reads.length = 0;
    expect(getKey({ id: '1' })).toBe('1b');
    expect(reads).toEqual(['choose', 'b']);
  }
);

test.each([false, true])(
  'key errors are not hidden by collection visibility (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: 'export default (props) => <ul>{props.items.map(item => item.visible && <li key={item.details.id} />)}</ul>;',
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
    expect(key).toBeDefined();
    const getKey = loadFunction(key);
    expect(getKey({ visible: false, details: { id: 'hidden' } })).toBe('hidden');
    expect(() => getKey({ visible: false, details: null })).toThrow();
    const error = new Error('key failed');
    expect(() =>
      getKey({
        visible: false,
        get details() {
          throw error;
        },
      })
    ).toThrow(error);
  }
);

test.each([false, true])(
  'nested keys visit only conditions and keys on the selected path (SSR: %s)',
  async (isServer) => {
    for (const source of ['items.value', 'props.items']) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        transpileTs: true,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([]);
  return <ul>{${source}.map(({ id }, index) => {
    const prefix = props.prefix;
    const last = prefix + index;
    const title = props.title;
    return props.outer
      ? (props.left ? <li key={id + props.a}>{title}</li> : <li key={id + props.b}>{title}</li>)
      : (props.right ? <li key={id + props.c}>{title}</li> : <li key={last + props.d}>{title}</li>);
  })}</ul>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
      const reads: string[] = [];
      const choices = { outer: true, left: true, right: true };
      const props = {
        prefix: '#',
        get outer() {
          reads.push('outer');
          return choices.outer;
        },
        get left() {
          reads.push('left');
          return choices.left;
        },
        get right() {
          reads.push('right');
          return choices.right;
        },
        get a() {
          reads.push('a');
          return 'A';
        },
        get b() {
          reads.push('b');
          return 'B';
        },
        get c() {
          reads.push('c');
          return 'C';
        },
        get d() {
          reads.push('d');
          return 'D';
        },
      };
      expect(key.segment!.captureNames).toEqual(['props']);
      const getKey = loadFunction(key, [props]);
      for (const [outer, inner, expected, path] of [
        [true, true, 'idA', ['outer', 'left', 'a']],
        [true, false, 'idB', ['outer', 'left', 'b']],
        [false, true, 'idC', ['outer', 'right', 'c']],
        [false, false, '#2D', ['outer', 'right', 'd']],
      ] as const) {
        choices.outer = outer;
        choices.left = choices.right = inner;
        reads.length = 0;
        expect(getKey({ id: 'id' }, 2)).toBe(expected);
        expect(reads).toEqual(path);
      }
      expect(key.code).not.toContain('props.title');
      expect(key.code).not.toContain('<li');
    }
  }
);

test.each([false, true])(
  'conditional keys evaluate only the selected arm (SSR: %s)',
  async (isServer) => {
    for (const setup of [false, true]) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        transpileTs: true,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const selected = useSignal(true);
  return <ul>{props.items.map(({ id }, index) => ${
    setup
      ? `{
    const enabled = selected.value;
    const prefix = props.prefix;
    const title = props.title;
    return`
      : ''
  } ${setup ? 'enabled' : 'selected.value'}
      ? <li key={${setup ? 'prefix' : 'props.prefix'} + id + props.yes}>{props.title}</li>
      : <li key={index + props.no}>{props.title}</li>${setup ? '; }' : ''})}</ul>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const key = output.modules.find((module) => module.segment?.ctxName === 'for:key');
      expect(key).toBeDefined();
      if (key === undefined) {
        return;
      }
      let tests = 0;
      let yes = 0;
      let no = 0;
      let enabled = true;
      const captures = {
        selected: {
          get value() {
            tests++;
            return enabled;
          },
        },
        props: {
          prefix: '#',
          get yes() {
            yes++;
            return '!';
          },
          get no() {
            no++;
            return '?';
          },
        },
      };
      const getKey = loadFunction(
        key,
        key.segment!.captureNames.map((name) => captures[name as keyof typeof captures])
      );
      expect(getKey({ id: 'first' }, 2)).toBe('#first!');
      expect([tests, yes, no]).toEqual([1, 1, 0]);
      enabled = false;
      expect(getKey({ id: 'second' }, 3)).toBe('3?');
      expect([tests, yes, no]).toEqual([2, 1, 1]);
      expect(key.code).not.toContain('props.title');
      expect(key.code).not.toContain('<li');
    }
  }
);

test.each([false, true])(
  'key setup follows const dependencies without executing row-only setup (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([]);
  const fallback = useSignal('fallback');
  return <ul>{items.value.map((item, index) => {
    const unused = props.renderOnly;
    const { [props.field]: id = fallback.value } = item;
    const prefix = props.prefix, title = props.title;
    const key = prefix + id + index + ((unused) => unused)('!');
    return <li key={key}>{title + unused}</li>;
  })}</ul>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
    expect(key.code).not.toContain('props.renderOnly');
    expect(key.code).not.toContain('props.title');
    const captures = {
      props: { field: 'id', prefix: '#' },
      fallback: { value: 'fallback' },
    };
    const getKey = loadFunction(
      key,
      key.segment!.captureNames.map((name) => captures[name as keyof typeof captures])
    );
    expect(getKey({ id: 'first' }, 2)).toBe('#first2!');
    expect(getKey({}, 0)).toBe('#fallback0!');
    captures.fallback.value = 'next';
    expect(getKey({}, 1)).toBe('#next1!');
    const row = output.modules.find((module) => module.segment?.ctxName === 'for:render')!;
    expect(row.code).toContain('props.renderOnly');
    expect(row.code).toContain('props.title');
  }
);

test.each([false, true])(
  'local keys reuse parameter binding patterns and numeric indexes (SSR: %s)',
  async (isServer) => {
    for (const [pattern, read, provided] of [
      ['{ id }', 'id', { id: 'given' }],
      ['[id]', 'id', ['given']],
      ['item = fallback.value', 'item.id', undefined],
      ['{ id } = fallback.value', 'id', undefined],
    ] as const) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        transpileTs: true,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const fallback = useSignal({ id: 'given' });
  return <ul>{props.items.map((${pattern}, index) => {
    const key = ${read} + index;
    return <li key={key}>Row</li>;
  })}</ul>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
      const getKey = loadFunction(key, [{ value: { id: 'given' } }]);
      expect(getKey(provided, 2)).toBe('given2');
    }
  }
);

test.each([false, true])(
  'whole-parameter defaults are lazy and undefined-only (SSR: %s)',
  async (isServer) => {
    for (const [pattern, keyExpression, provided, fallback] of [
      ['item = fallback.value', 'item', 0, 'fallback'],
      ['{ id } = fallback.value', 'id', { id: 0 }, { id: 'fallback' }],
      ['[id] = fallback.value', 'id', [0], ['fallback']],
    ] as const) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        transpileTs: true,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const items = useSignal([]);
  const fallback = useSignal(null);
  return <ul>{items.value.map((${pattern}) => <li key={${keyExpression}}>Row</li>)}</ul>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
      let reads = 0;
      const getKey = loadFunction(key, [
        {
          get value() {
            reads++;
            return fallback;
          },
        },
      ]);
      expect(getKey(provided)).toBe(0);
      expect(reads).toBe(0);
      if (keyExpression === 'item') {
        expect(getKey(null)).toBeNull();
        expect(getKey('')).toBe('');
        expect(getKey(false)).toBe(false);
      } else {
        expect(() => getKey(null)).toThrow();
      }
      expect(reads).toBe(0);
      expect(getKey(undefined)).toBe('fallback');
      expect(reads).toBe(1);
    }
  }
);

test.each([false, true])(
  'key patterns restore captures before defaults (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([]);
  const fallback = useSignal('fallback');
  return <ul>{items.value.map(({ [props.field]: id = fallback.value, copy = id, ...rest }) => <li key={copy + rest.suffix}>{id}</li>)}</ul>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
    const captures = { fallback: { value: 'fallback' }, props: { field: 'id' } };
    const captureNames = key.segment!.captureNames as (keyof typeof captures)[];
    const getKey = loadFunction(
      key,
      captureNames.map((name) => captures[name])
    );
    expect(getKey({ suffix: '!' })).toBe('fallback!');
    expect(getKey({ id: 'given', suffix: '!' })).toBe('given!');
    captures.fallback.value = 'next';
    expect(getKey({ suffix: '?' })).toBe('next?');
  }
);

test.each([false, true])(
  'index defaults are omitted without losing the reactive index (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export default (props) => {
  const items = useSignal([]);
  return <ul>{items.value.map((item, index = props.unused) => <li key={item.id}>{index}</li>)}</ul>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const key = output.modules.find((module) => module.segment?.ctxName === 'for:key')!;
    expect(key.code).not.toContain('props.unused');
    expect(loadFunction(key)({ id: 'given' }, 0)).toBe('given');
    const text = output.modules.find((module) => module.segment?.ctxName === 'text')!;
    expect(text.code).toContain('index.value');
  }
);
