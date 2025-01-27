import { Fragment as Signal, component$, useSignal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { useSerializer$ } from '../use/use-serialized';

const debug = false; //true;
Error.stackTraceLimit = 100;

// This is almost the same as useComputed, so we only test the custom serialization
describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useSerializer$', ({ render }) => {
  it('should do custom serialization', async () => {
    const Counter = component$(() => {
      const myCount = useSerializer$({
        deserialize: (count?: number) => new CustomSerialized(count),
        serialize: (data) => data.count,
        initial: 2,
      });
      const spy = useSignal(myCount.value.count);
      return (
        <button
          onClick$={() => {
            myCount.value.inc();
            spy.value = myCount.value.count;
          }}
        >
          {spy.value}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'3'}</Signal>
        </button>
      </>
    );
  });
  it('should update reactively', async () => {
    const Counter = component$(() => {
      const sig = useSignal(2);
      const myCount = useSerializer$(() => new CustomSerialized(sig.value));
      const spy = useSignal(myCount.value.count);
      return (
        <button
          onClick$={() => {
            sig.value++;
            spy.value = myCount.value.count;
          }}
        >
          {spy.value}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'3'}</Signal>
        </button>
      </>
    );
  });
});

class CustomSerialized {
  constructor(public count = 0) {}
  inc() {
    this.count++;
  }
}
