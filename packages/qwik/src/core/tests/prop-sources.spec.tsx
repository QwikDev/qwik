import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: prop sources`, () => {
  it('binds a prop member to what backs it instead of the whole props record', async () => {
    const Child = component$((props: { title: string; note: string; blob: string; n: number }) => (
      <p class={props.title}>
        <b>{props.title}</b>
        <i>{props.note}</i>
        <em>{props.n}</em>
      </p>
    ));
    const App = component$(() => {
      const title = useSignal('one');
      return (
        <section>
          <button onClick$={() => (title.value = 'two')} />
          <Child
            title={title.value}
            note="fixed"
            blob="UNRELATED-PAYLOAD"
            n={title.value === 'one' ? 1 : 2}
          />
        </section>
      );
    });
    const { container, cleanup, qwikLoader, html } = await render(App);
    const p = container.querySelector('p')!;

    expect(p.className).toBe('one');
    expect(p.querySelector('b')!.textContent).toBe('one');
    expect(p.querySelector('i')!.textContent).toBe('fixed');
    expect(p.querySelector('em')!.textContent).toBe('1');
    // Nothing captures the record, so a prop the child never reads never serializes.
    expect(html).not.toContain('UNRELATED-PAYLOAD');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(p.className).toBe('two');
    expect(p.querySelector('b')!.textContent).toBe('two');
    expect(p.querySelector('em')!.textContent).toBe('2');
    cleanup();
  });
});
