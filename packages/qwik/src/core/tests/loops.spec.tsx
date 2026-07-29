import { useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: loops`, () => {
  it('updates retained keyed rows and row event captures', async () => {
    const MyComp = () => {
      const items = useSignal([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]);
      const selected = useSignal('');
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

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    expect([...container.querySelectorAll('li span')].map((node) => node.textContent)).toEqual([
      'Alpha:0',
      'Beta:1',
    ]);

    await qwikLoader?.dispatch(container.querySelector('#swap')!, 'click');

    expect([...container.querySelectorAll('li span')].map((node) => node.textContent)).toEqual([
      'Beta:0',
      'Alpha:1',
    ]);

    await qwikLoader?.dispatch(container.querySelectorAll('li button')[1]!, 'click');

    expect(container.querySelector('#selected')?.textContent).toBe('Alpha:1');
    cleanup();
  });

  it('updates a derived collection source', async () => {
    const MyComp = () => {
      const length = useSignal(0);
      return (
        <section>
          <button id="add" onClick$={() => length.value++}>
            add
          </button>
          <ul>
            {Array.from({ length: length.value }).map((_, index) => (
              <li key={index}>row {index}</li>
            ))}
          </ul>
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    expect(container.querySelectorAll('li').length).toBe(0);

    await qwikLoader?.dispatch(container.querySelector('#add')!, 'click');
    expect(container.querySelectorAll('li').length).toBe(1);

    await qwikLoader?.dispatch(container.querySelector('#add')!, 'click');
    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelector('li')?.textContent).toBe('row 0');

    cleanup();
  });

  it('rebuilds a keyless reactive collection', async () => {
    const MyComp = () => {
      const items = useSignal(['a', 'b']);
      return (
        <section>
          <button id="replace" onClick$={() => (items.value = ['c', 'd'])}>
            replace
          </button>
          <button id="shrink" onClick$={() => (items.value = ['e'])}>
            shrink
          </button>
          <ul>
            {items.value.map((item) => (
              <li>{item}</li>
            ))}
          </ul>
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const texts = () => {
      const found = container.querySelectorAll('li');
      return Array.from({ length: found.length }, (_, i) => found[i].textContent);
    };

    expect(texts()).toEqual(['a', 'b']);

    // Same length, different content: without a key the rows must not be retained.
    await qwikLoader?.dispatch(container.querySelector('#replace')!, 'click');
    expect(texts()).toEqual(['c', 'd']);

    await qwikLoader?.dispatch(container.querySelector('#shrink')!, 'click');
    expect(texts()).toEqual(['e']);

    cleanup();
  });

  it('renders keyed fragment rows', async () => {
    const MyComp = () => {
      const items = useSignal([
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

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('Alpha!Beta!');
    cleanup();
  });
});
