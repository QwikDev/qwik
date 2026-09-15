import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: tables`, () => {
  it('resumes rows rendered inside an authored table body', async () => {
    const App = component$(() => {
      const rows = useSignal([1]);
      return (
        <section>
          <button onClick$={() => (rows.value = [1, 2])} />
          <table>
            <thead>
              <tr>
                <th>n</th>
              </tr>
            </thead>
            <tbody>
              {rows.value.map((row) => (
                <tr key={row}>
                  <td>{row}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelectorAll('tbody')).toHaveLength(1);
    expect(container.querySelectorAll('tbody > tr')).toHaveLength(2);
    cleanup();
  });
});
