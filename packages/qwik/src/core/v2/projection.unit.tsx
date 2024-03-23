import { beforeEach, describe, expect, it } from 'vitest';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import {
  Fragment as Component,
  Fragment as InlineComponent,
  Fragment as Projection,
  Fragment as Signal,
  Fragment,
} from '../render/jsx/jsx-runtime';
import { Slot } from '../render/jsx/slot.public';
import { vnode_getNextSibling } from './client/vnode';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { trigger } from '../../testing/element-fixture';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStore } from '../use/use-store.public';

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
    it('should ignore Slot inside inline-component', async () => {
      const Child = (props: { children: any }) => {
        return (
          <span>
            <Slot />({props.children})
          </span>
        );
      };
      const { vNode } = await render(<Child>render-content</Child>, { debug });
      expect(vNode).toMatchVDOM(
        <InlineComponent>
          <span>
            <Projection />
            {'('}render-content{')'}
          </span>
        </InlineComponent>
      );
    });
    it('should project Slot inside inline-component', async () => {
      const Child = (props: { children: any }) => {
        return (
          <span>
            <Slot />({props.children})
          </span>
        );
      };
      const Parent = component$(() => {
        return <Child>child-content</Child>;
      });
      const { vNode } = await render(<Parent>parent-content</Parent>, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <InlineComponent>
            <span>
              <Projection>{'parent-content'}</Projection>
              {'('}child-content{')'}
            </span>
          </InlineComponent>
        </Component>
      );
    });
    describe('ensureProjectionResolved', () => {
      const log: string[] = [];
      beforeEach(() => {
        log.length = 0;
      });
      const Child = componentQrl<{ show: boolean }>(
        inlinedQrl((props) => {
          log.push('render:Child');
          const show = useSignal(props.show);
          return (
            <span
              class="child"
              onClick$={inlinedQrl(
                () => {
                  log.push('click:Child');
                  const [show] = useLexicalScope();
                  show.value = !show.value;
                },
                's_onClickChild',
                [show]
              )}
            >
              {show.value && <Slot />}
            </span>
          );
        }, 's_Child')
      );
      const Parent = componentQrl<{ content: boolean; slot: boolean }>(
        inlinedQrl((props) => {
          log.push('render:Parent');
          const show = useSignal(props.content);
          return (
            <div
              class="parent"
              onClick$={inlinedQrl(
                () => {
                  log.push('click:Parent');
                  const [show] = useLexicalScope();
                  show.value = !show.value;
                },
                's_onClickParent',
                [show]
              )}
            >
              <Child show={props.slot}>{show.value && 'child-content'}</Child>
            </div>
          );
        }, 's_Parent')
      );
      it('should work when parent removes content', async () => {
        const { vNode, document } = await render(<Parent content={true} slot={true} />, {
          debug,
        });
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>
                    <Signal>child-content</Signal>
                  </Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, '.parent', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>{''}</Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
        expect(log).toEqual(['click:Parent', 'render:Parent']);
      });
      it('should work when child removes projection', async () => {
        const { vNode, document } = await render(<Parent content={true} slot={true} />, {
          debug,
        });
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>
                    <Signal>child-content</Signal>
                  </Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, '.child', 'click');
        expect(log).toEqual(['click:Child', 'render:Child']);
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">{''}</span>
              </Component>
            </div>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, '.parent', 'click');
        expect(log).toEqual(['click:Parent', 'render:Parent']);
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">{''}</span>
              </Component>
            </div>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, '.child', 'click');
        expect(log).toEqual(['click:Child', 'render:Child']);
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>{''}</Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
      });
      it('should work when parent adds content', async () => {
        const { vNode, document } = await render(<Parent content={false} slot={true} />, {
          debug,
        });
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>
                    <Signal>{''}</Signal>
                  </Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, '.parent', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>
                    <Signal>{'child-content'}</Signal>
                  </Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
        expect(log).toEqual(['click:Parent', 'render:Parent']);
      });
      it('should work when child adds projection', async () => {
        const { vNode, document } = await render(<Parent content={true} slot={false} />, {
          debug,
        });
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">{''}</span>
              </Component>
            </div>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, '.child', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <div class="parent">
              <Component>
                <span class="child">
                  <Projection>
                    <Signal>child-content</Signal>
                  </Projection>
                </span>
              </Component>
            </div>
          </Component>
        );
        expect(log).toEqual(['click:Child', 'render:Child']);
      });
    });
    describe('regression', () => {
      it('#1630', async () => {
        const Child = component$(() => <b>CHILD</b>);
        const Issue1630 = component$((props) => {
          const store = useStore({ open: true });
          return (
            <>
              <button
                onClick$={inlinedQrl(
                  () => {
                    const [store] = useLexicalScope();
                    store.open = !store.open;
                  },
                  's_click',
                  [store]
                )}
              ></button>
              <Slot name="static" />
              {store.open && <Slot />}
            </>
          );
        });
        const { vNode, document } = await render(
          <Issue1630>
            <Child />
            <p q:slot="static"></p>
            DYNAMIC
          </Issue1630>,
          { debug }
        );
        expect(document.body.innerHTML).toContain('</p><b>CHILD</b>DYNAMIC');
        await trigger(document.body, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <Fragment>
              <button></button>
              <Projection q:slot="static">
                <p q:slot="static"></p>
              </Projection>
              {''}
            </Fragment>
          </Component>
        );
        expect(document.body.innerHTML).not.toContain('<b>CHILD</b>DYNAMIC');
        await trigger(document.body, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <Fragment>
              <button></button>
              <Projection q:slot="static">
                <p q:slot="static"></p>
              </Projection>
              <Projection q:slot="">
                <Component>
                  <b>{'CHILD'}</b>
                </Component>
                {'DYNAMIC'}
              </Projection>
            </Fragment>
          </Component>
        );
        expect(document.body.innerHTML).toContain('</p><b>CHILD</b>DYNAMIC');
      });
    });
  });
});
