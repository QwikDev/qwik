import { createDocument } from '@builder.io/qwik-dom';
import { Fragment, Fragment as Component, type JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { render2 } from './client/render2';
import type { ContainerElement } from './client/types';
import './vdom-diff.unit';
import { vnode_getFirstChild } from './client/vnode';
import { component$ } from '../component/component.public';
import { useSignal } from '../use/use-signal';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import type { Signal } from '../state/signal';
import { trigger } from '../../testing/element-fixture';

describe('v2 client render', () => {
  it('should render jsx', async () => {
    const { vNode } = await clientRender(<span>Hello World!</span>);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(<span>Hello World!</span>);
  });
  it('should render Components', async () => {
    const Display = component$((props: { text: string }) => {
      return <b>{props.text}</b>;
    });
    const Greeter = component$((props: { salutation: string; name: string }) => {
      return (
        <span>
          {props.salutation} <Display text={props.name} />!
        </span>
      );
    });
    const { vNode } = await clientRender(<Greeter salutation="Hello" name="World" />);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <span>
          {'Hello'}{' '}
          <Component>
            <b>World</b>
          </Component>
          {'!'}
        </span>
      </Component>
    );
  });
  it('should render counter and increment', async (async) => {
    const Counter = component$(() => {
      const count = useSignal(123);
      return (
        <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_1', [count])}>
          {count.value}
        </button>
      );
    });
    const { vNode, container } = await clientRender(<Counter />);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <button>123</button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <button>124</button>
      </Component>
    );
  });
  it('should show hide component', async () => {
    const Child = component$(() => {
      return <span>CHILD</span>;
    });
    const Counter = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={inlinedQrl(() => (useLexicalScope()[0].value = true), 's_1', [show])}>
            {String(show.value)}
          </button>
          {show.value && <Child />}
        </>
      );
    });
    const { vNode, container } = await clientRender(<Counter />);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <>
          <button>false</button>
          {''}
        </>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <>
          <button>true</button>
          <Component>
            <span>CHILD</span>
          </Component>
        </>
      </Component>
    );
  });
  it('should update loop', async () => {
    const Counter = component$(() => {
      const signal = useSignal([1]);
      return (
        <>
          <button
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = [3, 2, 1]), 's_1', [signal])}
          ></button>
          {signal.value.map((i) => (
            <b>{i}</b>
          ))}
        </>
      );
    });
    const { vNode, container } = await clientRender(<Counter />);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <>
          <button></button>
          <b>1</b>
        </>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <>
          <button></button>
          <b>3</b>
          <b>2</b>
          <b>1</b>
        </>
      </Component>
    );
  });
});

async function clientRender(jsx: JSXNode) {
  const document = createDocument();
  await render2(document.body, jsx);
  const containerElement = document.body as ContainerElement;
  const container = containerElement.qContainer!;
  return {
    container,
    vNode: container.rootVNode,
  };
}
