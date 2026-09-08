import { $, component$, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: JSX inside callbacks`, () => {
  it('creates JSX in hooks, explicit QRLs and event-local callbacks', async () => {
    const App = component$(() => {
      const taskType = useSignal('idle');
      const eventType = useSignal('idle');
      const total = useSignal(0);
      const computed = useComputed$(() => <b>computed</b>);
      useTask$(() => {
        const value = <i>task</i>;
        taskType.value = typeof value;
      });
      const factory = $((value: number) => {
        total.value += value;
        return <b>{value}</b>;
      });
      return (
        <main>
          <p id="task">{taskType.value}</p>
          <p id="computed">{typeof computed.value}</p>
          <output>{total.value}</output>
          <button
            onClick$={async () => {
              const native = (value: number) => {
                total.value += value;
                return <i>{value}</i>;
              };
              const nativeValue = native(1);
              const explicitValue = await factory(2);
              const inlineValue = <span>event</span>;
              eventType.value = [typeof nativeValue, typeof explicitValue, typeof inlineValue].join(
                ','
              );
            }}
          >
            {eventType.value}
          </button>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      expect(container.querySelector('#task')?.textContent).toBe('function');
      expect(container.querySelector('#computed')?.textContent).toBe('function');
      expect(container.querySelector('output')?.textContent).toBe('0');
      const button = container.querySelector('button')!;
      expect(button.textContent).toBe('idle');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('function,function,function');
      expect(container.querySelector('output')?.textContent).toBe('3');
      await qwikLoader?.dispatch(button, 'click');
      expect(container.querySelector('output')?.textContent).toBe('6');
    } finally {
      cleanup();
    }
  });
});
