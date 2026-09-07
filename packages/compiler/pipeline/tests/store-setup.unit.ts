import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadChunkFunction, loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled as renderToString } from '../../../qwik/src/server/ssr-render';

test.each(['props.initial', '() => props.initial'])(
  'store setup preserves options, event captures and reactive text: %s',
  async (initial) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useStore as store } from '@qwik.dev/core';
export default (props) => {
  const state = store(${initial}, props.options);
  return <button onClick$={() => state.count++}>{'<count:' + state.count + '>'}</button>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    let state!: { count: number };
    const options = { deep: false };
    let initializations = 0;
    const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
      ...core,
      renderSsrTextExpression(...args: Parameters<typeof core.renderSsrTextExpression>) {
        // VM capture arrays must enter the serializer's realm.
        args[2] = Array.from(args[2]);
        return core.renderSsrTextExpression(...args);
      },
      store(initialState: { count: number } | (() => { count: number }), received: typeof options) {
        expect(received).toBe(options);
        expect(typeof initialState).toBe(initial.startsWith('()') ? 'function' : 'object');
        initializations++;
        state = core.useStore(initialState, received);
        return state;
      },
    });
    const result = await renderToString(render, { props: { initial: { count: 0 }, options } });
    expect(result.html).toContain('&lt;count:0&gt;</button>');
    expect(initializations).toBe(1);
    const event = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
    const text = output.modules.find((module) => module.segment?.ctxName === 'text')!;
    expect(event.segment!.captureNames).toEqual(['state']);
    expect(text.segment!.captureNames).toEqual(['state']);
    const increment = loadChunkFunction(event, [state]);
    const readText = loadChunkFunction(text);
    const owner = core.createOwner(null);
    let reads = 0;
    try {
      const label = core.runWithOwner(owner, () =>
        core.useComputed(() => {
          reads++;
          return readText(state);
        })
      );
      expect(label.value).toBe('<count:0>');
      expect(label.value).toBe('<count:0>');
      expect(reads).toBe(1);
      increment();
      expect(state.count).toBe(1);
      expect(label.value).toBe('<count:1>');
      expect(reads).toBe(2);
    } finally {
      await core.disposeOwner(owner);
    }
  }
);
