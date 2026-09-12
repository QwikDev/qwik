import { component$, useSignal, useStore, type JSXOutput } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: dynamic render results`, () => {
  it('renders nested arrays with mixed text, elements and empty values', async () => {
    const App = component$(() => (
      <section>{[1, ['two', <b>three</b>, null, [undefined, false, <i>four</i>]], 'five']}</section>
    ));
    const { container, cleanup } = await render(App);
    try {
      const section = container.querySelector('section')!;
      expect(section.textContent).toBe('1twothreefourfive');
      expect(section.querySelector('b')?.textContent).toBe('three');
      expect(section.querySelector('i')?.textContent).toBe('four');
      expect(section.innerHTML).not.toContain('null');
      expect(section.innerHTML).not.toContain('false');
    } finally {
      cleanup();
    }
  });

  it('transitions between text, an element, an array and empty output', async () => {
    const App = component$(() => {
      const step = useSignal(0);
      const values: JSXOutput[] = ['text', <b>element</b>, [<i>a</i>, 'b'], null, 0];
      return (
        <main>
          <button onClick$={() => (step.value = (step.value + 1) % 5)}>next</button>
          <section>
            <span>before</span>
            {values[step.value]}
            <span>after</span>
          </section>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const section = container.querySelector('section')!;
      const before = section.firstElementChild;
      const expected = [
        'beforeelementafter',
        'beforeabafter',
        'beforeafter',
        'before0after',
        'beforetextafter',
      ];
      expect(section.textContent).toBe('beforetextafter');
      for (let index = 0; index < expected.length; index++) {
        await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
        expect(section.textContent).toBe(expected[index]);
        expect(section.firstElementChild).toBe(before);
      }
    } finally {
      cleanup();
    }
  });

  it('renders results supplied by a function, a promise, a signal and a store', async () => {
    const App = component$(() => {
      const label = useSignal('signal');
      const store = useStore({ label: 'store' });
      return (
        <section>
          <span id="fn">{() => <b>function</b>}</span>
          <span id="promise">{Promise.resolve(<b>promise</b>)}</span>
          <span id="signal">{label}</span>
          <span id="store">{store.label}</span>
          <button onClick$={() => ((label.value = 'signal2'), (store.label = 'store2'))}>
            next
          </button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader, flush } = await render(App);
    try {
      await flush();
      expect(container.querySelector('#fn')?.textContent).toBe('function');
      expect(container.querySelector('#promise')?.textContent).toBe('promise');
      expect(container.querySelector('#signal')?.textContent).toBe('signal');
      expect(container.querySelector('#store')?.textContent).toBe('store');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('#signal')?.textContent).toBe('signal2');
      expect(container.querySelector('#store')?.textContent).toBe('store2');
    } finally {
      cleanup();
    }
  });

  it('short-circuits || and ?? with JSX and evaluates each side once', async () => {
    (globalThis as any).__evals = 0;
    const App = component$(() => {
      const title = useSignal('');
      const detail = useSignal<string | null>(null);
      return (
        <section>
          <span id="or">{title.value || <b>untitled</b>}</span>
          <span id="nullish">{detail.value ?? <i>none</i>}</span>
          <span id="seq">{title.value || ((globalThis as any).__evals++, (<u>seq</u>))}</span>
          <button onClick$={() => ((title.value = 'titled'), (detail.value = 'detailed'))}>
            next
          </button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      expect(container.querySelector('#or')?.innerHTML).toContain('<b>untitled</b>');
      expect(container.querySelector('#nullish')?.innerHTML).toContain('<i>none</i>');
      expect(container.querySelector('#seq')?.textContent).toBe('seq');
      expect((globalThis as any).__evals).toBe(1);
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('#or')?.textContent).toBe('titled');
      expect(container.querySelector('#or')?.innerHTML).not.toContain('<b>');
      expect(container.querySelector('#nullish')?.textContent).toBe('detailed');
    } finally {
      delete (globalThis as any).__evals;
      cleanup();
    }
  });
});
