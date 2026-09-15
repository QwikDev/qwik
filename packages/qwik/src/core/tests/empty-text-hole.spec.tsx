import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: empty text holes`, () => {
  it('updates a hole whose initial value is empty beside other content', async () => {
    const App = component$(() => {
      const label = useSignal('');
      const lone = useSignal('');
      return (
        <section>
          <button onClick$={() => ((label.value = 'set'), (lone.value = 'alone'))} />
          <p>
            <b>x</b>
            {label.value}
          </p>
          <span>{lone.value}</span>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);

    expect(container.querySelector('p')!.textContent).toBe('x');
    expect(container.querySelector('span')!.textContent).toBe('');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('p')!.textContent).toBe('xset');
    expect(container.querySelector('span')!.textContent).toBe('alone');
    cleanup();
  });
});
