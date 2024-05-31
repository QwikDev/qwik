import {
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  component$,
  useSignal,
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
});
