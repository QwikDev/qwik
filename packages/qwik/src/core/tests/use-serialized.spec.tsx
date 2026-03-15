import {
  SerializerSymbol,
  Fragment,
  Fragment as Signal,
  Fragment as Component,
  component$,
  useSignal,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { useSerializer$ } from '../use/use-serializer';

const debug = false; //true;
Error.stackTraceLimit = 100;

// This is almost the same as useComputed, so we only test the custom serialization
describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useSerializer$', ({ render }) => {
  it('should do custom serialization', async () => {
    const Counter = component$(() => {
      const myCount = useSerializer$({
        deserialize: (count) => new CustomSerialized(count),
        serialize: (data) => data.count,
        initial: 2,
      });
      const spy = useSignal(myCount.value.count);
      return (
        <button
          onClick$={() => {
            myCount.value.inc();
            spy.value = myCount.value.count;
          }}
        >
          {spy.value}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'3'}</Signal>
        </button>
      </>
    );
  });
  it('should update reactively', async () => {
    const Counter = component$(() => {
      const sig = useSignal(1);
      const myCount = useSerializer$(() => ({
        deserialize: () => new CustomSerialized(sig.value * 2),
        update: (current) => {
          current.count = sig.value * 2;
          return current;
        },
      }));
      return (
        <button
          onClick$={() => {
            sig.value++;
          }}
        >
          {myCount.value.count}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'4'}</Signal>
        </button>
      </>
    );
    // We need to click again because after SSR the first click will run the deserialize, not the update
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'6'}</Signal>
        </button>
      </>
    );
  });
  it('should support [SerializerSymbol]', async () => {
    const Counter = component$(() => {
      const count = useSerializer$({
        deserialize: (data: number) => new WithSerialize(data),
      });
      return (
        <button
          onClick$={() => {
            count.value.inc();
            count.trigger();
          }}
        >
          {count.value.count}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'0'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'1'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
  });

  it('should recalculate value without update function', async () => {
    const Counter = component$(() => {
      const count = useSerializer$({
        deserialize: (data: number) => new WithSerialize(data),
      });
      return (
        <button
          onClick$={() => {
            count.value.inc();
            count.invalidate();
          }}
        >
          {count.value.count}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'0'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'1'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
  });

  it('should not crash when used many times', async () => {
    // We don't have the Signal type here
    const MyComponent = component$(({ foo }: { foo: { value: number } }) => {
      const custom = useSerializer$(() => ({
        initial: { bar: 'bar' },
        serialize: (c: Custom) => {
          return { foo: c.foo, bar: c.bar };
        },
        deserialize: (d) => new Custom(foo.value, d.bar),
        update: (c) => {
          c.foo = foo.value;
          return c;
        },
      }));

      return (
        <button onClick$={() => foo.value++}>
          {foo.value} - {custom.value.foo} - {custom.value.bar}
        </button>
      );
    });

    const App = component$(() => {
      const foo = useSignal(0);
      return <MyComponent foo={foo} />;
    });

    const { vNode, container } = await render(<App />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment>
          <button>
            <Signal ssr-required>{'0'}</Signal> - <Signal ssr-required>{'0'}</Signal>
            {' - '}
            <Signal ssr-required>bar</Signal>
          </button>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment>
          <button>
            <Signal ssr-required>{'1'}</Signal> - <Signal ssr-required>{'1'}</Signal> -{' '}
            <Signal ssr-required>bar</Signal>
          </button>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment>
          <button>
            <Signal ssr-required>{'2'}</Signal> - <Signal ssr-required>{'2'}</Signal> -{' '}
            <Signal ssr-required>bar</Signal>
          </button>
        </Fragment>
      </Component>
    );
  });
});

class CustomSerialized {
  constructor(public count = 0) {}
  inc() {
    this.count++;
  }
}

class WithSerialize {
  constructor(public count = 0) {}
  inc() {
    this.count++;
  }
  [SerializerSymbol](obj: this) {
    return obj.count;
  }
}

class Custom {
  constructor(
    private _foo: number,
    private _bar: string
  ) {}
  get foo() {
    return this._foo;
  }
  set foo(value) {
    this._foo = value;
  }
  get bar() {
    return this._bar;
  }
  set bar(value) {
    this._bar = value;
  }
}
