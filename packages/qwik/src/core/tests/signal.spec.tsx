import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';
import { useSignal } from '@qwik.dev/core';

const debug = false;

describe.each([
  { render: ssrRender }, //
  { render: csrRender }, //
])('$name: signals', ({ render }) => {
  it('should render signal', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <p>{count.value}</p>;
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('0');

    cleanup();
  });

  it('should update signal value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });

  it('should update mixed signal text', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>Count {count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Count 0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('Count 1');

    cleanup();
  });

  it('should update text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value + 1}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('1');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('2');

    cleanup();
  });

  it('should update empty text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value > 0 ? count.value : ''}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const button = container.querySelector('button');
    expect(button?.textContent).toBe(render === ssrRender ? ' ' : '');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });
});
