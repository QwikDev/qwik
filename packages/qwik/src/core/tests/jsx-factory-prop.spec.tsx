import { component$, useSignal, type JSXOutput } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;
type Factory = (value: number) => JSXOutput | Promise<JSXOutput>;

describe(`${name}: JSX factory props`, () => {
  it('invokes serialized prop and children factories with their captures', async () => {
    const Probe = component$((props: { factory?: Factory; children?: Factory }) => {
      const resultType = useSignal('idle');
      return (
        <button
          onClick$={async () => {
            const factory = props.factory ?? props.children!;
            resultType.value = typeof (await factory(2));
          }}
        >
          {resultType.value}
        </button>
      );
    });
    const App = component$(() => {
      const total = useSignal(0);
      return (
        <main>
          <output>{total.value}</output>
          <Probe
            factory={(value) => {
              total.value += value;
              return <b>{value}</b>;
            }}
          />
          <Probe>
            {(value: number) => {
              total.value += value * 10;
              return <i>{value}</i>;
            }}
          </Probe>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(container.querySelector('output')?.textContent).toBe('0');
      expect(buttons.map((button) => button.textContent)).toEqual(['idle', 'idle']);
      await qwikLoader?.dispatch(buttons[0], 'click');
      expect(buttons[0].textContent).toBe('function');
      expect(container.querySelector('output')?.textContent).toBe('2');
      await qwikLoader?.dispatch(buttons[1], 'click');
      expect(buttons[1].textContent).toBe('function');
      expect(container.querySelector('output')?.textContent).toBe('22');
      await qwikLoader?.dispatch(buttons[0], 'click');
      expect(container.querySelector('output')?.textContent).toBe('24');
    } finally {
      cleanup();
    }
  });
});
