import { component$, useSignal, type Signal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: collection text cache`, () => {
  it('preserves text normalization, identity and pending initial values in new rows', async () => {
    const App = component$(() => {
      const label = useSignal<string | number | boolean | Promise<string>>(0);
      const rows = useSignal<{ id: number; label: Signal<typeof label.value> }[]>([]);
      return (
        <section>
          <button id="create" onClick$={() => (rows.value = [{ id: 2, label }])} />
          <button id="same" onClick$={() => (label.value = '0')} />
          <button id="empty" onClick$={() => (label.value = false)} />
          <button id="literal" onClick$={() => (label.value = '<img src=x>')} />
          <button
            id="pending"
            onClick$={() => {
              label.value = Promise.resolve('ready');
              rows.value = [{ id: 3, label }];
            }}
          />
          <ul>
            {rows.value.map((row) => (
              <li key={row.id} class={row.label.value ? 'has-label' : ''}>
                <b>{row.label.value}</b>
                <span>{row.id}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    expect(container.querySelectorAll('li')).toHaveLength(0);
    if (qwikLoader) {
      const click = (id: string) =>
        qwikLoader.dispatch(container.querySelector(`#${id}`)!, 'click');
      await click('create');
      const label = container.querySelector('b')!;
      const text = label.firstChild;
      expect(label.textContent).toBe('0');
      expect(container.querySelector('span')!.textContent).toBe('2');
      for (const [id, expected] of [
        ['same', '0'],
        ['empty', ''],
        ['literal', '<img src=x>'],
      ]) {
        await click(id);
        expect(label.textContent).toBe(expected);
        expect(label.firstChild).toBe(text);
      }
      expect(label.querySelectorAll('img')).toHaveLength(0);
      await click('pending');
      expect(container.querySelector('b')!.textContent).toBe('ready');
      expect(container.querySelector('span')!.textContent).toBe('3');
    }
    cleanup();
  });
});
