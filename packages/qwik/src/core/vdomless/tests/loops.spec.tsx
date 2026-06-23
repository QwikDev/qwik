import { createSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: loops', ({ render }) => {
  it('updates retained keyed rows and row event captures', async () => {
    const MyComp = () => {
      const items = createSignal([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]);
      // TODO(vdomless): empty SSR dynamic text currently leaves no text node to inflate.
      const selected = createSignal('none');
      return (
        <section>
          <button
            id="swap"
            onClick$={() => {
              items.value = [items.value[1], { ...items.value[0], label: 'Alpha*' }];
            }}
          >
            swap
          </button>
          <ul>
            {items.value.map((item, index) => (
              <li key={item.id}>
                <button onClick$={() => (selected.value = item.label + ':' + index)}>pick</button>
                <span>
                  {item.label}:{index}
                </span>
              </li>
            ))}
          </ul>
          <p id="selected">{selected.value}</p>
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });

    expect([...container.querySelectorAll('li span')].map((node) => node.textContent)).toEqual([
      'Alpha:0',
      'Beta:1',
    ]);

    await qwikLoader?.dispatch(container.querySelector('#swap')!, 'click');

    expect([...container.querySelectorAll('li span')].map((node) => node.textContent)).toEqual([
      'Beta:0',
      'Alpha*:1',
    ]);

    await qwikLoader?.dispatch(container.querySelectorAll('li button')[1]!, 'click');

    expect(container.querySelector('#selected')?.textContent).toBe('Alpha*:1');
    cleanup();
  });

  it('renders keyed fragment rows', async () => {
    const MyComp = () => {
      const items = createSignal([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]);
      return (
        <p>
          {items.value.map((item) => (
            <>
              <span key={item.id}>{item.label}</span>
              <em>!</em>
            </>
          ))}
        </p>
      );
    };

    const { container, cleanup } = await render(<MyComp />, { debug });

    expect(container.querySelector('p')?.textContent).toBe('Alpha!Beta!');
    cleanup();
  });
});
