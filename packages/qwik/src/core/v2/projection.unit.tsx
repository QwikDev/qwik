import { describe, expect, it } from 'vitest';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment as Component, Fragment } from '../render/jsx/jsx-runtime';
import { Slot } from '../render/jsx/slot.public';
import { vnode_getNextSibling } from './client/vnode';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { trigger } from '../../testing/element-fixture';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';

const debug = false;

[
  ssrRenderToDom, // SSR
  domRender, // Client
].forEach((render) => {
  describe(render.name + ': projection', () => {
    it('should render basic projection', async () => {
      const Child = component$(() => {
        return (
          <div>
            <Slot />
          </div>
        );
      });
      const Parent = component$(() => {
        return <Child>parent-content</Child>;
      });
      const { vNode } = await render(<Parent>render-content</Parent>, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <div>
              <Fragment>parent-content</Fragment>
            </div>
          </Fragment>
        </Fragment>
      );
    });
    it('should render unused projection into template', async () => {
      const Child = component$(() => {
        return <span>no-projection</span>;
      });
      const Parent = component$(() => {
        return <Child>parent-content</Child>;
      });
      const { vNode } = await render(<Parent>render-content</Parent>, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <span>no-projection</span>
          </Fragment>
        </Fragment>
      );
      if (render === ssrRenderToDom) {
        expect(vnode_getNextSibling(vNode!)).toMatchVDOM(
          <q:template style="display:none">
            <Fragment>parent-content</Fragment>
            <Fragment>render-content</Fragment>
          </q:template>
        );
      }
    });
    it('should render default projection', async () => {
      const Child = component$(() => {
        return <Slot>default-value</Slot>;
      });
      const Parent = component$(() => {
        return <Child />;
      });
      const { vNode } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <Fragment>default-value</Fragment>
          </Fragment>
        </Fragment>
      );
    });
    it('should save default value in q:template if not used', async () => {
      const Child = component$(() => {
        return <Slot>default-value</Slot>;
      });
      const Parent = component$(() => {
        return <Child>projection-value</Child>;
      });
      const { vNode } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <Fragment>projection-value</Fragment>
          </Fragment>
        </Fragment>
      );
      if (render === ssrRenderToDom) {
        expect(vnode_getNextSibling(vNode!)).toMatchVDOM(
          <q:template style="display:none">
            <Fragment>default-value</Fragment>
          </q:template>
        );
      }
    });
    it('should render nested projection', async () => {
      const Child = component$(() => {
        return (
          <div>
            <Slot />
          </div>
        );
      });
      const Parent = component$(() => {
        return (
          <Child>
            before
            <Child>inner</Child>
            after
          </Child>
        );
      });
      const { vNode } = await render(<Parent>second 3</Parent>, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div>
              <Fragment>
                before
                <Component>
                  <div>
                    <Fragment>inner</Fragment>
                  </div>
                </Component>
                after
              </Fragment>
            </div>
          </Component>
        </Component>
      );
    });
    it('should project projected', async () => {
      const Child = componentQrl(
        inlinedQrl(() => {
          return (
            <span>
              <Slot name="child" />
            </span>
          );
        }, 's_child')
      );
      const Parent = componentQrl(
        inlinedQrl(() => {
          return (
            <Child>
              <div q:slot="child">
                <Slot name="parent" />
              </div>
            </Child>
          );
        }, 's_parent')
      );
      const { vNode } = await render(
        <Parent>
          <b q:slot="parent">parent</b>
        </Parent>,
        { debug }
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <span>
              <Fragment>
                <div q:slot="child">
                  <Fragment>
                    <b q:slot="parent">parent</b>
                  </Fragment>
                </div>
              </Fragment>
            </span>
          </Component>
        </Component>
      );
    });
    it('should project default content', async () => {
      const Child = componentQrl(
        inlinedQrl(() => {
          return (
            <span>
              <Slot name="child">Default Child</Slot>
            </span>
          );
        }, 's_child')
      );
      const Parent = componentQrl(
        inlinedQrl(() => {
          return (
            <Child>
              <div q:slot="child">
                <Slot name="parent">Default parent</Slot>
              </div>
            </Child>
          );
        }, 's_parent')
      );
      const { vNode } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <span>
              <Fragment>
                <div q:slot="child">
                  <Fragment>Default parent</Fragment>
                </div>
              </Fragment>
            </span>
          </Component>
        </Component>
      );
      if (render === ssrRenderToDom) {
        expect(vnode_getNextSibling(vNode!)).toMatchVDOM(
          <q:template style="display:none">
            <Fragment>Default Child</Fragment>
          </q:template>
        );
      }
    });
    it('should render conditional projection', async () => {
      const Child = component$(() => {
        const show = useSignal(false);
        return (
          <button
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = true), 's_onClick', [show])}
          >
            {show.value && <Slot />}
          </button>
        );
      });
      const Parent = component$(() => {
        return <Child>parent-content</Child>;
      });
      const { vNode, container } = await render(<Parent>render-content</Parent>, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <button>{''}</button>
          </Fragment>
        </Fragment>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <button>
              <Fragment>parent-content</Fragment>
            </button>
          </Fragment>
        </Fragment>
      );
    });
  });
});
