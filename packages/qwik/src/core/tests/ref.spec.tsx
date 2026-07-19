import { component$ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: ref`, () => {
  it('runs a function ref once when its element is created', async () => {
    const App = component$(() => {
      const calls: string[] = [];
      return (
        <section>
          <div ref={() => calls.push('ref')}>target</div>
          <span>{calls.length}</span>
        </section>
      );
    });

    const { container, cleanup } = await render(App);

    expect(container.querySelector('span')?.textContent).toBe('1');
    cleanup();
  });

  it('restores a forwarded signal ref as the matching DOM element', async () => {
    const App = component$(() => {
      const input = useSignal<Element>();
      const tag = useSignal('pending');
      return (
        <section>
          <input ref={input} />
          <button onClick$={() => (tag.value = input.value?.tagName ?? 'missing')}>read</button>
          <span>{tag.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('INPUT');
    cleanup();
  });

  it('applies a ref forwarded through opaque component props', async () => {
    const Field = component$((props: Record<string, unknown>) => <input {...props} />);
    const App = component$(() => {
      const input = useSignal<Element>();
      const tag = useSignal('pending');
      return (
        <section>
          <Field ref={input} />
          <button onClick$={() => (tag.value = input.value?.tagName ?? 'missing')}>read</button>
          <span>{tag.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('INPUT');
    cleanup();
  });

  it('runs a ref when a branch creates a new element', async () => {
    const App = component$(() => {
      const visible = useSignal(false);
      const calls = useSignal(0);
      return (
        <section>
          <button onClick$={() => (visible.value = true)}>show</button>
          {visible.value && <i ref={() => calls.value++}>target</i>}
          <span>{calls.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App);
    expect(container.querySelector('span')?.textContent).toBe('0');

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('i')?.textContent).toBe('target');
    expect(container.querySelector('span')?.textContent).toBe('1');
    cleanup();
  });
});
