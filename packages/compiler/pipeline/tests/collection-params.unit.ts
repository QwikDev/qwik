import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { parseModule } from '../analyse/ast/parse';
import { transformModules } from '../compat/transform-modules';

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
    const declaration = parseModule(key.path, key.code).program.body.find(
      (statement) => statement.type === 'ExportNamedDeclaration'
    )?.declaration;
    if (declaration?.type !== 'VariableDeclaration') {
      throw new Error('expected a key function');
    }
    const expression = declaration.declarations[0].init!;
    const captures = { fallback: { value: 'fallback' }, props: { field: 'id' } };
    const captureNames = key.segment!.captureNames as (keyof typeof captures)[];
    const getKey = runInNewContext(`(${key.code.slice(expression.start, expression.end)})`, {
      _captures: captureNames.map((name) => captures[name]),
    });
    expect(getKey({ suffix: '!' })).toBe('fallback!');
    expect(getKey({ id: 'given', suffix: '!' })).toBe('given!');
    captures.fallback.value = 'next';
    expect(getKey({ suffix: '?' })).toBe('next?');
  }
);
