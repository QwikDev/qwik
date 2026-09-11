import { expect, test } from 'vitest';
import { analyseModule } from '../index';
import { transformModules } from '../compat/transform-modules';
import { deepFreeze, loadDefaultFunction, loadChunkFunction, setupOnlyContext } from './fixtures';
import { QrlBodyKind } from '../schema';
import * as core from '../../../qwik/src/core/index';
import { defaultScheduler } from '../../../qwik/src/core/runtime/scheduler';
import { getActiveInvokeContextOrNull } from '../../../qwik/src/core/runtime/invoke-context';

test('await facts exclude nested functions and survive JSON serialization', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `
import { $ } from '@qwik.dev/core';
export default () => {
  const run = $(async (value = 1) => {
    await Promise.resolve(value);
    const nested = async () => { await Promise.resolve('nested'); };
    const object = { async method() { await Promise.resolve('method'); } };
    return await (await Promise.resolve(2));
  });
  return <button onClick$={run} />;
};`,
    },
    {}
  );
  const restored = deepFreeze(JSON.parse(JSON.stringify(plan)) as typeof plan);
  const qrl = restored.qrls.find((qrl) => qrl.ctxName === '$')!;
  expect(qrl.body.b).toBe(QrlBodyKind.Js);
  if (qrl.body.b !== QrlBodyKind.Js) {
    return;
  }
  const awaits = restored.payloads[qrl.body.payload].awaits;
  expect(awaits.map(({ range }) => restored.source.code.slice(...range))).toEqual([
    'await Promise.resolve(value)',
    'await (await Promise.resolve(2))',
    'await Promise.resolve(2)',
  ]);
});

test.each([
  'async () =>',
  'async (value = props.value) =>',
  'async function (value = props.value)',
  'async function named(value = props.value)',
])('await emission preserves captures, nested awaits and helper aliases: %s', async (head) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { $ } from '@qwik.dev/core';
export default (props) => {
  const run = $(${head} {
    const _await = 'authored';
    const result = await /* comment */ (await Promise.resolve(props.value));
    observe(_await);
    return result;
  });
  return <button onClick$={run} />;
};`,
      },
    ],
  });
  const chunk = output.modules.find((module) => module.segment)!;
  expect(chunk.code).toContain('_await as _await0');
  expect(chunk.code).toContain('/* comment */');
  const seen: unknown[] = [];
  const owner = core.createOwner(null);
  const fn = loadChunkFunction(chunk, [{ value: 7 }], {
    _await0: core._await,
    observe(value: unknown) {
      seen.push(value, getActiveInvokeContextOrNull()?.owner);
    },
  });
  try {
    expect(await core.runWithOwner(owner, fn)).toBe(7);
    expect(seen).toEqual(['authored', owner]);
  } finally {
    await core.disposeOwner(owner);
  }
});

test.each([false, true])(
  'task tracks reads after await, including rejection (reject: %s)',
  async (reject) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `
import { useSignal, useTask$ } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  useTask$(async ({ cleanup }) => {
    try { await Promise.${reject ? 'reject' : 'resolve'}('result'); }
    catch (error) { console.log(error); }
    console.log(count.value);
    cleanup(() => console.log('cleanup'));
  });
  return <span />;
};`,
        },
      ],
    });
    const logs: unknown[] = [];
    const owners: unknown[] = [];
    let count!: core.Signal<number>;
    const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
      ...core,
      get _captures() {
        return core._captures;
      },
      console: {
        log(value: unknown) {
          logs.push(value);
          owners.push(getActiveInvokeContextOrNull()?.owner);
        },
      },
      useSignal(initial: number) {
        count = core.useSignal(initial);
        return count;
      },
    });
    const owner = core.createOwner(null);
    try {
      core.runWithOwner(owner, render, undefined, setupOnlyContext);
      await defaultScheduler.flushInteraction();
      expect(owners.every((seen) => seen === owner)).toBe(true);
      expect(logs).toEqual(reject ? ['result', 1] : [1]);
      count.value = 2;
      await defaultScheduler.flushInteraction();
      expect(logs).toEqual(reject ? ['result', 1, 'cleanup', 'result', 2] : [1, 'cleanup', 2]);
      expect(getActiveInvokeContextOrNull()).toBeNull();
    } finally {
      await core.disposeOwner(owner);
    }
    expect(logs.at(-1)).toBe('cleanup');
  }
);

test('await edits compose with destructured row reads without changing the receiver', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    input: [
      {
        path: 'src/component.tsx',
        code: `export default (props) => <main>{props.rows.map(({ id, read }) =>
  <button key={id} onClick$={async () => { return await read(); }} />)}</main>;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules.map((module) => module.segment?.ctxName)).toContain('onClick$');
  const chunk = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
  let receiver: unknown = 'not called';
  const read = function (this: unknown) {
    receiver = this;
    return Promise.resolve(42);
  };
  const fn = loadChunkFunction(chunk, [{ read }], { _await: core._await });
  expect(await fn()).toBe(42);
  expect(receiver).toBeUndefined();
});
