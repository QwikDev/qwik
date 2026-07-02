import { $, Fragment as Component, component$, useAsync$, useSignal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: async component', ({ render }) => {
  it('should track signals read after await in an async component', async () => {
    const Cmp = component$(async () => {
      const count = useSignal(1);
      await Promise.resolve();
      // read after the await: the optimizer turns this fn into a generator so tracking works
      const value = count.value;
      return <button onClick$={() => count.value++}>count: {value + ''}</button>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>count: {'1'}</button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>count: {'2'}</button>
      </Component>
    );
  });

  it('should support hooks after await in an async component', async () => {
    const Cmp = component$(async () => {
      const first = useSignal('first');
      await Promise.resolve();
      const second = useSignal('second');
      const text = first.value + ' ' + second.value;
      return <div>{text}</div>;
    });

    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>{'first second'}</div>
      </Component>
    );
  });

  it('should not track reads after await in a useAsync$ compute', async () => {
    const calls = { compute: 0 };
    const Cmp = component$(() => {
      const count = useSignal(1);
      const data = useAsync$(async () => {
        calls.compute++;
        await Promise.resolve();
        // not wrapped in track(): must stay untracked, and must not subscribe the component
        return count.value;
      });
      const shown = data.value ?? 0;
      return <button onClick$={() => count.value++}>value: {shown + ''}</button>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>value: {'1'}</button>
      </Component>
    );
    const computeCallsAfterRender = calls.compute;

    await trigger(document.body, 'button', 'click');
    // untracked read: no recompute, no component re-render
    expect(calls.compute).toBe(computeCallsAfterRender);
    expect(vNode).toMatchVDOM(
      <Component>
        <button>value: {'1'}</button>
      </Component>
    );
  });

  it('should return user-written generators as-is from QRL calls', async () => {
    // no captures
    const plainQrl = $(function* () {
      yield 1;
      yield 2;
    });
    const plainGen = (await plainQrl()) as unknown as Generator<number>;
    expect([...plainGen]).toEqual([1, 2]);

    // with captures, so the marker must survive the captures wrapper
    const ref = { start: 10 };
    const capturingQrl = $(function* () {
      yield ref.start;
      yield ref.start + 1;
    });
    const capturingGen = (await capturingQrl()) as unknown as Generator<number>;
    expect([...capturingGen]).toEqual([10, 11]);
  });
});
