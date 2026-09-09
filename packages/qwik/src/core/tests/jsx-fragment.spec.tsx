import { component$, Fragment, Fragment as F, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: explicit fragments`, () => {
  it('preserves keyed fragment instances and event captures after reordering', async () => {
    const App = component$(() => {
      const rows = useSignal([{ id: 'one' }, { id: 'two' }]);
      const selected = useSignal('');
      const stored = (
        <F>
          <em>stored</em>
          <F />
        </F>
      );
      return (
        <Fragment>
          <header>{stored}</header>
          <main>
            {rows.value.map((row) => (
              <F key={row.id}>
                <button onClick$={() => (selected.value = row.id)}>{row.id}</button>
                <i>{row.id}</i>
              </F>
            ))}
          </main>
          <button id="reverse" onClick$={() => (rows.value = [...rows.value].reverse())}>
            reverse
          </button>
          <output>{selected.value}</output>
        </Fragment>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      expect(container.querySelector('header')?.innerHTML).toContain('<em>stored</em>');
      const buttons = Array.from(container.querySelectorAll('main button'));
      const labels = Array.from(container.querySelectorAll('main i'));
      expect(buttons.map((button) => button.textContent)).toEqual(['one', 'two']);
      await qwikLoader?.dispatch(buttons[0], 'click');
      expect(container.querySelector('output')?.textContent).toBe('one');
      await qwikLoader?.dispatch(container.querySelector('#reverse')!, 'click');
      const reordered = container.querySelectorAll('main button');
      expect(reordered[0]).toBe(buttons[1]);
      expect(reordered[1]).toBe(buttons[0]);
      expect(container.querySelectorAll('main i')[0]).toBe(labels[1]);
      await qwikLoader?.dispatch(reordered[0], 'click');
      expect(container.querySelector('output')?.textContent).toBe('two');
    } finally {
      cleanup();
    }
  });
});
