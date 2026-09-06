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
