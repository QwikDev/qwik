import { describe, expect, test } from 'vitest';
import { eventScopeName } from '../analyse/events';
import { transformModules } from '../compat/transform-modules';
import { loadChunkFunction } from './fixtures';

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
      expect(await loadChunkFunction(chunk)()).toBe(expected);
    }
  }
);

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
  });
});
