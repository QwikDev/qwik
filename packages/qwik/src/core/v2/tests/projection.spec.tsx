import { domRender, ssrRenderToDom, trigger } from '@builder.io/qwik/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  component$,
  useSignal,
  useStore,
  Slot,
  useTask$,
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  Fragment as Projection,
  Fragment as DerivedSignal,
  useVisibleTask$,
  useContextProvider,
  createContextId,
  type Signal,
  type JSXNode,
  jsx,
  useContext,
} from '@builder.io/qwik';
import { vnode_getNextSibling } from '../client/vnode';
import { SVG_NS } from '../../util/markers';

const debug = false;

/**
 * Below are helper components that are constant. They have to be in the top level scope so that the
 * optimizer doesn't consider them as captured scope. It would be great if the optimizer could
 * detect that these are constant and don't require capturing.
 */
const ChildSlotInline = (props: { children: any }) => {
  return (
    <span>
      <Slot />({props.children})
    </span>
  );
};

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: projection', ({ render }) => {
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
    const Child = component$(() => {
      return (
        <span>
          <Slot name="child" />
        </span>
      );
    });
    const Parent = component$(() => {
      return (
        <Child>
          <div q:slot="child">
            <Slot name="parent" />
          </div>
        </Child>
      );
    });
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
    const Child = component$(() => {
      return (
        <span>
          <Slot name="child">Default Child</Slot>
        </span>
      );
    });
    const Parent = component$(() => {
      return (
        <Child>
          <div q:slot="child">
            <Slot name="parent">Default parent</Slot>
          </div>
        </Child>
      );
    });
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
  });
  it('should render conditional projection', async () => {
    const Child = component$(() => {
      const show = useSignal(false);
      return <button onClick$={() => (show.value = true)}>{show.value && <Slot />}</button>;
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
          {'('}
          render-content
          {')'}
        </span>
      </InlineComponent>
    );
  });
  it('should project Slot inside inline-component', async () => {
    const Parent = component$(() => {
      return <ChildSlotInline>child-content</ChildSlotInline>;
    });
    const { vNode } = await render(<Parent>parent-content</Parent>, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <InlineComponent>
          <span>
            <Projection>{'parent-content'}</Projection>
            {'('}
            child-content
            {')'}
          </span>
        </InlineComponent>
      </Component>
    );
  });
  it('should cleanup functions inside projection', async () => {
    (globalThis as any).log = [];
    const Child = component$(() => {
      return <Slot />;
    });
    const Cleanup = component$(() => {
      useTask$(() => {
        (globalThis as any).log.push('task');
        return () => {
          (globalThis as any).log.push('cleanup');
        };
      });
      return <div></div>;
    });
    const Parent = component$(() => {
      const show = useSignal(true);
      return (
        <>
          <button onClick$={() => (show.value = false)} />
          {show.value && (
            <Child>
              <Cleanup />
            </Child>
          )}
        </>
      );
    });
    const log = (globalThis as any).log;
    const { document } = await render(<Parent />, { debug });
    const isSsr = render === ssrRenderToDom;
    expect(log).toEqual(isSsr ? ['task', 'cleanup'] : ['task']);
    log.length = 0;
    await trigger(document.body, 'button', 'click');
    expect(log).toEqual(isSsr ? [] : ['cleanup']);
  });
  it('should toggle slot inside slot correctly', async () => {
    const Button = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });
    const Projector = component$((props: { state: any; id: string }) => {
      return (
        <div id={props.id}>
          <Button>
            {props.state.showButtons && (
              <span>
                <Slot />
              </span>
            )}
          </Button>
        </div>
      );
    });
    const Parent = component$(() => {
      const state = useStore({
        showButtons: true,
      });
      return (
        <div>
          <button onClick$={() => (state.showButtons = !state.showButtons)}>Toggle</button>
          <Projector state={state} id="btn1">
            <p>test</p>
            <span q:slot="ignore">IGNORE</span>
          </Projector>
        </div>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>Toggle</button>
          <Projection>
            <div id="btn1">
              <Component>
                <div>
                  <Projection>
                    <span>
                      <Projection>
                        <p>test</p>
                      </Projection>
                    </span>
                  </Projection>
                </div>
              </Component>
            </div>
          </Projection>
        </div>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>Toggle</button>
          <Projection>
            <div id="btn1">
              <Component>
                <div>
                  <Projection>{''}</Projection>
                </div>
              </Component>
            </div>
          </Projection>
        </div>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>Toggle</button>
          <Projection>
            <div id="btn1">
              <Component>
                <div>
                  <Projection>
                    <span>
                      <Projection>
                        <p>test</p>
                      </Projection>
                    </span>
                  </Projection>
                </div>
              </Component>
            </div>
          </Projection>
        </div>
      </Component>
    );
  });

  it('should toggle slot inside slot correctly with two different slots', async () => {
    const Button = component$(() => {
      return (
        <div role="button">
          <Slot />
        </div>
      );
    });
    const Projector = component$((props: { state: any }) => {
      return (
        <Button>
          <Slot name="start"></Slot>

          {!props.state.disableButtons && (
            <span>
              <Slot />
            </span>
          )}
        </Button>
      );
    });
    const SlotParent = component$(() => {
      const state = useStore({
        disableButtons: false,
      });
      return (
        <>
          <Projector state={state}>
            <>DEFAULT</>
          </Projector>

          <Projector state={state}>
            <span q:slot="start">START</span>
          </Projector>

          <button onClick$={() => (state.disableButtons = !state.disableButtons)}>Toggle</button>
        </>
      );
    });
    const { vNode, document } = await render(<SlotParent />, { debug });

    await trigger(document.body, 'button', 'click');
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <Component>
            <Component>
              <div role="button">
                <Projection>
                  <Projection></Projection>
                  <span>
                    <Projection>
                      <Fragment>{'DEFAULT'}</Fragment>
                    </Projection>
                  </span>
                </Projection>
              </div>
            </Component>
          </Component>
          <Component>
            <Component>
              <div role="button">
                <Projection>
                  <Projection>
                    <span q:slot="start">{'START'}</span>
                  </Projection>
                  <span>
                    <Projection></Projection>
                  </span>
                </Projection>
              </div>
            </Component>
          </Component>
          <button>{'Toggle'}</button>
        </Fragment>
      </Component>
    );
  });

  it('should toggle slot inside slot correctly with two different slots and one empty', async () => {
    const Button = component$(() => {
      return <Slot />;
    });
    const Projector = component$((props: { state: any }) => {
      return (
        <Button>
          <Slot name="start"></Slot>

          {props.state.show && <Slot />}
        </Button>
      );
    });

    const SlotParent = component$(() => {
      const state = useStore({
        show: true,
      });
      return (
        <>
          <Projector state={state}>DEFAULT 1</Projector>
          <Projector state={state}>DEFAULT 2</Projector>

          <button onClick$={() => (state.show = !state.show)}>Toggle</button>
        </>
      );
    });
    const { vNode, document } = await render(<SlotParent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <Component>
            <Component>
              <Projection>
                <Projection>{render === ssrRenderToDom ? '' : null}</Projection>
                <Projection>{'DEFAULT 1'}</Projection>
              </Projection>
            </Component>
          </Component>
          <Component>
            <Component>
              <Projection>
                <Projection>{render === ssrRenderToDom ? '' : null}</Projection>
                <Projection>{'DEFAULT 2'}</Projection>
              </Projection>
            </Component>
          </Component>
          <button>{'Toggle'}</button>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <Component>
            <Component>
              <Projection>
                <Projection></Projection>
                {''}
              </Projection>
            </Component>
          </Component>
          <Component>
            <Component>
              <Projection>
                <Projection></Projection>
                {''}
              </Projection>
            </Component>
          </Component>
          <button>{'Toggle'}</button>
        </Fragment>
      </Component>
    );
  });

  it('should render to named slot in nested named slots', async () => {
    const NestedSlotCmp = component$(() => {
      return (
        <div>
          <Slot name="nested" />
        </div>
      );
    });
    const Projector = component$(() => {
      return (
        <NestedSlotCmp>
          <Slot q:slot="nested" name="start" />
        </NestedSlotCmp>
      );
    });

    const SlotParent = component$(() => {
      return (
        <Projector>
          <span q:slot="start">START</span>
        </Projector>
      );
    });

    const { vNode } = await render(<SlotParent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <Component>
            <div>
              <Projection>
                <Projection>
                  <span q:slot="start">START</span>
                </Projection>
              </Projection>
            </div>
          </Component>
        </Component>
      </Component>
    );
  });

  it('should render to default slot in nested named slots', async () => {
    const NestedSlotCmp = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });
    const Projector = component$(() => {
      return (
        <NestedSlotCmp>
          <Slot name="start" />
        </NestedSlotCmp>
      );
    });

    const SlotParent = component$(() => {
      return (
        <Projector>
          <span q:slot="start">START</span>
        </Projector>
      );
    });

    const { vNode } = await render(<SlotParent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <Component>
            <div>
              <Projection>
                <Projection>
                  <span q:slot="start">START</span>
                </Projection>
              </Projection>
            </div>
          </Component>
        </Component>
      </Component>
    );
  });

  describe('ensureProjectionResolved', () => {
    (globalThis as any).log = [] as string[];
    beforeEach(() => {
      (globalThis as any).log.length = 0;
    });
    const Child = component$<{ show: boolean }>((props) => {
      (globalThis as any).log.push('render:Child');
      const show = useSignal(props.show);
      return (
        <span
          class="child"
          onClick$={() => {
            (globalThis as any).log.push('click:Child');
            show.value = !show.value;
          }}
        >
          {show.value && <Slot />}
        </span>
      );
    });
    const Parent = component$<{ content: boolean; slot: boolean }>((props) => {
      (globalThis as any).log.push('render:Parent');
      const show = useSignal(props.content);
      return (
        <div
          class="parent"
          onClick$={() => {
            (globalThis as any).log.push('click:Parent');
            show.value = !show.value;
          }}
        >
          <Child show={props.slot}>{show.value && 'child-content'}</Child>
        </div>
      );
    });
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
                  <DerivedSignal>child-content</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      (globalThis as any).log.length = 0;
      await trigger(document.body, '.parent', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <DerivedSignal>{''}</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      expect((globalThis as any).log).toEqual(['click:Parent']);
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
                  <DerivedSignal>child-content</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      await expect(document.querySelector('.parent')).toMatchDOM(
        <div class="parent">
          <span class="child">child-content</span>
        </div>
      );
      (globalThis as any).log.length = 0;
      // console.log('--- HIDE PROJECTION ---');
      await trigger(document.body, '.child', 'click'); // hide projection
      // console.log('---');
      expect((globalThis as any).log).toEqual(['click:Child', 'render:Child']);
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">{''}</span>
            </Component>
          </div>
        </Component>
      );
      await expect(document.querySelector('.parent')).toMatchDOM(
        <div class="parent">
          <span class="child">{''}</span>
        </div>
      );
      (globalThis as any).log.length = 0;
      // console.log('--- HIDE CONTENT ---');
      await trigger(document.body, '.parent', 'click'); // hide content
      // console.log('---');
      expect((globalThis as any).log).toEqual(['click:Parent']);
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">{''}</span>
            </Component>
          </div>
        </Component>
      );
      await expect(document.querySelector('.parent')).toMatchDOM(
        <div class="parent">
          <span class="child">{''}</span>
        </div>
      );
      (globalThis as any).log.length = 0;
      // console.log('--- UN-HIDE PROJECTION (no content) ---');
      await trigger(document.body, '.child', 'click'); // un-hide projection (no content)
      // console.log('---');
      expect((globalThis as any).log).toEqual(['click:Child', 'render:Child']);
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <DerivedSignal>{''}</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      await expect(document.querySelector('.parent')).toMatchDOM(
        <div class="parent">
          <span class="child">{''}</span>
        </div>
      );
      (globalThis as any).log.length = 0;
      // console.log('--- RE-ADD CONTENT ---');
      await trigger(document.body, '.parent', 'click');
      // console.log('---');
      expect((globalThis as any).log).toEqual(['click:Parent']);
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <DerivedSignal>child-content</DerivedSignal>
                </Projection>
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
                  <DerivedSignal>{''}</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      (globalThis as any).log.length = 0;
      await trigger(document.body, '.parent', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <DerivedSignal>{'child-content'}</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      expect((globalThis as any).log).toEqual(['click:Parent']);
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
      (globalThis as any).log.length = 0;
      await trigger(document.body, '.child', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <DerivedSignal>child-content</DerivedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
      expect((globalThis as any).log).toEqual(['click:Child', 'render:Child']);
    });
    it('should render projection and insert dangerouslySetInnerHTML', async () => {
      const htmlString = '<strong>A variable here!</strong>';
      const Child = component$(() => {
        return (
          <div>
            <Slot name="content-1" />
            <Slot name="content-2" />
          </div>
        );
      });
      const Parent = component$(() => {
        return (
          <Child>
            <div id="first" q:slot="content-1" dangerouslySetInnerHTML={htmlString} />
            <div
              q:slot="content-2"
              id="second"
              dangerouslySetInnerHTML="<span>here my raw HTML</span>"
              class="after"
            />
          </Child>
        );
      });
      const { document } = await render(<Parent />, { debug });
      await expect(document.querySelector('#first')).toMatchDOM(
        <div id="first" q:slot="content-1">
          <strong>A variable here!</strong>
        </div>
      );
      await expect(document.querySelector('#second')).toMatchDOM(
        <div q:slot="content-2" id="second" class="after">
          <span>here my raw HTML</span>
        </div>
      );
    });
  });

  describe('q:template', () => {
    it('should add and delete projection content inside q:template if slot is initially not visible', async () => {
      const Cmp = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            {show.value && <Slot />}
          </>
        );
      });

      const content = <span>Some content</span>;

      const { document, vNode } = await render(<Cmp>{content}</Cmp>, { debug });
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <Projection>{content}</Projection>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <Projection>{content}</Projection>
          </Fragment>
        </Component>
      );
    });

    it('should add and delete projection content inside q:template if slot is initially visible', async () => {
      const Cmp = component$(() => {
        const show = useSignal(true);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            {show.value && <Slot />}
          </>
        );
      });

      const content = <span>Some content</span>;

      const { document } = await render(<Cmp>{content}</Cmp>, { debug });
      expect(document.querySelector('q\\:template')).toBeUndefined();

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);
    });

    it('should add and delete projection content inside q:template for CSR rerender after SSR', async () => {
      const Child = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button id="slot" onClick$={() => (show.value = !show.value)}></button>
            {show.value && <Slot />}
          </>
        );
      });

      const content = <span>Some content</span>;

      const Parent = component$(() => {
        const reload = useSignal(0);
        return (
          <>
            <button id="reload" data-v={reload.value} onClick$={() => reload.value++}>
              Reload
            </button>
            <Child key={reload.value}>{content}</Child>
          </>
        );
      });

      const { document } = await render(<Parent />, { debug });
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );

      await trigger(document.body, '#reload', 'click');
      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);

      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );

      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);

      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );
    });

    it('should add and delete projection content wrapped in component inside q:template', async () => {
      const content = (
        <div q:slot="four">
          <h1>Inside slot 4</h1>
        </div>
      );

      const ComponentA = component$(() => {
        const store = useStore({ show: false });

        return (
          <div>
            <button id="slot" onClick$={() => (store.show = !store.show)}>
              toggle slot 4
            </button>
            {store.show ? <Slot name="four" /> : null}
          </div>
        );
      });

      const Wrapper = component$<{ v: number }>(({ v }) => {
        return (
          <div class="parent-container">
            <ComponentA>{content}</ComponentA>
          </div>
        );
      });

      const Parent = component$(() => {
        const reload = useSignal(0);
        return (
          <>
            <button id="reload" data-v={reload.value} onClick$={() => reload.value++}>
              Reload
            </button>
            <Wrapper v={reload.value} key={reload.value} />
          </>
        );
      });

      const { document } = await render(<Parent />, { debug });
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );

      await trigger(document.body, '#reload', 'click');
      expect(document.querySelector('q\\:template')?.children).toHaveLength(1);
      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);

      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );

      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(<q:template></q:template>);

      await trigger(document.body, '#slot', 'click');
      await expect(document.querySelector('q\\:template')).toMatchDOM(
        <q:template>{content}</q:template>
      );
    });

    // TODO(slot): fix this test
    it.skip('should not go into an infinity loop because of removing nodes from q:template', async () => {
      const Projector = component$(() => {
        return (
          <div>
            <Slot name="start"></Slot>
          </div>
        );
      });

      const SlotParent = component$(() => {
        const showContent = useSignal(true);
        return (
          <>
            <Projector>
              {showContent.value && <>DEFAULT</>}
              <span q:slot="ignore">IGNORE</span>
            </Projector>
            <Projector>
              {showContent.value && <>DEFAULT</>}
              <span q:slot="ignore">IGNORE</span>
            </Projector>
            <button onClick$={() => (showContent.value = !showContent.value)}></button>
          </>
        );
      });

      const { document, vNode } = await render(<SlotParent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Component>
              <div>
                <Projection>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <Component>
              <div>
                <Projection>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <button></button>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Component>
              <div>
                <Projection>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <Component>
              <div>
                <Projection>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <button></button>
          </Fragment>
        </Component>
      );
    });
  });
  describe('regression', () => {
    it('#1630', async () => {
      const Child = component$(() => <b>CHILD</b>);
      const Issue1630 = component$((props) => {
        const store = useStore({ open: true });
        return (
          <div>
            <button
              onClick$={() => {
                store.open = !store.open;
              }}
            ></button>
            <Slot name="static" />
            {store.open && <Slot />}
          </div>
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
      expect(removeKeyAttrs(document.querySelector('div')?.innerHTML || '')).toContain(
        '</p><b>CHILD</b>DYNAMIC'
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <button></button>
            <Projection>
              <p q:slot="static"></p>
            </Projection>
            {''}
          </div>
        </Component>
      );
      expect(removeKeyAttrs(document.querySelector('div')?.innerHTML || '')).not.toContain(
        '<b>CHILD</b>DYNAMIC'
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <button></button>
            <Projection>
              <p q:slot="static"></p>
            </Projection>
            <Projection>
              <Component>
                <b>{'CHILD'}</b>
              </Component>
              {'DYNAMIC'}
            </Projection>
          </div>
        </Component>
      );
      expect(removeKeyAttrs(document.querySelector('div')?.innerHTML || '')).toContain(
        '</p><b>CHILD</b>DYNAMIC'
      );
    });

    it('#1630 - case 2', async () => {
      const Child = component$(() => (
        <b>
          <Slot />
        </b>
      ));
      const Issue1630 = component$((props) => {
        const store = useStore({ open: true });
        return (
          <div>
            <button
              onClick$={() => {
                store.open = !store.open;
              }}
            ></button>
            <Slot name="static" />
            {store.open && <Slot />}
          </div>
        );
      });
      const { document } = await render(
        <Issue1630>
          <Child q:slot="static">CHILD</Child>
          <p q:slot="static"></p>
          DYNAMIC
        </Issue1630>,
        { debug }
      );
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <button></button>
          <b>CHILD</b>
          <p q:slot="static"></p>
          DYNAMIC
        </div>
      );
      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <button></button>
          <b>CHILD</b>
          <p q:slot="static"></p>
          {''}
        </div>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <button></button>
          <b>CHILD</b>
          <p q:slot="static"></p>
          DYNAMIC
        </div>
      );
    });

    it('#2688', async () => {
      const Switch = component$((props: { name: string }) => {
        return <Slot name={props.name} />;
      });

      const Issue2688 = component$<{ count: number }>((props) => {
        const store = useStore({ flip: false });
        const count = useSignal(props.count);

        return (
          <>
            <button id="flip" onClick$={() => (store.flip = !store.flip)}></button>
            <button id="counter" onClick$={() => count.value++}></button>
            <div>
              <Switch name={store.flip ? 'b' : 'a'}>
                <div q:slot="a">Alpha {count.value}</div>
                <div q:slot="b">Bravo {count.value}</div>
              </Switch>
            </div>
          </>
        );
      });

      const { vNode, document } = await render(
        <section>
          <Issue2688 count={123} />
        </section>,
        { debug }
      );
      expect(vNode).toMatchVDOM(
        <section>
          <Component>
            <Fragment>
              <button id="flip"></button>
              <button id="counter"></button>
              <div>
                <Component>
                  <Projection>
                    <div q:slot="a">
                      Alpha <DerivedSignal>{'123'}</DerivedSignal>
                    </div>
                  </Projection>
                </Component>
              </div>
            </Fragment>
          </Component>
        </section>
      );
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <div q:slot="a">Alpha 123</div>
        </div>
      );
      await trigger(document.body, '#flip', 'click');
      await trigger(document.body, '#counter', 'click');
      expect(vNode).toMatchVDOM(
        <section>
          <Component>
            <Fragment>
              <button id="flip"></button>
              <button id="counter"></button>
              <div>
                <Component>
                  <Projection>
                    <div q:slot="b">
                      Bravo <DerivedSignal>{'124'}</DerivedSignal>
                    </div>
                  </Projection>
                </Component>
              </div>
            </Fragment>
          </Component>
        </section>
      );
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <div q:slot="b">Bravo 124</div>
        </div>
      );
    });

    it('#3727', async () => {
      const CTX = createContextId<Signal<any[]>>('content-Issue3727');
      const Issue3727ParentB = component$(() => {
        return (
          <main id="parentB">
            <Slot />
          </main>
        );
      });

      const Issue3727ChildB = component$(() => {
        const copyList = useSignal<string[]>([]);
        // using context here may cause error
        useContext(CTX);
        return (
          <article>
            <h1>Second</h1>
            <button
              id="add"
              onClick$={async () => {
                copyList.value = [...copyList.value, `item ${copyList.value.length}`];
              }}
            >
              Add item
            </button>
            <ul>
              {copyList.value.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </article>
        );
      });

      const Issue3727ParentA = component$(() => {
        return (
          <main id="parentA">
            <Slot />
          </main>
        );
      });

      const Issue3727ChildA = component$(() => {
        const content = useContext(CTX);

        return (
          <article>
            <h1>First</h1>
            <button
              id="navigate"
              onClick$={() => {
                content.value = [Issue3727ParentB, Issue3727ChildB];
              }}
            >
              Navigate
            </button>
          </article>
        );
      });

      const Issue3727 = component$(() => {
        const content = useSignal<any[]>([Issue3727ParentA, Issue3727ChildA]);
        useContextProvider(CTX, content);

        const contentsLen = content.value.length;
        let cmp: JSXNode | null = null;
        for (let i = contentsLen - 1; i >= 0; i--) {
          cmp = jsx(content.value[i], {
            children: cmp,
          });
        }
        return cmp;
      });

      const { vNode, document } = await render(<Issue3727 />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <main id="parentA">
              <Projection>
                <Component>
                  <article>
                    <h1>First</h1>
                    <button id="navigate">Navigate</button>
                  </article>
                </Component>
              </Projection>
            </main>
          </Component>
        </Component>
      );

      await trigger(document.body, '#navigate', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <main id="parentB">
              <Projection>
                <Component>
                  <article>
                    <h1>Second</h1>
                    <button id="add">Add item</button>
                    <ul></ul>
                  </article>
                </Component>
              </Projection>
            </main>
          </Component>
        </Component>
      );

      await trigger(document.body, '#add', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <main id="parentB">
              <Projection>
                <Component>
                  <article>
                    <h1>Second</h1>
                    <button id="add">Add item</button>
                    <ul>
                      <li>item 0</li>
                    </ul>
                  </article>
                </Component>
              </Projection>
            </main>
          </Component>
        </Component>
      );
      await trigger(document.body, '#add', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <main id="parentB">
              <Projection>
                <Component>
                  <article>
                    <h1>Second</h1>
                    <button id="add">Add item</button>
                    <ul>
                      <li>item 0</li>
                      <li>item 1</li>
                    </ul>
                  </article>
                </Component>
              </Projection>
            </main>
          </Component>
        </Component>
      );
    });

    // TODO(slot): fix this test
    it.skip('#4215', async () => {
      const QwikSvgWithSlot = component$(() => {
        return (
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '24px', height: '24px' }}
          >
            <Slot />
          </svg>
        );
      });
      const Parent = component$(() => {
        const show = useSignal<boolean>(true);

        return (
          <>
            <button
              onClick$={() => {
                show.value = !show.value;
              }}
            ></button>
            <QwikSvgWithSlot>
              {show.value && (
                <path d="M14.71 6.71c-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L10.83 12l3.88-3.88c.39-.39.38-1.03 0-1.41z" />
              )}
            </QwikSvgWithSlot>
          </>
        );
      });
      const { container, document } = await render(<Parent />, { debug });
      expect(document.querySelector('path')?.namespaceURI).toEqual(SVG_NS);

      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('path')?.namespaceURI).toEqual(SVG_NS);
    });

    it('#4283', async () => {
      const HideUntilVisible = component$(() => {
        const isNotVisible = useSignal(true);

        useVisibleTask$(
          () => {
            if (isNotVisible.value) {
              isNotVisible.value = false;
            }
          },
          {
            strategy: 'document-ready',
          }
        );

        if (isNotVisible.value) {
          return <div></div>;
        }

        return (
          <div>
            <p>Hide until visible</p>
            <Slot />
          </div>
        );
      });

      const Issue4283 = component$(() => {
        return (
          <HideUntilVisible>
            <p>Content</p>
            <Slot />
          </HideUntilVisible>
        );
      });

      const { vNode, document } = await render(
        <Issue4283>
          <p>index page</p>
        </Issue4283>,
        { debug }
      );
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'div', ':document:qinit');
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div>
              <p>Hide until visible</p>
              <Projection>
                <p>Content</p>
                <Projection>
                  <p>index page</p>
                </Projection>
              </Projection>
            </div>
          </Component>
        </Component>
      );
    });
    it('#4283 - case 2', async () => {
      const HideUntilVisible = component$(() => {
        const isNotVisible = useSignal(true);

        useVisibleTask$(
          () => {
            if (isNotVisible.value) {
              isNotVisible.value = false;
            }
          },
          {
            strategy: 'document-ready',
          }
        );

        if (isNotVisible.value) {
          return <div></div>;
        }

        return (
          <div>
            <p>Hide until visible</p>
            <Slot />
          </div>
        );
      });

      const Issue4283 = component$(() => {
        return (
          <HideUntilVisible>
            <p>Content</p>
            <Slot />
          </HideUntilVisible>
        );
      });

      const SlotParent = component$(() => {
        const render = useSignal(true);
        return (
          <>
            {render.value && (
              <>
                <Issue4283>
                  <p>index page</p>
                </Issue4283>
                <button onClick$={() => (render.value = !render.value)}></button>
              </>
            )}
          </>
        );
      });

      const { vNode, document } = await render(<SlotParent />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'div', ':document:qinit');
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Fragment>
              <Component>
                <Component>
                  <div>
                    <p>Hide until visible</p>
                    <Projection>
                      <p>Content</p>
                      <Projection>
                        <p>index page</p>
                      </Projection>
                    </Projection>
                  </div>
                </Component>
              </Component>
              <button></button>
            </Fragment>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>{''}</Fragment>
        </Component>
      );
    });
  });
});

function removeKeyAttrs(innerHTML: string): any {
  return innerHTML.replaceAll(/ q:key="[^"]+"/g, '');
}
