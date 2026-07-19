import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';
import { useSignal, useComputed$ } from '@qwik.dev/core';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: computed`, () => {
  it('should render computed signal', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <p>{double.value}</p>;
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('0');

    cleanup();
  });

  it('should update signal value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <button onClick$={() => count.value++}>{double.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('2');

    cleanup();
  });

  it('should update mixed signal text', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <button onClick$={() => count.value++}>Count {double.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Count 0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('Count 2');

    cleanup();
  });

  it('should update text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <button onClick$={() => count.value++}>{double.value + 1}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('1');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('3');

    cleanup();
  });

  it('should update multiple text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      const quadruple = useComputed$(() => count.value * 4);
      return (
        <button onClick$={() => count.value++}>
          {count.value}
          {double.value + 1}
          {quadruple.value + 3}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('013');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('137');

    cleanup();
  });
});
