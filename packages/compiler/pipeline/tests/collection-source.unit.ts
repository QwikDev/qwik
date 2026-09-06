import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { ComputedQrl } from '../../../qwik/src/core/reactive/computed-qrl';
import { _wrapArray, useSignal } from '../../../qwik/src/core/reactive/public-api';
import { createOwner, disposeOwner, runWithOwner } from '../../../qwik/src/core/runtime/owner';
import { _captures, createQRL } from '../../../qwik/src/core/shared/qrl/qrl-class';
import { retryOnPromise } from '../../../qwik/src/core/shared/utils/promises';
import { parseModule } from '../analyse/ast/parse';
import { analyseModule } from '../analyse/analyse-module';
import { transformModules } from '../compat/transform-modules';
import { ModuleKind } from '../schema';

test('a derived source without a key produces a spanned diagnostic', async () => {
  const plan = await analyseModule(
    {
      path: 'src/component.tsx',
      code: 'export default (props) => <ul>{props.items.map((item) => <li>{item.id}</li>)}</ul>;',
    },
    {}
  );
  expect(plan.kind).toBe(ModuleKind.Failed);
  expect(plan.diagnostics).toHaveLength(1);
  expect(plan.diagnostics[0]).toMatchObject({
    code: 'for-key',
    message: 'A derived collection requires a row key',
  });
  expect(plan.diagnostics[0].span).not.toBeNull();
});

test.each([false, true])(
  'derived source QRL preserves captures and tracking (SSR: %s)',
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
  const items = useSignal([]);
  return <ul>{items.value.filter((item) => item.visible).map((item) => <li key={item.id}>{item.id}</li>)}</ul>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules[0].code.match(/_wrapArray\(/g)).toHaveLength(1);
    const chunk = output.modules.find((module) => module.segment?.ctxName === 'collection:source')!;
    const declaration = parseModule(chunk.path, chunk.code).program.body.find(
      (statement) => statement.type === 'ExportNamedDeclaration'
    )?.declaration;
    if (declaration?.type !== 'VariableDeclaration') {
      throw new Error('expected a collection source function');
    }
    const expression = declaration.declarations[0].init!;
    const compute = runInNewContext(`(${chunk.code.slice(expression.start, expression.end)})`, {
      get _captures() {
        return _captures;
      },
    });
    const items = useSignal([
      { id: 1, visible: true },
      { id: 2, visible: false },
    ]);
    const owner = createOwner(null);
    let loads = 0;
    const qrl = createQRL<() => readonly { id: number; visible: boolean }[]>(
      'source',
      chunk.segment!.name,
      null,
      async () => {
        loads++;
        return { [chunk.segment!.name]: compute };
      },
      null
    ).w([items]);
    try {
      const source = runWithOwner(owner, () => _wrapArray(qrl));
      expect(source).toBeInstanceOf(ComputedQrl);
      if (!(source instanceof ComputedQrl)) {
        throw new Error('expected a reactive collection source');
      }
      expect(await retryOnPromise(() => source.value)).toEqual([{ id: 1, visible: true }]);
      items.value = [{ id: 3, visible: true }];
      expect(source.value).toEqual([{ id: 3, visible: true }]);
      expect(loads).toBe(1);
    } finally {
      disposeOwner(owner);
    }
  }
);
