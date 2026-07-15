import { component$, createContextId, type QRL } from '@qwik.dev/core';
import { useContext, useContextProvider, useSignal, type Signal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender }, //
  { name: 'csrRender', render: csrRender }, //
])('$name: component', ({ render }) => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <p>Hello Qwik</p>;
    });

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('<p>Hello Qwik</p>');
    expect(html).toBe('<p>Hello Qwik</p>');

    cleanup();
  });

  it('should render component with fragment', async () => {
    const MyComp = component$(() => {
      return <>Hello Qwik</>;
    });

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('Hello Qwik');
    expect(html).toBe('Hello Qwik');

    cleanup();
  });

  it('should render plain function component', async () => {
    function MyComp() {
      return <p>Hello Function</p>;
    }

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('<p>Hello Function</p>');
    expect(html).toBe('<p>Hello Function</p>');

    cleanup();
  });

  it('should render plain arrow component', async () => {
    const MyComp = () => {
      return <p>Hello Arrow</p>;
    };

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('<p>Hello Arrow</p>');
    expect(html).toBe('<p>Hello Arrow</p>');

    cleanup();
  });

  it('should render a nested component$ child', async () => {
    const Child = component$(() => {
      return <span>Nested Child</span>;
    });

    const Parent = component$(() => {
      return (
        <section>
          <Child />
        </section>
      );
    });

    const { container, html, cleanup } = await render(Parent, { debug });

    expect(container.innerHTML).toBe('<section><span>Nested Child</span></section>');
    expect(html).toBe('<section><span>Nested Child</span></section>');

    cleanup();
  });

  it('should render a nested plain function child', async () => {
    function Child() {
      return <span>Function Child</span>;
    }

    const Parent = () => {
      return (
        <section>
          <Child />
        </section>
      );
    };

    const { container, html, cleanup } = await render(Parent, { debug });

    expect(container.innerHTML).toBe('<section><span>Function Child</span></section>');
    expect(html).toBe('<section><span>Function Child</span></section>');

    cleanup();
  });

  it('should render a nested child with scoped constants', async () => {
    const label = 'Scoped Child';

    function Child() {
      return <span>{label}</span>;
    }

    function Parent() {
      return (
        <section>
          <Child />
        </section>
      );
    }

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('span')?.textContent).toBe('Scoped Child');
    cleanup();
  });

  it('should pass props to a child component', async () => {
    function Child(props: { label: string; count: number }) {
      return (
        <p>
          {props.label}: {props.count}
        </p>
      );
    }

    function Parent() {
      const count = 7;
      return <Child label="Count" count={count} />;
    }

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('p')?.textContent).toBe('Count: 7');

    cleanup();
  });

  it('should update signal props read by a child component', async () => {
    const Child = component$((props: { count: Signal<number> }) => {
      const count = props.count;
      return <span>{count.value}</span>;
    });

    const Parent = component$(() => {
      const count = useSignal(0);
      return (
        <button onClick$={() => count.value++}>
          <Child count={count} />
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('0');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });

  it('should pass event props to native child elements', async () => {
    const Button = component$((props: { onClick$: QRL<() => any> }) => {
      return <button onClick$={props.onClick$}>Click</button>;
    });

    const Parent = component$(() => {
      const count = useSignal(0);
      return (
        <section>
          <Button onClick$={() => count.value++} />
          <span>{count.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    const button = container.querySelector('button');
    const value = container.querySelector('span');

    expect(value?.textContent).toBe('0');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(value?.textContent).toBe('1');

    cleanup();
  });

  it('should provide parent context to a child component', async () => {
    const Child = component$(() => {
      const Context = createContextId<Signal<string>>('child-component-context');
      const value = useContext(Context);
      return <span>{value.value}</span>;
    });

    const Parent = component$(() => {
      const Context = createContextId<Signal<string>>('child-component-context');
      const value = useSignal('provided');
      useContextProvider(Context, value);
      return (
        <section>
          <Child />
        </section>
      );
    });

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');

    cleanup();
  });
});

describe('csrRender: component expression props', () => {
  it('should update child subscriptions for expression props', async () => {
    function Child(props: { count: number }) {
      return <span>{props.count}</span>;
    }

    function Parent() {
      const count = useSignal(0);
      return (
        <button onClick$={() => count.value++}>
          <Child count={count.value} />
        </button>
      );
    }

    const { container, cleanup, qwikLoader } = await csrRender(Parent, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('0');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });
});
