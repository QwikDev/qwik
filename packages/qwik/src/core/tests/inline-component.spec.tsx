import {
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  component$,
  useSignal,
  useStore,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

const MyComp = () => {
  return (
    <>
      <h1>Test</h1>
      <p>Lorem</p>
      <h2>ipsum</h2>
      <p>foo</p>
      <h2>bar</h2>
    </>
  );
};

const InlineWrapper = () => {
  return <MyComp />;
};

const Id = (props: any) => <div>Id: {props.id}</div>;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: inline component', ({ render }) => {
  it('should render inline component', async () => {
    const MyComp = () => {
      return <>Hello World!</>;
    };

    const { vNode } = await render(<MyComp />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <>Hello World!</>
      </>
    );
  });

  it('should render nested component', async () => {
    const Child = (props: { name: string }) => {
      return <>{props.name}</>;
    };

    const Parent = (props: { salutation: string; name: string }) => {
      return (
        <>
          {props.salutation} <Child name={props.name} />
        </>
      );
    };

    const { vNode } = await render(<Parent salutation="Hello" name="World" />, {
      debug,
    });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          {'Hello'}{' '}
          <Component>
            <Fragment>World</Fragment>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should toggle component$ and inline wrapper', async () => {
    const Test = component$(() => {
      return <div>Test</div>;
    });
    const Wrapper = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value ? <Test /> : <InlineWrapper />}
        </>
      );
    });

    const { vNode, document } = await render(<Wrapper />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>Test</div>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <>
          <button></button>
          <InlineComponent>
            <InlineComponent>
              <Fragment>
                <h1>Test</h1>
                <p>Lorem</p>
                <h2>ipsum</h2>
                <p>foo</p>
                <h2>bar</h2>
              </Fragment>
            </InlineComponent>
          </InlineComponent>
        </>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <>
          <button></button>
          <Component>
            <div>Test</div>
          </Component>
        </>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <>
          <button></button>
          <InlineComponent>
            <InlineComponent>
              <Fragment>
                <h1>Test</h1>
                <p>Lorem</p>
                <h2>ipsum</h2>
                <p>foo</p>
                <h2>bar</h2>
              </Fragment>
            </InlineComponent>
          </InlineComponent>
        </>
      </Component>
    );
  });

  it('should not rerender component', async () => {
    const Child = component$((props: { id: number }) => {
      const renders = useStore(
        {
          count: 0,
        },
        { reactive: false }
      );
      renders.count++;
      const rerenders = renders.count + 0;
      return (
        <>
          <Id id={props.id} />
          {rerenders}
        </>
      );
    });
    const Cmp = component$(() => {
      const id = useSignal(0);
      return (
        <>
          <button
            onClick$={() => {
              id.value++;
            }}
          >
            Increment ID
          </button>
          <Child id={id.value} />
        </>
      );
    });

    const { vNode, container } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <>
          <button>Increment ID</button>
          <Component>
            <Fragment>
              <InlineComponent>
                <div>
                  {'Id: '}
                  <Fragment>{'0'}</Fragment>
                </div>
              </InlineComponent>
              1
            </Fragment>
          </Component>
        </>
      </Component>
    );

    await trigger(container.document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <>
          <button>Increment ID</button>
          <Component>
            <Fragment>
              <InlineComponent>
                <div>
                  {'Id: '}
                  <Fragment>{'1'}</Fragment>
                </div>
              </InlineComponent>
              1
            </Fragment>
          </Component>
        </>
      </Component>
    );
  });

  it('should render array of inline components inside normal component', async () => {
    const Cmp = component$(() => {
      const items = useStore(['qwik', 'foo', 'bar']);

      const Item = (props: { name: string }) => {
        return <div>{props.name}</div>;
      };

      return (
        <footer>
          <button onClick$={() => items.sort()}></button>
          {items.map((item, key) => (
            <Item name={item} key={key} />
          ))}
        </footer>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <footer>
          <button></button>
          <InlineComponent>
            <div>qwik</div>
          </InlineComponent>
          <InlineComponent>
            <div>foo</div>
          </InlineComponent>
          <InlineComponent>
            <div>bar</div>
          </InlineComponent>
        </footer>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <footer>
          <button></button>
          <InlineComponent>
            <div>bar</div>
          </InlineComponent>
          <InlineComponent>
            <div>foo</div>
          </InlineComponent>
          <InlineComponent>
            <div>qwik</div>
          </InlineComponent>
        </footer>
      </Component>
    );
  });

  it('should conditionally render different inline component', async () => {
    const Cmp = component$(() => {
      const show = useSignal(true);

      const Item = (props: { name: string }) => {
        return <div>{props.name}</div>;
      };

      const Item2 = (props: { name: string }) => {
        return <span>{props.name}</span>;
      };

      return (
        <footer>
          <button onClick$={() => (show.value = !show.value)}></button>
          {show.value ? <Item name={'foo'} /> : <Item2 name={'bar'} />}
        </footer>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <footer>
          <button></button>
          <InlineComponent>
            <div>foo</div>
          </InlineComponent>
        </footer>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <footer>
          <button></button>
          <InlineComponent ssr-required>
            <span>bar</span>
          </InlineComponent>
        </footer>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <footer>
          <button></button>
          <InlineComponent ssr-required>
            <div>foo</div>
          </InlineComponent>
        </footer>
      </Component>
    );
  });

  it('should conditionally render different inline component inside inline component', async () => {
    const Cmp = component$(() => {
      const show = useSignal(true);

      const Item = (props: { name: string }) => {
        return <div>{props.name}</div>;
      };

      const Item2 = (props: { name: string }) => {
        return <span>{props.name}</span>;
      };

      const Wrapper = () => {
        return <>{show.value ? <Item name={'foo'} /> : <Item2 name={'bar'} />}</>;
      };

      return (
        <footer>
          <button onClick$={() => (show.value = !show.value)}></button>
          <Wrapper />
        </footer>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <footer>
          <button></button>
          <InlineComponent>
            <Fragment>
              <InlineComponent>
                <div>foo</div>
              </InlineComponent>
            </Fragment>
          </InlineComponent>
        </footer>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <footer>
          <button></button>
          <InlineComponent>
            <Fragment>
              <InlineComponent>
                <span>bar</span>
              </InlineComponent>
            </Fragment>
          </InlineComponent>
        </footer>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <footer>
          <button></button>
          <InlineComponent>
            <Fragment>
              <InlineComponent>
                <div>foo</div>
              </InlineComponent>
            </Fragment>
          </InlineComponent>
        </footer>
      </Component>
    );
  });
});
