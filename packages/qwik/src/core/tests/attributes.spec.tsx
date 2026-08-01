import { component$, type PropsOf, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: attributes`, () => {
  it('serializes boolean, enumerated and numeric attributes consistently', async () => {
    const App = component$(() => {
      const enabled = useSignal(false);
      return (
        <input
          type="button"
          required={enabled.value}
          aria-hidden={enabled.value}
          draggable={enabled.value}
          spellcheck={enabled.value}
          tabIndex={-1}
          onClick$={() => (enabled.value = !enabled.value)}
        />
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const button = container.querySelector('input')!;

    expect(button.hasAttribute('required')).toBe(false);
    expect(button.getAttribute('aria-hidden')).toBe('false');
    expect(button.getAttribute('draggable')).toBe('false');
    expect(button.getAttribute('spellcheck')).toBe('false');
    expect(button.getAttribute('tabindex')).toBe('-1');

    await qwikLoader?.dispatch(button, 'click');
    expect(button.hasAttribute('required')).toBe(true);
    expect(button.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('draggable')).toBe('true');
    expect(button.getAttribute('spellcheck')).toBe('true');
    cleanup();
  });

  it('updates class arrays and objects without losing static classes', async () => {
    const App = component$(() => {
      const active = useSignal(true);
      return (
        <button
          class={['base', { active: active.value, disabled: !active.value }]}
          onClick$={() => (active.value = !active.value)}
        />
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const button = container.querySelector('button')!;

    expect(button.className).toBe('base active');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.className).toBe('base disabled');
    cleanup();
  });

  it('preserves ordered spread last-write-wins semantics', async () => {
    const Child = component$((props: PropsOf<'div'>) => {
      const attrs: Record<string, unknown> = { class: 'last', 'data-order': 'spread' };
      const forwarded = props as unknown as Record<string, unknown>;
      return <div {...forwarded} class="middle" {...attrs} />;
    });
    const App = component$(() => <Child class="first" data-order="component" />);
    const { container, cleanup } = await render(App);

    expect(container.querySelector('div')?.className).toBe('last');
    expect(container.querySelector('div')?.getAttribute('data-order')).toBe('spread');
    cleanup();
  });

  it('binds checked and value through native properties', async () => {
    const App = component$(() => {
      const checked = useSignal(false);
      const value = useSignal('one');
      return (
        <section>
          <input type="checkbox" bind:checked={checked} />
          <textarea bind:value={value} />
          <output>{checked.value + ':' + value.value}</output>
        </section>
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const input = container.querySelector('input')!;
    const textarea = container.querySelector('textarea')!;

    input.checked = true;
    textarea.value = 'two';
    await qwikLoader?.dispatch(input, 'input');
    await qwikLoader?.dispatch(textarea, 'input');
    expect(container.querySelector('output')?.textContent).toBe('true:two');
    expect(input.checked).toBe(true);
    expect(textarea.value).toBe('two');
    cleanup();
  });

  it('keeps the innerHTML subtree when an unrelated prop changes', async () => {
    const App = component$(() => {
      const clicks = useSignal(0);
      return (
        <div
          {...{ 'data-clicks': String(clicks.value) }}
          dangerouslySetInnerHTML="<span>raw</span>"
          onClick$={() => clicks.value++}
        />
      );
    });
    const { container, cleanup, flush, qwikLoader } = await render(App);
    const host = container.querySelector('div')!;
    await qwikLoader?.dispatch(host, 'click');
    await flush();
    const child = host.firstChild;

    await qwikLoader?.dispatch(host, 'click');
    await flush();

    expect(host.getAttribute('data-clicks')).toBe('2');
    expect(host.firstChild).toBe(child);
    cleanup();
  });

  it('uses innerHTML without runtime JSX normalization', async () => {
    const App = component$(() => <div dangerouslySetInnerHTML="<span>raw</span>" />);
    const { container, cleanup } = await render(App);

    expect(container.querySelector('div')?.innerHTML).toBe('<span>raw</span>');
    cleanup();
  });
});
