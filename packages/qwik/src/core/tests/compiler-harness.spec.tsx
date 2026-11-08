import { component$, useSignal, useStore } from '@qwik.dev/core';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

const { name, render } = testRenderer;

describe(`${name}: compiler harness`, () => {
  it('loads generated chunks', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');

    expect(button.textContent).toBe('1');
    cleanup();
  });

  it('shares test-local bindings between render roots', async () => {
    const shared = { count: 0 };
    const First = component$(() => <p>{++shared.count}</p>);
    const Second = component$(() => <p>{shared.count}</p>);
    const first = await render(First);

    expect(first.container.querySelector('p')?.textContent).toBe('1');
    first.cleanup();

    const second = await render(Second);
    expect(second.container.querySelector('p')?.textContent).toBe('1');
    second.cleanup();
  });
});

vi.mock('../shared/utils/qdev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/utils/qdev')>()),
  qInspector: true,
}));

const SOURCE_LOCATION = /compiler-harness\.spec\.tsx:\d+:\d+$/;

describe.runIf(name === 'csrRender')('inspector', () => {
  it('should point client-created elements to their source', async () => {
    const App = component$(() => (
      <section>
        <p>text</p>
      </section>
    ));
    const { container, cleanup } = await render(App);
    onTestFinished(cleanup);
    const section = container.querySelector('section')!;
    const paragraph = container.querySelector('p')!;
    expect(section.getAttribute('data-qwik-inspector')).toMatch(SOURCE_LOCATION);
    expect(paragraph.getAttribute('data-qwik-inspector')).toMatch(SOURCE_LOCATION);
    expect(paragraph.getAttribute('data-qwik-inspector')).not.toBe(
      section.getAttribute('data-qwik-inspector')
    );
  });

  it('should point elements created after a state change to their source', async () => {
    const App = component$(() => {
      const isOpen = useSignal(false);
      return (
        <div>
          <button onClick$={() => (isOpen.value = true)}>Open</button>
          {isOpen.value && <span>opened</span>}
        </div>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('span')?.getAttribute('data-qwik-inspector')).toMatch(
      SOURCE_LOCATION
    );
  });

  it('should keep an explicit data-qwik-inspector prop', async () => {
    const App = component$(() => <div data-qwik-inspector="custom.tsx:1:1" />);
    const { container, cleanup } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('div')?.getAttribute('data-qwik-inspector')).toBe(
      'custom.tsx:1:1'
    );
  });
});

const debug = false;

describe(`${name}: QRL captures`, () => {
  it('should update const prop event value', async () => {
    type Cart = string[];

    const Parent = component$(() => {
      const cart = useStore<Cart>([]);
      const results = useSignal(['foo', 'bar']);

      return (
        <div>
          <button id="first" onClick$={() => (results.value = ['item1', 'item2'])}></button>

          {results.value.map((item, key) => (
            <button
              id={'second-' + key}
              onClick$={() => {
                cart.push(item);
              }}
            >
              {item}
            </button>
          ))}
          <ul>
            {cart.map((item) => (
              <li>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('foobar');
    expect(container.querySelectorAll('button')).toHaveLength(3);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('foo');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second-0');
    expect(container.querySelectorAll('button')[2]!.textContent).toBe('bar');
    expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('second-1');
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelector('ul')!.textContent).toBe('');
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelectorAll('span')).toHaveLength(0);

    await trigger(container, 'button#first', 'click');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('item1item2');
    expect(container.querySelectorAll('button')).toHaveLength(3);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('item1');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second-0');
    expect(container.querySelectorAll('button')[2]!.textContent).toBe('item2');
    expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('second-1');
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelector('ul')!.textContent).toBe('');
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelectorAll('span')).toHaveLength(0);

    await trigger(container, 'button#second-1', 'click');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('item1item2item2');
    expect(container.querySelectorAll('button')).toHaveLength(3);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('item1');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second-0');
    expect(container.querySelectorAll('button')[2]!.textContent).toBe('item2');
    expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('second-1');
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelector('ul')!.textContent).toBe('item2');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('li')!.textContent).toBe('item2');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('item2');
  });

  describe('regression', () => {
    it('#5662 - should update value in the list', async () => {
      /**
       * ROOT CAUSE ANALYSIS: This is a bug in Optimizer. The optimizer incorrectly marks the
       * `onClick` listener as 'const'/'immutable'. Because it is const, the QRL associated with the
       * click handler always points to the original object, and it is not updated.
       */
      const Cmp = component$(() => {
        const store = useStore<{ users: { name: string }[] }>({ users: [{ name: 'Giorgio' }] });

        return (
          <div>
            {store.users.map((user, key) => (
              <span
                key={key}
                onClick$={() => {
                  store.users = store.users.map(({ name }: { name: string }) => ({
                    name: name === user.name ? name + '!' : name,
                  }));
                }}
              >
                {user.name}
              </span>
            ))}
          </div>
        );
      });
      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('Giorgio');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('Giorgio');
      await triggerAll(container, 'span', 'click');
      await flush();
      await triggerAll(container, 'span', 'click');
      await flush();
      await triggerAll(container, 'span', 'click');
      await flush();
      await triggerAll(container, 'span', 'click');
      await flush();
      await triggerAll(container, 'span', 'click');
      await flush();
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('Giorgio!!!!!');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('Giorgio!!!!!');
    });
  });
});

describe('QRL captures serialization', () => {
  it('should serialize only the aliased store branch an event handler captures', async () => {
    const Cmp = component$(() => {
      const store = useStore({ counter: { count: 1 }, largeData: { data: 'LARGE DATASET' } });
      const counter = store.counter;
      return <button onClick$={() => counter.count++}>{counter.count}</button>;
    });
    const { container, cleanup, flush, html } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    const state = html;
    expect(state).not.toContain('LARGE DATASET');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelector('button')!.textContent).toBe('2');
  });
});
