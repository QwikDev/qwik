import { useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: branching', ({ render }) => {
  it('switches ternary branches while scalar effects update the active branch', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return (
        <section>
          <button onClick$={() => count.value++}>inc</button>
          <button onClick$={() => (count.value = 0)}>reset</button>
          {count.value === 0 ? (
            <p id="zero">Zero {count.value}</p>
          ) : (
            <p id="positive">Positive {count.value}</p>
          )}
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const inc = container.querySelector('button')!;
    const reset = container.querySelectorAll('button')[1]!;

    expect(container.querySelector('#zero')?.textContent).toBe('Zero 0');
    expect(container.querySelector('#positive')).toBeFalsy();

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#zero')).toBeFalsy();
    expect(container.querySelector('#positive')?.textContent).toBe('Positive 1');

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#positive')?.textContent).toBe('Positive 2');

    await qwikLoader?.dispatch(reset, 'click');

    expect(container.querySelector('#zero')?.textContent).toBe('Zero 0');
    expect(container.querySelector('#positive')).toBeFalsy();
    cleanup();
  });

  it('switches logical-and branches while scalar effects update the active branch', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return (
        <section>
          <button onClick$={() => count.value++}>inc</button>
          <button onClick$={() => (count.value = 0)}>reset</button>
          {count.value && <span id="truthy">Shown {count.value}</span>}
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const inc = container.querySelector('button')!;
    const reset = container.querySelectorAll('button')[1]!;

    expect(container.querySelector('#truthy')).toBeFalsy();

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#truthy')?.textContent).toBe('Shown 1');

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#truthy')?.textContent).toBe('Shown 2');

    await qwikLoader?.dispatch(reset, 'click');

    expect(container.querySelector('#truthy')).toBeFalsy();

    cleanup();
  });

  it('updates dynamic text rendered directly by a logical-and branch', async () => {
    const MyComp = () => {
      const count = useSignal(3);
      return (
        <section>
          <button onClick$={() => count.value++}>inc</button>
          <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const inc = container.querySelector('button')!;
    const text = container.querySelector('p')!;

    expect(text.textContent).toBe('Count is greater than 2 and equal to 3');

    await qwikLoader?.dispatch(inc, 'click');

    expect(text.textContent).toBe('Count is greater than 2 and equal to 4');
    cleanup();
  });

  it('renders multiple SSR branches from one async root', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return (
        <section>
          <p>Parity: {count.value % 2 === 0 ? 'even' : 'odd'}</p>
          <p>{count.value > 5 && 'large'}</p>
        </section>
      );
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.textContent).toContain('Parity: even');
    expect(container.textContent).not.toContain('large');
    cleanup();
  });
});
