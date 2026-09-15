import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: collection row statements`, () => {
  it('runs ordinary statements in a row body before its return', async () => {
    const App = component$(() => {
      const rows = useSignal([1]);
      return (
        <section>
          <button onClick$={() => (rows.value = [1, 2])} />
          <ul>
            {rows.value.map((row) => {
              let label = `r${row}`;
              if (row > 1) {
                label += '!';
              }
              function wrap(value: string) {
                return `[${value}]`;
              }
              label = wrap(label);
              return <li key={row}>{label}</li>;
            })}
          </ul>
          <ol>
            {[1, 2].map((n) => {
              let doubled = n * 2;
              doubled += 1;
              return <li>{doubled}</li>;
            })}
          </ol>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const texts = (tag: string) =>
      Array.from(container.querySelectorAll(`${tag} li`), (li) => li.textContent);

    expect(texts('ul')).toEqual(['[r1]']);
    expect(texts('ol')).toEqual(['3', '5']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(texts('ul')).toEqual(['[r1]', '[r2!]']);
    cleanup();
  });
});
