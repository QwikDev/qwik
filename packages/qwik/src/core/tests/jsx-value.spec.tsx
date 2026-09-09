import { component$, useSignal, type JSXOutput } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

function wrap<T>(content: T): T {
  return content;
}

function selectContent<T>(visible: boolean, content: T): T | string {
  return visible ? content : '<unsafe>';
}

class JsxBox<T> {
  constructor(public value: T) {}
}

describe(`${name}: stored JSX values`, () => {
  it('renders assigned constructor results with independent resumed instances', async () => {
    const App = component$(() => {
      const total = useSignal(0);
      const visible = useSignal(true);
      let content: JSXOutput;
      // eslint-disable-next-line prefer-const -- Exercise assignment separately from declaration.
      content = new JsxBox(<button onClick$={() => total.value++}>{total.value}</button>).value;
      return (
        <main>
          <section>{visible.value && content}</section>
          <aside>{content}</aside>
          <button class="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const remaining = container.querySelector('aside button')!;
      await qwikLoader?.dispatch(remaining, 'click');
      expect(container.querySelector('section button')?.textContent).toBe('1');
      expect(remaining.textContent).toBe('1');
      await qwikLoader?.dispatch(container.querySelector('.toggle')!, 'click');
      expect(container.querySelectorAll('section button')).toHaveLength(0);
      await qwikLoader?.dispatch(remaining, 'click');
      expect(remaining.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('renders wrapped inline collection rows with captured events', async () => {
    const App = component$(() => {
      const total = useSignal(0);
      return (
        <main>
          <output>{total.value}</output>
          {[1, 2].map((row) => wrap(<button onClick$={() => (total.value += row)}>{row}</button>))}
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const buttons = Array.from(container.querySelectorAll('button'));
      expect(buttons.map((button) => button.textContent)).toEqual(['1', '2']);
      await qwikLoader?.dispatch(buttons[1], 'click');
      expect(container.querySelector('output')?.textContent).toBe('2');
      await qwikLoader?.dispatch(buttons[0], 'click');
      expect(container.querySelector('output')?.textContent).toBe('3');
    } finally {
      cleanup();
    }
  });

  it('resumes wrapped components and replaces call results with independent ownership', async () => {
    const Counter = component$(() => {
      const count = useSignal(0);
      return (
        <button class="counter" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });
    const App = component$(() => {
      const visible = useSignal(true);
      const content = wrap(<Counter />);
      return (
        <main>
          <button id="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
          <section>{selectContent(visible.value, content)}</section>
          <aside>{wrap(content)}</aside>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const first = container.querySelector('section .counter')!;
      const sibling = container.querySelector('aside .counter')!;
      await qwikLoader?.dispatch(first, 'click');
      expect(first.textContent).toBe('1');
      expect(sibling.textContent).toBe('0');
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      expect(container.querySelector('section')?.textContent).toBe('<unsafe>');
      expect(container.querySelector('unsafe')).toBeFalsy();
      await qwikLoader?.dispatch(sibling, 'click');
      expect(sibling.textContent).toBe('1');
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      const replacement = container.querySelector('section .counter')!;
      expect(replacement).not.toBe(first);
      expect(replacement.textContent).toBe('0');
      expect(container.querySelector('aside .counter')).toBe(sibling);
      await qwikLoader?.dispatch(replacement, 'click');
      expect(replacement.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('passes JSX through setup calls and root wrappers with props and event captures', async () => {
    const App = component$(({ label }: { label: string }) => {
      const count = useSignal(0);
      const content = [<span>{label}</span>];
      content.push(
        wrap(
          <button title={label} onClick$={() => count.value++}>
            {count.value}
          </button>
        )
      );
      return wrap(content);
    });
    const { container, cleanup, qwikLoader } = await render(App, { props: { label: 'wrapped' } });
    try {
      expect(container.querySelector('span')?.textContent).toBe('wrapped');
      const button = container.querySelector('button')!;
      expect(button.getAttribute('title')).toBe('wrapped');
      expect(button.textContent).toBe('0');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('resumes nested structures and cleans up each use independently', async () => {
    const App = component$(({ label = 'content' }: { label?: string }) => {
      const count = useSignal(0);
      const visible = useSignal(true);
      const shared = { content: <p title={label}>{count.value}</p> };
      const views = {
        label,
        ...shared,
        controls: [
          <button id="increment" onClick$={() => count.value++}>
            increment
          </button>,
        ],
        nested: { body: [[shared.content], null, false, '<unsafe>', <b>end</b>] },
      };
      const {
        nested: { body },
      } = views;
      return (
        <main>
          {views.controls}
          <button id="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
          <section>{visible.value && body}</section>
          <aside>{views.content}</aside>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App, { props: {} });
    try {
      const removed = container.querySelector('section p')!;
      expect(removed.getAttribute('title')).toBe('content');
      expect(container.querySelector('section')?.textContent).toBe('0<unsafe>end');
      expect(container.querySelector('unsafe')).toBeFalsy();
      await qwikLoader?.dispatch(container.querySelector('#increment')!, 'click');
      expect(removed.textContent).toBe('1');
      expect(container.querySelector('aside p')?.textContent).toBe('1');
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      await qwikLoader?.dispatch(container.querySelector('#increment')!, 'click');
      expect(removed.textContent).toBe('1');
      expect(container.querySelector('aside p')?.textContent).toBe('2');
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      expect(container.querySelector('section')?.textContent).toBe('2<unsafe>end');
      expect(container.querySelector('section p')).not.toBe(removed);
    } finally {
      cleanup();
    }
  });

  it('reactively selects nested entries using computed property names', async () => {
    const App = component$(() => {
      const selected = useSignal('first');
      const views = { first: [<b>one</b>], second: { body: <i>two</i> } };
      const choices = { first: views.first, second: views.second.body };
      return (
        <main>
          <button
            onClick$={() => (selected.value = selected.value === 'first' ? 'second' : 'first')}
          >
            switch
          </button>
          <section>{choices[selected.value as keyof typeof choices]}</section>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      expect(container.querySelector('section b')?.textContent).toBe('one');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('section b')).toBeFalsy();
      expect(container.querySelector('section i')?.textContent).toBe('two');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('section b')?.textContent).toBe('one');
    } finally {
      cleanup();
    }
  });

  it('disposes subscriptions owned by one use while preserving its sibling', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const visible = useSignal(true);
      const content = <p>{count.value}</p>;
      return (
        <main>
          <button id="increment" onClick$={() => count.value++}>
            increment
          </button>
          <button id="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
          <section>{visible.value && content}</section>
          <aside>{content}</aside>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const removed = container.querySelector('section p')!;
      const retained = container.querySelector('aside p')!;
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      await qwikLoader?.dispatch(container.querySelector('#increment')!, 'click');
      expect(removed.textContent).toBe('0');
      expect(retained.textContent).toBe('1');
      await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
      expect(container.querySelector('section p')?.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it('shares JSX initializer lowering with collection rows', async () => {
    const App = component$(() => {
      const rows = useSignal([1, 2]);
      return (
        <ul>
          {rows.value.map((row) => {
            const content = <b>{row}</b>;
            return <li key={row}>{content}</li>;
          })}
        </ul>
      );
    });
    const { container, cleanup } = await render(App);
    try {
      expect(Array.from(container.querySelectorAll('b')).map((node) => node.textContent)).toEqual([
        '1',
        '2',
      ]);
    } finally {
      cleanup();
    }
  });

  it('renders a stored root with reactive text and event captures', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const ctx = 'stored';
      const content = (
        <button title={ctx} onClick$={() => count.value++}>
          {count.value}
        </button>
      );
      const alias = content;
      return alias;
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const button = container.querySelector('button')!;
      expect(button.getAttribute('title')).toBe('stored');
      expect(button.textContent).toBe('0');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('1');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('creates independent component instances for repeated uses and replacements', async () => {
    const Counter = component$(() => {
      const count = useSignal(0);
      return (
        <button class="counter" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });
    const App = component$(() => {
      const visible = useSignal(true);
      const content = (
        <>
          <Counter />
          <span>stored</span>
        </>
      );
      return (
        <main>
          <button id="toggle" onClick$={() => (visible.value = !visible.value)}>
            toggle
          </button>
          <section>{visible.value && content}</section>
          <aside>{content}</aside>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      const first = container.querySelector('section .counter')!;
      const second = container.querySelector('aside .counter')!;
      await qwikLoader?.dispatch(first, 'click');
      expect(first.textContent).toBe('1');
      expect(second.textContent).toBe('0');
      const toggle = container.querySelector('#toggle')!;
      await qwikLoader?.dispatch(toggle, 'click');
      expect(container.querySelector('section .counter')).toBeFalsy();
      await qwikLoader?.dispatch(second, 'click');
      expect(second.textContent).toBe('1');
      await qwikLoader?.dispatch(toggle, 'click');
      const replacement = container.querySelector('section .counter')!;
      expect(replacement).not.toBe(first);
      expect(replacement.textContent).toBe('0');
      expect(container.querySelector('aside .counter')).toBe(second);
      await qwikLoader?.dispatch(replacement, 'click');
      expect(replacement.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });
});
