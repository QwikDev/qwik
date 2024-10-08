import {
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  component$,
  useSignal,
  useStore,
} from '@builder.io/qwik';
import { domRender, ssrRenderToDom, trigger } from '@builder.io/qwik/testing';
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
});
