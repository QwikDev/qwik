import { expect, test } from 'vitest';
import { runInNewContext } from 'node:vm';
import { transformModules } from '../transform-modules';
import { parseModule } from '../analyse/ast/parse';
import { createCapturedEvent, setEvent } from '../../../qwik/src/core/dom/event/event';
import { _capturesObj, setCaptures } from '../../../qwik/src/core/shared/qrl/qrl-captures';
import type { CapturedEventHandler, QElement } from '../../../qwik/src/core/shared/types';

async function renderRow(body: string, params = 'row') {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    transpileTs: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const selected = useSignal(0);
  const items = useSignal([{ id: 1 }]);
  return <ul>{items.value.map((${params}) => { ${body} })}</ul>;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  return output.modules.find((module) => module.segment?.ctxName === 'for:render')!.code;
}

test('stores a single row handler without an enclosing array', async () => {
  const code = await renderRow('return <li onClick$={() => console.log(row.id)} />;');
  expect(code).toContain('return createCapturedEvent(');
  expect(code).not.toContain('return [createCapturedEvent(');
  expect(code).toMatch(/setEvent\([^;]+, rowEvent\d+\);/);
});

test('shares handlers capturing only the row and outer collection state', async () => {
  const code = await renderRow(`return <li key={row.id}>
    <button onClick$={() => selected.value = row.id}>select</button>
    <button onClick$={() => selected.value += row.id}>add</button>
  </li>;`);
  expect(code.match(/createCapturedEvent\(/g)).toHaveLength(2);
  expect(code.match(/setEvent\(/g)).toHaveLength(2);
  expect(code).toContain('return [');
  expect(code).toContain('.rowEvents ??=');
  expect(code).toContain('._qEventParam = row;');
  expect(code).not.toContain('_invokeCaptured');
  expect(code).not.toContain('setRowEvent');
  expect(code).not.toContain('findIndex');
  expect(code).not.toContain('getActiveInvokeContext');
});

test('keeps captures derived inside a row on the ordinary event path', async () => {
  const code = await renderRow(`const label = String(row.id);
  return <li key={row.id} onClick$={() => { selected.value = row.id; console.log(label); }} />;`);
  expect(code).toContain('setEvent(');
  expect(code).not.toContain('setRowEvent(');
  expect(code).not.toContain('.rowEvents');
});

test('keeps multi-root rows on the ordinary event path', async () => {
  const code = await renderRow(`return <>
    <li onClick$={() => selected.value = row.id} />
    <li />
  </>;`);
  expect(code).toContain('setEvent(');
  expect(code).not.toContain('setRowEvent(');
  expect(code).not.toContain('.rowEvents');
});

test('assigns row parameters directly to a nested event element', async () => {
  const code = await renderRow(`return <li key={row.id}>
    <span><button onClick$={() => selected.value = row.id}>select</button></span>
  </li>;`);
  expect(code).toContain('._qEventParam = row;');
  expect(code).not.toContain('parentElement');
});

test('keeps the row index before the collection argument', async () => {
  const code = await renderRow(
    `return <li key={row.id}>{index}
      <button onClick$={() => selected.value = row.id}>select</button>
    </li>;`,
    'row, index'
  );
  expect(code).toMatch(/\(ctx, row, index, collection\d+\)/);
  expect(code).toContain('.rowEvents ??=');
});

test.each([1, 2])('shares %i generated handlers independently for each list', async (count) => {
  const code = await renderRow(
    `return <li key={row.id} onClick$={() => selected.value = row.id}
      ${count === 2 ? 'onDblClick$={() => selected.value = row.id}' : ''} />;`
  );
  const body = parseModule('row.js', code).program.body;
  const declaration = body.find((statement) => statement.type === 'ExportNamedDeclaration');
  if (declaration?.declaration?.type !== 'VariableDeclaration') {
    throw new Error('expected a row function');
  }
  const binding = declaration.declaration.declarations[0].id;
  if (binding.type !== 'Identifier') {
    throw new Error('expected a named row function');
  }
  const handlerNames = body.flatMap((statement) =>
    statement.type === 'ImportDeclaration' && statement.source.value !== '@qwik.dev/core'
      ? statement.specifiers.map((specifier) => specifier.local.name)
      : []
  );
  expect(handlerNames).toHaveLength(count);
  const executable = body
    .filter((statement) => statement.type !== 'ImportDeclaration')
    .map((statement) => {
      const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration! : statement;
      return code.slice(node.start, node.end);
    })
    .join('\n');
  const render = runInNewContext(`${executable}\n${binding.name};`, {
    _capturesObj,
    createCapturedEvent,
    setEvent,
    _createElementTemplate: () => () =>
      ({
        isConnected: true,
        ownerDocument: { defaultView: {} },
        closest: () => ({ _ctx: {} }),
      }) as unknown as QElement,
    ...Object.fromEntries(
      handlerNames.map((name) => [
        name,
        (_event: Event, _element: Element, row: { id: number }) => {
          const [selected] = _capturesObj._! as [{ value: number }];
          selected.value = row.id;
        },
      ])
    ),
  });
  const collections = [{}, {}];
  const selected = [{ value: 0 }, { value: 0 }];
  const roots = [0, 0, 1].map((list, index) => {
    setCaptures([selected[list]]);
    return render({ document: {} }, { id: index + 1 }, undefined, collections[list]) as QElement;
  });
  const dispatch = roots.map((root) => root._qDispatch!['e:click'] as CapturedEventHandler);
  expect(dispatch[0]).toBe(dispatch[1]);
  expect(dispatch[0]).not.toBe(dispatch[2]);
  if (count === 2) {
    expect(roots[0]._qDispatch!['e:dblclick']).toBe(roots[1]._qDispatch!['e:dblclick']);
    expect(roots[0]._qDispatch!['e:dblclick']).not.toBe(dispatch[0]);
  }
  for (const index of [2, 1, 0]) {
    dispatch[index]._qRun(dispatch[index], new Event('click'), roots[index]);
  }
  expect(selected).toEqual([{ value: 1 }, { value: 3 }]);
});

for (const isServer of [false, true]) {
  test(`passes row captures as event parameters in ${isServer ? 'SSR' : 'CSR'}`, async () => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import {useSignal} from '@qwik.dev/core';
export default () => {
 const selected=useSignal(0); const rows=useSignal([{id:1}]);
 return <ul>{rows.value.map(row => <li><button onClick$={(event, element) => {selected.value=row.id; console.log(event,element);}}>select</button></li>)}</ul>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const handler = output.modules.find((module) => module.segment?.ctxKind === 'eventHandler')!;
    expect(handler.code).toContain('(event, element, row)');
    expect(handler.segment?.captureNames).toEqual(['selected']);
    const renderer = output.modules.find(
      (module) => module.segment?.ctxName === 'for:render'
    )!.code;
    expect(renderer).not.toContain('_invokeCaptured');
    if (isServer) {
      expect(renderer).toContain('q:p=');
      expect(renderer).toContain('createSsrRootRef(ctx.addRoot(row))');
      expect(renderer).toContain('.m()');
    } else {
      expect(renderer).toContain('._qEventParam = row;');
    }
  });
}

test('keeps rest-parameter handlers on the ordinary capture path', async () => {
  const code = await renderRow(
    `return <li onClick$={(...args) => {selected.value=row.id; console.log(args);}} />;`
  );
  expect(code).not.toContain('._qEventParam');
  expect(code).not.toContain('.rowEvents');
});

test('keeps incompatible sibling handlers on the ordinary capture path', async () => {
  const code = await renderRow(`return <li
    onClick$={() => selected.value = row.id}
    onDblClick$={(...args) => console.log(args)} />;`);
  expect(code).not.toContain('._qEventParam');
  expect(code).not.toContain('.rowEvents');
});
