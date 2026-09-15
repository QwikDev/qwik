import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: leading newline`, () => {
  it('keeps a leading newline in pre and textarea content', async () => {
    const App = component$(() => {
      const code = useSignal('\nfirst');
      return (
        <section>
          <button onClick$={() => (code.value = '\nsecond')} />
          <pre>{code.value}</pre>
          <pre>{'\nstatic'}</pre>
          <textarea value={code.value} />
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const [live, fixed] = Array.from(container.querySelectorAll('pre'));
    const textarea = container.querySelector('textarea')!;

    expect(live.textContent).toBe('\nfirst');
    expect(fixed.textContent).toBe('\nstatic');
    expect(textarea.textContent).toBe('\nfirst');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(live.textContent).toBe('\nsecond');
    expect(textarea.textContent).toBe('\nsecond');
    cleanup();
  });
});
