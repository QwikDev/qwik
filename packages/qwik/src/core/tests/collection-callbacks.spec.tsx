import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

function renderDeclared(row: number) {
  return <li key={row}>d{row}</li>;
}

describe(`${name}: collection callbacks`, () => {
  it('reconciles rows rendered through referenced and function-expression callbacks', async () => {
    const App = component$(() => {
      const rows = useSignal([1]);
      const renderLocal = (row: number) => <li key={row}>l{row}</li>;
      return (
        <section>
          <button onClick$={() => (rows.value = [1, 2])} />
          <ul id="local">{rows.value.map(renderLocal)}</ul>
          <ul id="declared">{rows.value.map(renderDeclared)}</ul>
          <ul id="expression">
            {rows.value.map(function (row) {
              return <li key={row}>f{row}</li>;
            })}
          </ul>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const firstRows = Array.from(container.querySelectorAll('li'));
    expect(firstRows.map((li) => li.textContent)).toEqual(['l1', 'd1', 'f1']);

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows.map((li) => li.textContent)).toEqual(['l1', 'l2', 'd1', 'd2', 'f1', 'f2']);
    // Keyed rows keep their nodes; a re-rendered content block would replace them.
    expect([rows[0], rows[2], rows[4]]).toEqual(firstRows);
    cleanup();
  });
});
