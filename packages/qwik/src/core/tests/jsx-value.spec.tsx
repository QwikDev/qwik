import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: stored JSX values`, () => {
  it('disposes subscriptions owned by one use while preserving its sibling', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const visible = useSignal(true);
      const content = <p>{count.value}</p>;
      return (
        <main>
          <button id="increment" onClick$={() => count.value++}>
            increment
          </button>
          <button id="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
          <section>{visible.value && content}</section>
          <aside>{content}</aside>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const removed = container.querySelector('section p')!;
      const retained = container.querySelector('aside p')!;
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      await qwikLoader?.dispatch(container.querySelector('#increment')!, 'click');
      expect(removed.textContent).toBe('0');
      expect(retained.textContent).toBe('1');
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      expect(container.querySelector('section p')?.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('shares JSX initializer lowering with collection rows', async () => {
    const App = component$(() => {
      const rows = useSignal([1, 2]);
      return (
        <ul>
          {rows.value.map((row) => {
            const content = <b>{row}</b>;
            return <li key={row}>{content}</li>;
          })}
        </ul>
      );
    });
    const { container, cleanup } = await render(App);
    try {
      expect(Array.from(container.querySelectorAll('b')).map((node) => node.textContent)).toEqual([
        '1',
        '2',
      ]);
    } finally {
      cleanup();
    }
  });

  it('renders a stored root with reactive text and event captures', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const ctx = 'stored';
      const content = (
        <button title={ctx} onClick$={() => count.value++}>
          {count.value}
        </button>
      );
      const alias = content;
      return alias;
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const button = container.querySelector('button')!;
      expect(button.getAttribute('title')).toBe('stored');
      expect(button.textContent).toBe('0');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('1');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('creates independent component instances for repeated uses and replacements', async () => {
    const Counter = component$(() => {
      const count = useSignal(0);
      return (
        <button class="counter" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });
    const App = component$(() => {
      const visible = useSignal(true);
      const content = (
        <>
          <Counter />
          <span>stored</span>
        </>
      );
      return (
        <main>
          <button id="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
          <section>{visible.value && content}</section>
          <aside>{content}</aside>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const first = container.querySelector('section .counter')!;
      const second = container.querySelector('aside .counter')!;
      await qwikLoader?.dispatch(first, 'click');
      expect(first.textContent).toBe('1');
      expect(second.textContent).toBe('0');
      const toggle = container.querySelector('#toggle')!;
      await qwikLoader?.dispatch(toggle, 'click');
      expect(container.querySelector('section .counter')).toBeFalsy();
      await qwikLoader?.dispatch(second, 'click');
      expect(second.textContent).toBe('1');
      await qwikLoader?.dispatch(toggle, 'click');
      const replacement = container.querySelector('section .counter')!;
      expect(replacement).not.toBe(first);
      expect(replacement.textContent).toBe('0');
      expect(container.querySelector('aside .counter')).toBe(second);
      await qwikLoader?.dispatch(replacement, 'click');
      expect(replacement.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });
});
