import {
  Fragment as Component,
  SSRComment,
  SSRRaw,
  SSRStreamBlock,
  Fragment as Signal,
  Slot,
  component$,
  useSignal,
  useTask$,
  type JSXOutput,
  render,
} from '@qwik.dev/core';
import '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { vnode_getFirstChild } from '../client/vnode-utils';
import { createDocument } from '@qwik.dev/dom';
import { getTestPlatform, trigger } from '@qwik.dev/core/testing';
import type { _ContainerElement } from '@qwik.dev/core/internal';

describe('v2 client render', () => {
  it('should render jsx', async () => {
    const { vNode } = await clientRender(<span>Hello World!</span>);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(<span>Hello World!</span>);
  });
  it('should render void element correctly', async () => {
    const { vNode, container } = await clientRender(
      <meta content="dark light" name="color-scheme" />,
      'head'
    );
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <meta content="dark light" name="color-scheme" />
    );
    expect(container.document.documentElement.outerHTML).toContain(
      '<meta content="dark light" name="color-scheme"'
    );
    expect(container.document.documentElement.outerHTML).not.toContain('</meta>');
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
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });
    const { vNode, container } = await clientRender(<Counter />);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <button>
          <Signal>123</Signal>
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(
      <Component>
        <button>
          <Signal>124</Signal>
        </button>
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
          <button onClick$={() => (show.value = true)}>{String(show.value)}</button>
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
          <button onClick$={() => (signal.value = [3, 2, 1])}></button>
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
  it('should not render SSRRaw', async () => {
    const SSRRawCmp = component$(() => {
      return <SSRRaw data="<div>hello</div>" />;
    });
    const { vNode, container } = await clientRender(<SSRRawCmp />);
    expect(vnode_getFirstChild(vNode)).toMatchVDOM(<Component></Component>);
    expect(container.document.body.innerHTML).toEqual('');
  });

  describe('stream', () => {
    it('should not render comment', async () => {
      const CommentCmp = component$(() => {
        return <SSRComment data="foo" />;
      });

      const { vNode, container } = await clientRender(<CommentCmp />);
      expect(vnode_getFirstChild(vNode)).toMatchVDOM(<Component></Component>);
      expect(container.document.body.innerHTML).toEqual('');
    });

    it('should render SSRStreamBlock', async () => {
      const { vNode, container } = await clientRender(
        <div id="stream-block">
          <SSRStreamBlock>
            <div>stream content</div>
          </SSRStreamBlock>
        </div>
      );
      expect(vnode_getFirstChild(vNode)).toMatchVDOM(
        <div id="stream-block">
          <Component>
            <div>stream content</div>
          </Component>
        </div>
      );
      // we should not stream the comment nodes of the SSRStreamBlock
      expect(container.document.querySelector('#stream-block')?.innerHTML).toEqual(
        '<div>stream content</div>'
      );
    });
  });

  describe('cleanup', () => {
    it('should clean up slotted component subscriptions when calling a cleanup function', async () => {
      interface CleanupProps {
        spies: {
          parentCleanup?: boolean;
          cleanup?: boolean;
          slottedCleanup?: boolean;
        };
      }

      const CleanupComponent = component$((props: CleanupProps) => {
        useTask$(({ cleanup }) => {
          cleanup(() => {
            props.spies.cleanup = true;
          });
        });

        return (
          <div>
            <div id="cleanup">true</div>
            <Slot />
          </div>
        );
      });

      const ParentCleanupComponent = component$((props: CleanupProps) => {
        useTask$(({ cleanup }) => {
          cleanup(() => {
            props.spies.parentCleanup = true;
          });
        });

        return (
          <div>
            <div id="parent-cleanup">true</div>
            <CleanupComponent spies={props.spies}>
              <Slot />
            </CleanupComponent>
          </div>
        );
      });

      const SlottedCleanupComponent = component$((props: CleanupProps) => {
        useTask$(({ cleanup }) => {
          cleanup(() => {
            props.spies.slottedCleanup = true;
          });
        });

        return (
          <div>
            <div id="slotted-cleanup">true</div>
          </div>
        );
      });

      const spies = {
        parentCleanup: false,
        cleanup: false,
        slottedCleanup: false,
      };

      const { cleanup } = await clientRender(
        <ParentCleanupComponent spies={spies}>
          <SlottedCleanupComponent spies={spies} />
        </ParentCleanupComponent>
      );

      cleanup();

      expect(spies.parentCleanup).toBe(true);
      expect(spies.cleanup).toBe(true);
      expect(spies.slottedCleanup).toBe(true);
    });
  });
});

async function clientRender(jsx: JSXOutput, rootSelector: string = 'body') {
  const document = createDocument();
  const root = document.querySelector(rootSelector)!;
  const { cleanup } = await render(root, jsx);
  await getTestPlatform().flush();
  const containerElement = root as _ContainerElement;
  const container = containerElement.qContainer!;
  return {
    cleanup,
    container,
    vNode: container.rootVNode,
  };
}
