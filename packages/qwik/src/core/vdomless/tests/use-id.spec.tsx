import { component$, useId } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: useId', ({ render }) => {
  it('should generate id', async () => {
    const App = component$(() => {
      const id = useId();
      return <div id={id}>{id}</div>;
    });

    const { container, cleanup } = await render(<App />, { debug });
    const div = container.querySelector('div')!;

    expect(div.id).toBeTruthy();
    expect(div.textContent).toBe(div.id);

    cleanup();
  });

  it('should generate different ids for two components', async () => {
    const First = component$(() => {
      const id = useId();
      return <div id="first">{id}</div>;
    });
    const Second = component$(() => {
      const id = useId();
      return <div id="second">{id}</div>;
    });
    const App = component$(() => {
      return (
        <>
          <First />
          <Second />
        </>
      );
    });

    const { container, cleanup } = await render(<App />, { debug });
    const first = container.querySelector('#first')!.textContent;
    const second = container.querySelector('#second')!.textContent;

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);

    cleanup();
  });

  it('should generate different ids for dynamically added component instances', async () => {
    const Checkbox = component$((props: { label: string }) => {
      const id = useId();
      return (
        <div>
          <input type="checkbox" id={id} />
          <label for={id}>{props.label}</label>
        </div>
      );
    });

    const App = component$(() => {
      const enabled = useSignal(false);

      return (
        <div>
          <Checkbox label="Item 1" />
          <button onClick$={() => (enabled.value = !enabled.value)}>Toggle</button>
          {enabled.value && <Checkbox label="Item 2" />}
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).toBeTruthy();
    expect(inputs[1].id).toBeTruthy();
    expect(inputs[0].id).not.toBe(inputs[1].id);

    cleanup();
  });

  it('should match label for with input id', async () => {
    const Field = component$(() => {
      const id = useId();
      return (
        <div>
          <label for={id}>Name</label>
          <input id={id} />
        </div>
      );
    });

    const { container, cleanup } = await render(<Field />, { debug });
    const label = container.querySelector('label')!;
    const input = container.querySelector('input')!;

    expect(input.id).toBeTruthy();
    expect(label.getAttribute('for')).toBe(input.id);

    cleanup();
  });
});
