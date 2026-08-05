import { Fragment as Component, Fragment, Slot, component$, useSignal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: render promise', ({ render }) => {
  it('should render promise', async () => {
    const TestCmp = component$(() => {
      const promise = Promise.resolve('PROMISE_VALUE');
      return <div>{promise}</div>;
    });

    const { vNode } = await render(<TestCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Fragment>PROMISE_VALUE</Fragment>
        </div>
      </Component>
    );
  });

  it('should handle thrown Promise', async () => {
    const Child = component$(() => {
      const signal = useSignal(0);
      if (signal.value === 0) {
        throw Promise.resolve(signal.value++);
      }
      return 'child';
    });
    const Cmp = component$(() => {
      return (
        <div>
          <Child />
        </div>
      );
    });
    const { document } = await render(<Cmp />, { debug });
    expect(document.querySelector('div')).toHaveProperty('textContent', 'child');
  });

  it('should not duplicate projected element children when component throws a promise on first render', async () => {
    const Wrapper = component$(() => (
      <form>
        <Slot />
      </form>
    ));
    const Title = component$(() => <header>title</header>);
    const Footer = component$(() => <footer>footer</footer>);
    const Cmp = component$(() => {
      // The thrown promise writes a tracked signal, scheduling a second diff
      // pass before <Wrapper> has rendered its <Slot>. The trailing <Footer />
      // is required: matching it moves the cursor past the stale <div>, so
      // expectNoMore() would not clean it up.
      const store = useSignal<string>();
      if (!store.value) {
        throw Promise.resolve().then(() => {
          store.value = 'resolved';
        });
      }
      return (
        <Wrapper>
          <Title />
          <div class="fields">{store.value}</div>
          <Footer />
        </Wrapper>
      );
    });
    const { document } = await render(<Cmp />, { debug });
    expect(document.querySelectorAll('div.fields')).toHaveLength(1);
    expect(document.querySelectorAll('header')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
  });

  it('should not duplicate named slot content when component throws a promise on first render', async () => {
    const Wrapper = component$(() => (
      <form>
        <section>
          <Slot name="top" />
        </section>
        <Slot />
      </form>
    ));
    const Title = component$(() => <header>title</header>);
    const Footer = component$(() => <footer>footer</footer>);
    const Cmp = component$(() => {
      const store = useSignal<string>();
      if (!store.value) {
        throw Promise.resolve().then(() => {
          store.value = 'resolved';
        });
      }
      return (
        <Wrapper>
          <div q:slot="top" class="banner">
            banner
          </div>
          <Title />
          <div class="fields">{store.value}</div>
          <Footer />
        </Wrapper>
      );
    });
    const { document } = await render(<Cmp />, { debug });
    expect(document.querySelectorAll('div.banner')).toHaveLength(1);
    expect(document.querySelectorAll('div.fields')).toHaveLength(1);
    expect(document.querySelectorAll('header')).toHaveLength(1);
    expect(document.querySelectorAll('footer')).toHaveLength(1);
  });
});
