import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

// No `render(Cmp)` call: the harness would extract it and leave this module uncompiled.
describe(`${name}: component$ declared inside a test`, () => {
  it('compiles beside JSX that names it', () => {
    const Cmp = component$(() => {
      useVisibleTask$(() => {});
      return <a href="/x">x</a>;
    });
    const view = () => <Cmp />;
    expect(view).toBeTypeOf('function');
  });

  // The toggled branch is a boundary: it rebuilds the local component from its captures.
  it('renders behind a toggle and updates state from the test on click', async () => {
    const count = useSignal(0);
    const Counter = component$(() => (
      <button id="counter" onClick$={() => count.value++}>
        {count.value}
      </button>
    ));
    const { container, cleanup } = await render(
      component$(() => {
        const isShown = useSignal(false);
        return (
          <div>
            <button id="toggle" onClick$={() => (isShown.value = true)} />
            {isShown.value && <Counter />}
          </div>
        );
      })
    );
    expect(container.querySelector('#counter') ?? null).toBeNull();
    await trigger(container, '#toggle', 'click');
    expect(container.querySelector('#counter')!.textContent).toBe('0');
    await trigger(container, '#counter', 'click');
    expect(container.querySelector('#counter')!.textContent).toBe('1');
    cleanup();
  });

  it('renders behind a toggle and updates its own state on click', async () => {
    const Counter = component$(() => {
      const count = useSignal(5);
      return (
        <button id="counter" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });
    const { container, cleanup } = await render(
      component$(() => {
        const isShown = useSignal(false);
        return (
          <div>
            <button id="toggle" onClick$={() => (isShown.value = true)} />
            {isShown.value && <Counter />}
          </div>
        );
      })
    );
    await trigger(container, '#toggle', 'click');
    expect(container.querySelector('#counter')!.textContent).toBe('5');
    await trigger(container, '#counter', 'click');
    expect(container.querySelector('#counter')!.textContent).toBe('6');
    cleanup();
  });

  // Rendered directly it goes through its binding; behind the toggle it rebuilds from captures.
  it('renders with a captured local named args and one declared after it', async () => {
    const args = 'a';
    const Label = component$(() => (
      <span class="label">
        {args}
        {suffix}
      </span>
    ));
    const suffix = '!';
    const { container, cleanup } = await render(
      component$(() => {
        const isShown = useSignal(false);
        return (
          <div>
            <button id="toggle" onClick$={() => (isShown.value = true)} />
            <Label />
            {isShown.value && <Label />}
          </div>
        );
      })
    );
    const labels = () =>
      Array.from(container.querySelectorAll('.label'), (label) => label.textContent);
    expect(labels()).toEqual(['a!']);
    await trigger(container, '#toggle', 'click');
    expect(labels()).toEqual(['a!', 'a!']);
    cleanup();
  });
});
