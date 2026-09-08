import { component$ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: compiler harness`, () => {
  it('loads generated chunks', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');

    expect(button.textContent).toBe('1');
    cleanup();
  });

  it('shares test-local bindings between render roots', async () => {
    const shared = { count: 0 };
    const First = component$(() => <p>{++shared.count}</p>);
    const Second = component$(() => <p>{shared.count}</p>);
    const first = await render(First);

    expect(first.container.querySelector('p')?.textContent).toBe('1');
    first.cleanup();

    const second = await render(Second);
    expect(second.container.querySelector('p')?.textContent).toBe('1');
    second.cleanup();
  });
});
