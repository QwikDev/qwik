import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadChunkFunction, loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled as renderToString } from '../../../qwik/src/server/ssr-render';

test.each(['export ', ''])(
  'context setup preserves provider scopes with "%s" components',
  async (prefix) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { createContextId, useSignal, useContextProvider, useContext } from '@qwik.dev/core';
const Counter = createContextId('counter');
${prefix}const Child = () => {
  const count = useContext(Counter);
  return <button onClick$={() => count.value++}>{'<count:' + count.value + '>'}</button>;
};
${prefix}const Nested = () => {
  const count = useSignal(10);
  useContextProvider(Counter, count);
  return <Child />;
};
export default () => {
  const count = useSignal(1);
  useContextProvider(Counter, count);
  return <main><Child /><Nested /><Child /></main>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const received: core.Signal<number>[] = [];
    const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
      ...core,
      useContext(context: core.ContextId<core.Signal<number>>) {
        const count = core.useContext(context);
        received.push(count);
        return count;
      },
      renderSsrTextExpression(...args: Parameters<typeof core.renderSsrTextExpression>) {
        // VM capture arrays must enter the serializer's realm.
        args[2] = Array.from(args[2]);
        return core.renderSsrTextExpression(...args);
      },
    });
    const result = await renderToString(render);
    expect(result.html.match(/&lt;count:\d+&gt;/g)).toEqual([
      '&lt;count:1&gt;',
      '&lt;count:10&gt;',
      '&lt;count:1&gt;',
    ]);
    expect(received).toHaveLength(3);
    expect(received[0]).toBe(received[2]);
    expect(received[1]).not.toBe(received[0]);
    const event = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    const text = output.modules.find((module) => module.segment?.ctxName === 'text')!;
    expect(event.segment!.captureNames).toEqual(['count']);
    expect(text.segment!.captureNames).toEqual(['count']);
    const incrementOuter = loadChunkFunction(event, [received[0]]);
    const incrementInner = loadChunkFunction(event, [received[1]]);
    const readText = loadChunkFunction(text);
    const owner = core.createOwner(null);
    try {
      const labels = core.runWithOwner(owner, () =>
        received.map((count) => core.useComputed(() => readText(count)))
      );
      expect(labels.map((label) => label.value)).toEqual(['<count:1>', '<count:10>', '<count:1>']);
      incrementOuter();
      expect(labels.map((label) => label.value)).toEqual(['<count:2>', '<count:10>', '<count:2>']);
      incrementInner();
      expect(labels.map((label) => label.value)).toEqual(['<count:2>', '<count:11>', '<count:2>']);
    } finally {
      await core.disposeOwner(owner);
    }
  }
);
