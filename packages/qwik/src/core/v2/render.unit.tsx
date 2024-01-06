import { createDocument } from '@builder.io/qwik-dom';
import { Fragment, type JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { notifyChange } from '../render/dom/notify-render';
import type { Subscriptions } from '../state/common';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSequentialScope } from '../use/use-sequential-scope';
import { useSignal } from '../use/use-signal';
import { ELEMENT_ID } from '../util/markers';
import { trigger } from '../../testing/element-fixture';
import { getDomContainer } from './client/dom-container';
import type { VNode } from './client/types';
import {
  vnode_getFirstChild,
  vnode_getParent,
  vnode_getProp,
  vnode_getVNodeForChildNode,
  vnode_locate,
} from './client/vnode';
import { ssrCreateContainer } from './ssr/ssr-container';
import { ssrRenderToContainer } from './ssr/ssr-render';
import './vdom-diff.unit';

describe('v2 render', () => {
  it('should render jsx', async () => {
    const { vNode } = await ssrRenderToDom(
      <span>
        <>Hello</> <b>World</b>!
      </span>
    );
    expect(vNode).toMatchVDOM(
      <span>
        <>Hello</> <b>World</b>!
      </span>
    );
  });
  describe('component', () => {
    describe('inline', () => {
      it('should render inline component', async () => {
        const HelloWorld = (props: { name: string }) => {
          return <span>Hello {props.name}!</span>;
        };

        const { vNode } = await ssrRenderToDom(<HelloWorld name="World" />);
        expect(vNode).toMatchVDOM(<span>Hello {'World'}!</span>);
      });
    });
    describe('component$', () => {
      it('should render simple component', async () => {
        const HelloWorld = component$((props: { name: string }) => {
          return <span>Hello {props.name}!</span>;
        });

        const { vNode } = await ssrRenderToDom(<HelloWorld name="World" />);
        expect(vNode).toMatchVDOM(
          <Fragment>
            <span>Hello {'World'}!</span>
          </Fragment>
        );
      });

      describe('useSequentialScope', () => {
        it('should update value', async () => {
          const MyComp = component$(() => {
            const { set, i, val } = useSequentialScope();
            if (val == null) {
              set('first_value');
            }

            return (
              <button
                onClick$={inlinedQrl(
                  async (e, t: HTMLElement) => {
                    const [i] = useLexicalScope();
                    expect(i).toEqual(0);
                    await rerenderComponent(t);
                  },
                  's_onClick',
                  [i]
                )}
              >
                value: {val as string | null}
              </button>
            );
          });

          const { vNode, container } = await ssrRenderToDom(<MyComp />); 
          await trigger(container.element, 'button', 'click');
          expect(vNode).toMatchVDOM(
            <>
              <button>value: {'first_value'}</button>
            </>
          );
        });
      });
      describe('useSignal', () => {
        it.skip('should update value', async () => {
          const HelloWorld = component$((props: { name: string }) => {
            const count = useSignal(123);
            return (
              <button
                onClick$={inlinedQrl(
                  () => {
                    const [count] = useLexicalScope();
                    console.log('CLICKED', count);
                    count.value++;
                  },
                  's_onClick',
                  [count]
                )}
              >
                Count: {count.value}!
              </button>
            );
          });

          const { vNode, container } = await ssrRenderToDom(<HelloWorld name="World" />);
          expect(vNode).toMatchVDOM(
            <>
              <button>Count: {'123'}!</button>
            </>
          );
          await trigger(container.element, 'button', 'click');
          console.log('>>>>', vNode.toString(5));
          expect(vNode).toMatchVDOM(
            <>
              <button>Count: {'124'}!</button>
            </>
          );
        });
      });
    });
  });
});

async function ssrRenderToDom(jsx: JSXNode) {
  const ssrContainer = ssrCreateContainer({ tagName: 'html' });
  await ssrRenderToContainer(ssrContainer, [
    <head>
      <title>{expect.getState().testPath}</title>
    </head>,
    <body>{jsx}</body>,
  ]);
  const html = ssrContainer.writer.toString();
  console.log(html);
  const document = createDocument(html);
  const container = getDomContainer(document.firstChild as HTMLElement);
  const bodyVNode = vnode_getVNodeForChildNode(container.rootVNode, document.body);
  return { container, document, vNode: vnode_getFirstChild(bodyVNode) };
}

async function rerenderComponent(element: HTMLElement) {
  const container = getDomContainer(element);
  const vElement = vnode_locate(container.rootVNode, element);
  const host = getHostVNode(vElement)!;
  const subAction: Subscriptions = [0, host];
  notifyChange(subAction, container.containerState);
  await container.containerState.$renderPromise$;
}

function getHostVNode(vElement: VNode | null) {
  while (vElement != null) {
    if (typeof vnode_getProp(vElement, ELEMENT_ID) == 'string') {
      return vElement;
    }
    vElement = vnode_getParent(vElement);
  }
  return vElement;
}
