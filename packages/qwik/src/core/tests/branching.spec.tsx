import { useSignal, component$ } from '@qwik.dev/core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: branching`, () => {
  it('switches ternary branches while scalar effects update the active branch', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return (
        <section>
          <button onClick$={() => count.value++}>inc</button>
          <button onClick$={() => (count.value = 0)}>reset</button>
          {count.value === 0 ? (
            <p id="zero">Zero {count.value}</p>
          ) : (
            <p id="positive">Positive {count.value}</p>
          )}
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const inc = container.querySelector('button')!;
    const reset = container.querySelectorAll('button')[1]!;

    expect(container.querySelector('#zero')?.textContent).toBe('Zero 0');
    expect(container.querySelector('#positive')).toBeFalsy();

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#zero')).toBeFalsy();
    expect(container.querySelector('#positive')?.textContent).toBe('Positive 1');

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#positive')?.textContent).toBe('Positive 2');

    await qwikLoader?.dispatch(reset, 'click');

    expect(container.querySelector('#zero')?.textContent).toBe('Zero 0');
    expect(container.querySelector('#positive')).toBeFalsy();
    cleanup();
  });

  it('switches logical-and branches while scalar effects update the active branch', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return (
        <section>
          <button onClick$={() => count.value++}>inc</button>
          <button onClick$={() => (count.value = 0)}>reset</button>
          {count.value && <span id="truthy">Shown {count.value}</span>}
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const inc = container.querySelector('button')!;
    const reset = container.querySelectorAll('button')[1]!;

    expect(container.querySelector('#truthy')).toBeFalsy();

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#truthy')?.textContent).toBe('Shown 1');

    await qwikLoader?.dispatch(inc, 'click');

    expect(container.querySelector('#truthy')?.textContent).toBe('Shown 2');

    await qwikLoader?.dispatch(reset, 'click');

    expect(container.querySelector('#truthy')).toBeFalsy();

    cleanup();
  });

  it('updates dynamic text rendered directly by a logical-and branch', async () => {
    const MyComp = () => {
      const count = useSignal(3);
      return (
        <section>
          <button onClick$={() => count.value++}>inc</button>
          <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const inc = container.querySelector('button')!;
    const text = container.querySelector('p')!;

    expect(text.textContent).toBe('Count is greater than 2 and equal to 3');

    await qwikLoader?.dispatch(inc, 'click');

    expect(text.textContent).toBe('Count is greater than 2 and equal to 4');
    cleanup();
  });

  it('renders multiple SSR branches from one async root', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return (
        <section>
          <p>Parity: {count.value % 2 === 0 ? 'even' : 'odd'}</p>
          <p>{count.value > 5 && 'large'}</p>
        </section>
      );
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.textContent).toContain('Parity: even');
    expect(container.textContent).not.toContain('large');
    cleanup();
  });
});

describe(`${name}: Show behavior through compiled branches`, () => {
  it.each([
    { title: 'should render the true branch', visible: true, expected: 'Then' },
    { title: 'should render the false branch', visible: false, expected: 'Else' },
  ])('$title', async ({ visible, expected }) => {
    const App = component$((props: { visible: boolean }) => (
      <div id="show">{props.visible ? <span>Then</span> : <span>Else</span>}</div>
    ));
    const { container, cleanup } = await render(App, { props: { visible } });
    onTestFinished(cleanup);
    expect(container.querySelector('#show')?.textContent).toBe(expected);
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });

  it('should render empty content without else$', async () => {
    const App = component$(() => {
      const visible = useSignal(false);
      return <div id="show">{visible.value ? <span>Then</span> : null}</div>;
    });
    const { container, cleanup } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#show')?.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('should update when the condition changes', async () => {
    const App = component$(() => {
      const visible = useSignal(true);
      return (
        <section>
          <div id="show">{visible.value ? <span>Then</span> : <span>Else</span>}</div>
          <button onClick$={() => (visible.value = !visible.value)}>Toggle</button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#show')?.textContent).toBe('Then');
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#show')?.textContent).toBe('Else');
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#show')?.textContent).toBe('Then');
  });

  it('should only invoke the selected branch', async () => {
    (globalThis as any).__mainBranchCalls = [];
    const Then = component$(() => {
      (globalThis as any).__mainBranchCalls.push('then');
      return <span>Then</span>;
    });
    const Else = component$(() => {
      (globalThis as any).__mainBranchCalls.push('else');
      return <span>Else</span>;
    });
    const App = component$(() => {
      const visible = useSignal(false);
      return (
        <section>
          <div id="show">{visible.value ? <Then /> : <Else />}</div>
          <button onClick$={() => (visible.value = !visible.value)}>Toggle</button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    expect((globalThis as any).__mainBranchCalls).toEqual(['else']);
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect((globalThis as any).__mainBranchCalls).toEqual(['else', 'then']);
    expect(container.querySelector('#show')?.textContent).toBe('Then');
  });

  it('should pass the when$ value to then$', async () => {
    const App = component$(() => {
      const value = useSignal('payload');
      return <div id="show">{value.value ? <span>{value.value}</span> : null}</div>;
    });
    const { container, cleanup } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#show')?.textContent).toBe('payload');
  });

  it('should pass the when$ value to else$', async () => {
    const App = component$(() => {
      const value = useSignal<string | null>(null);
      return (
        <div id="show">
          {value.value ? <span>{value.value}</span> : <span>{String(value.value)}</span>}
        </div>
      );
    });
    const { container, cleanup } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#show')?.textContent).toBe('null');
  });

  it('should pass the updated when$ value to then$ after signal change', async () => {
    const App = component$(() => {
      const value = useSignal('first');
      return (
        <section>
          <div id="show">{value.value ? <span>{value.value}</span> : null}</div>
          <button onClick$={() => (value.value = 'second')}>Change</button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#show')?.textContent).toBe('first');
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#show')?.textContent).toBe('second');
  });
});
