import {
  Fragment as Component,
  component$,
  createContextId,
  Fragment as WrappedSignal,
  Fragment,
  Fragment as InlineComponent,
  jsx,
  Fragment as Projection,
  Fragment as Awaited,
  Slot,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type JSXNode,
  type Signal,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { cleanupAttrs } from 'packages/qwik/src/testing/element-fixture';
import { beforeEach, describe, expect, it } from 'vitest';
import { vnode_locate } from '../client/vnode';
import { HTML_NS, QContainerAttr, SVG_NS } from '../shared/utils/markers';
import { QContainerValue } from '../shared/types';

const DEBUG = false;

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
          <Slot>misko</Slot>
        </div>
      );
    });
    const Parent = component$(() => {
      return (
        <Child>
          <b>parent-content</b>
        </Child>
      );
    });
    const { vNode } = await render(<Parent>render-content</Parent>, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <Projection>
              <b>parent-content</b>
            </Projection>
          </div>
        </Component>
      </Component>
    );
  });
  it('should render unused projection into template', async () => {
    const Child = component$(() => {
      return <span>no-projection</span>;
    });
    const Parent = component$(() => {
      return <Child>parent-content</Child>;
    });
    const { vNode } = await render(<Parent>render-content</Parent>, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Fragment>
        <Fragment>
          <span>no-projection</span>
        </Fragment>
      </Fragment>
    );
    if (render === ssrRenderToDom) {
      expect(vNode!.nextSibling).toMatchVDOM(
        <q:template hidden aria-hidden="true">
          parent-contentrender-content
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
    const { vNode } = await render(<Parent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Component ssr-required>
          <Projection ssr-required>default-value</Projection>
        </Component>
      </Component>
    );
  });
  it('should save default value in q:template if not used', async () => {
    const Child = component$(() => {
      return <Slot>default-value</Slot>;
    });
    const Parent = component$(() => {
      return <Child>projection-value</Child>;
    });
    const { vNode } = await render(<Parent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Fragment ssr-required>
        <Fragment ssr-required>
          <Fragment ssr-required>projection-value</Fragment>
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
    const { vNode } = await render(<Parent>second 3</Parent>, { debug: DEBUG });
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
      { debug: DEBUG }
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
    const { vNode } = await render(<Parent />, { debug: DEBUG });
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
    const { vNode, container } = await render(<Parent>render-content</Parent>, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Fragment ssr-required>
        <Fragment ssr-required>
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

  it('should replace projection content with undefined', async () => {
    const Test = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });

    const Cmp = component$(() => {
      const test = useSignal<number | undefined>(1);

      return (
        <div>
          <Test>
            {test.value ? (
              <div>
                <h1>Hello from Qwik</h1>
              </div>
            ) : undefined}
          </Test>

          <button
            onClick$={() => {
              test.value = test.value ? undefined : 1;
            }}
          ></button>
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug: DEBUG });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>
                <div>
                  <h1>Hello from Qwik</h1>
                </div>
              </Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>{''}</Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>
                <div>
                  <h1>Hello from Qwik</h1>
                </div>
              </Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>{''}</Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );
  });

  it('should replace projection content with null', async () => {
    const Test = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });

    const Cmp = component$(() => {
      const test = useSignal<number | null>(1);

      return (
        <div>
          <Test>
            {test.value ? (
              <div>
                <h1>Hello from Qwik</h1>
              </div>
            ) : null}
          </Test>

          <button
            onClick$={() => {
              test.value = test.value ? null : 1;
            }}
          ></button>
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug: DEBUG });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>
                <div>
                  <h1>Hello from Qwik</h1>
                </div>
              </Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>{''}</Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>
                <div>
                  <h1>Hello from Qwik</h1>
                </div>
              </Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <div>
              <Projection>{''}</Projection>
            </div>
          </Component>
          <button></button>
        </div>
      </Component>
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
    const { vNode } = await render(<Child>render-content</Child>, { debug: DEBUG });
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
    const { vNode } = await render(<Parent>parent-content</Parent>, { debug: DEBUG });
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
    const { document } = await render(<Parent />, { debug: DEBUG });
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

    const { vNode, document } = await render(<Parent />, { debug: DEBUG });
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
                  <Projection></Projection>
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
    const { vNode, document } = await render(<SlotParent />, { debug: DEBUG });

    await trigger(document.body, 'button', 'click');
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Component ssr-required>
              <div role="button">
                <Projection ssr-required>
                  <Projection ssr-required></Projection>
                  <span>
                    <Projection ssr-required>
                      <Fragment ssr-required>{'DEFAULT'}</Fragment>
                    </Projection>
                  </span>
                </Projection>
              </div>
            </Component>
          </Component>
          <Component ssr-required>
            <Component ssr-required>
              <div role="button">
                <Projection ssr-required>
                  <Projection ssr-required>
                    <span q:slot="start">{'START'}</span>
                  </Projection>
                  <span>
                    <Projection ssr-required></Projection>
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
    const { vNode, document } = await render(<SlotParent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Component ssr-required>
              <Projection ssr-required>
                <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
                <Projection ssr-required>{'DEFAULT 1'}</Projection>
              </Projection>
            </Component>
          </Component>
          <Component ssr-required>
            <Component ssr-required>
              <Projection ssr-required>
                <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
                <Projection ssr-required>{'DEFAULT 2'}</Projection>
              </Projection>
            </Component>
          </Component>
          <button>{'Toggle'}</button>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Component ssr-required>
              <Projection ssr-required>
                <Projection ssr-required></Projection>
              </Projection>
            </Component>
          </Component>
          <Component ssr-required>
            <Component ssr-required>
              <Projection ssr-required>
                <Projection ssr-required></Projection>
              </Projection>
            </Component>
          </Component>
          <button>{'Toggle'}</button>
        </Fragment>
      </Component>
    );
  });

  it('should toggle named slot to nothing', async () => {
    const Projector = component$((props: { state: any; id: string }) => {
      return (
        <div id={props.id}>
          <Slot name="start"></Slot>
          <Slot />
          <Slot name="end"></Slot>
        </div>
      );
    });

    const Parent = component$(() => {
      const state = useStore({
        toggle: true,
        count: 0,
      });
      return (
        <>
          <Projector state={state} id="btn1">
            {state.toggle && <>DEFAULT {state.count}</>}
          </Projector>

          <Projector state={state} id="btn2">
            {state.toggle && <span q:slot="start">START {state.count}</span>}
            {state.toggle && <span q:slot="end">END {state.count}</span>}
          </Projector>
          <button id="toggle" onClick$={() => (state.toggle = !state.toggle)}></button>
          <button id="count" onClick$={() => state.count++}></button>
        </>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <div id="btn1">
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              <Projection ssr-required>
                <Fragment ssr-required>
                  {'DEFAULT '}
                  <WrappedSignal ssr-required>{'0'}</WrappedSignal>
                </Fragment>
              </Projection>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
            </div>
          </Component>
          <Component ssr-required>
            <div id="btn2">
              <Projection ssr-required>
                <span q:slot="start">
                  {'START '}
                  <WrappedSignal ssr-required>{'0'}</WrappedSignal>
                </span>
              </Projection>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              <Projection ssr-required>
                <span q:slot="end">
                  {'END '}
                  <WrappedSignal ssr-required>{'0'}</WrappedSignal>
                </span>
              </Projection>
            </div>
          </Component>
          <button id="toggle"></button>
          <button id="count"></button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, '#toggle', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <div id="btn1">
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              <Projection ssr-required></Projection>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
            </div>
          </Component>
          <Component ssr-required>
            <div id="btn2">
              <Projection ssr-required></Projection>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              <Projection ssr-required></Projection>
            </div>
          </Component>
          <button id="toggle"></button>
          <button id="count"></button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, '#count', 'click');
    await trigger(document.body, '#toggle', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <div id="btn1">
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              <Projection ssr-required>
                <Fragment ssr-required>
                  {'DEFAULT '}
                  <WrappedSignal ssr-required>{'1'}</WrappedSignal>
                </Fragment>
              </Projection>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
            </div>
          </Component>
          <Component ssr-required>
            <div id="btn2">
              <Projection ssr-required>
                <span q:slot="start">
                  {'START '}
                  <WrappedSignal ssr-required>{'1'}</WrappedSignal>
                </span>
              </Projection>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              <Projection ssr-required>
                <span q:slot="end">
                  {'END '}
                  <WrappedSignal ssr-required>{'1'}</WrappedSignal>
                </span>
              </Projection>
            </div>
          </Component>
          <button id="toggle"></button>
          <button id="count"></button>
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

    const { vNode } = await render(<SlotParent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Component ssr-required>
          <Component ssr-required>
            <div>
              <Projection ssr-required>
                <Projection ssr-required>
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

    const { vNode } = await render(<SlotParent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Component ssr-required>
          <Component ssr-required>
            <div>
              <Projection ssr-required>
                <Projection ssr-required>
                  <span q:slot="start">START</span>
                </Projection>
              </Projection>
            </div>
          </Component>
        </Component>
      </Component>
    );
  });

  it('should render nested projections in the same component with slots correctly', async () => {
    const CompTwo = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });

    const CompThree = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });

    const CompFour = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });

    const CompOne = component$(() => {
      return (
        <CompTwo>
          <CompThree>
            <CompFour>
              <Slot />
            </CompFour>
          </CompThree>
        </CompTwo>
      );
    });

    const { vNode } = await render(<CompOne>Hey</CompOne>, { debug: DEBUG });

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <Projection>
              <Component>
                <div>
                  <Projection>
                    <Component>
                      <div>
                        <Projection>
                          <Projection>{'Hey'}</Projection>
                        </Projection>
                      </div>
                    </Component>
                  </Projection>
                </div>
              </Component>
            </Projection>
          </div>
        </Component>
      </Component>
    );
  });

  it('should render nested projections in the same component with slots correctly', async () => {
    const Button = component$(() => {
      return <Slot />;
    });

    const Thing = component$(() => {
      return <Slot />;
    });

    const Projector = component$(() => {
      return (
        <Button>
          <span>
            <Slot />
          </span>
        </Button>
      );
    });

    const Parent = component$(() => {
      return (
        <>
          <Thing>
            <Projector>{<>INSIDE THING</>}</Projector>
          </Thing>
        </>
      );
    });

    const { vNode } = await render(<Parent />, { debug: DEBUG });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Projection ssr-required>
              <Component ssr-required>
                <Component ssr-required>
                  <Projection ssr-required>
                    <span>
                      <Projection ssr-required>
                        <Fragment ssr-required>{'INSIDE THING'}</Fragment>
                      </Projection>
                    </span>
                  </Projection>
                </Component>
              </Component>
            </Projection>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should cleanup removed projection and remove it from parent component', async () => {
    const SomeCmp = component$((props: { toggle: boolean }) => {
      return <>{props.toggle && <Slot />}</>;
    });

    const Cmp = component$(() => {
      const toggle = useSignal(true);

      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          <SomeCmp toggle={toggle.value}>
            {toggle.value && <h1>Title 1</h1>}
            {!toggle.value && <h1>Title 2</h1>}
          </SomeCmp>
        </>
      );
    });

    const { document, vNode } = await render(<Cmp />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <h1>Title 1</h1>
              </Projection>
            </Fragment>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <Fragment ssr-required></Fragment>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <h1>Title 1</h1>
              </Projection>
            </Fragment>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should render the same content projection with different structure', async () => {
    const Cmp1 = component$(() => {
      return (
        <>
          <h1>Test</h1>
          <p>Test content</p>
        </>
      );
    });

    const Cmp2 = component$((props: { toggle: boolean }) => {
      return (
        <>
          {props.toggle && <Slot />}
          {!props.toggle && (
            <>
              <Slot />
            </>
          )}
        </>
      );
    });

    const Parent = component$(() => {
      const toggle = useSignal(true);
      return (
        <div>
          <button onClick$={() => (toggle.value = !toggle.value)}>toggle</button>
          <Cmp2 toggle={toggle.value}>
            <Cmp1 />
          </Cmp2>
        </div>
      );
    });
    const { vNode, document } = await render(<Parent />, { debug: DEBUG });
    expect(cleanupAttrs(document.body.querySelector('div')?.outerHTML)).toEqual(
      '<div><button>toggle</button><h1>Test</h1><p>Test content</p></div>'
    );
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <button>toggle</button>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <Component ssr-required>
                  <Fragment ssr-required>
                    <h1>Test</h1>
                    <p>Test content</p>
                  </Fragment>
                </Component>
              </Projection>
            </Fragment>
          </Component>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(cleanupAttrs(document.body.querySelector('div')?.outerHTML)).toEqual(
      '<div><button>toggle</button><h1>Test</h1><p>Test content</p></div>'
    );

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <button>toggle</button>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <Component ssr-required>
                  <Fragment ssr-required>
                    <Fragment ssr-required>
                      <h1>Test</h1>
                      <p>Test content</p>
                    </Fragment>
                  </Fragment>
                </Component>
              </Projection>
            </Fragment>
          </Component>
        </div>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(cleanupAttrs(document.body.querySelector('div')?.outerHTML)).toEqual(
      '<div><button>toggle</button><h1>Test</h1><p>Test content</p></div>'
    );
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <button>toggle</button>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <Component ssr-required>
                  <Fragment ssr-required>
                    <h1>Test</h1>
                    <p>Test content</p>
                  </Fragment>
                </Component>
              </Projection>
            </Fragment>
          </Component>
        </div>
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
        debug: DEBUG,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <WrappedSignal>child-content</WrappedSignal>
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
                  <WrappedSignal>{''}</WrappedSignal>
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
        debug: DEBUG,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <WrappedSignal>child-content</WrappedSignal>
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
                  <WrappedSignal>{''}</WrappedSignal>
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
                  <WrappedSignal>child-content</WrappedSignal>
                </Projection>
              </span>
            </Component>
          </div>
        </Component>
      );
    });
    it('should work when parent adds content', async () => {
      const { vNode, document } = await render(<Parent content={false} slot={true} />, {
        debug: DEBUG,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <span class="child">
                <Projection>
                  <WrappedSignal>{''}</WrappedSignal>
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
                  <WrappedSignal>{'child-content'}</WrappedSignal>
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
        debug: DEBUG,
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
                  <WrappedSignal>child-content</WrappedSignal>
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
      const { document } = await render(<Parent />, { debug: DEBUG });
      const qContainerAttr = { [QContainerAttr]: QContainerValue.HTML };
      await expect(document.querySelector('#first')).toMatchDOM(
        <div id="first" q:slot="content-1" {...qContainerAttr}>
          <strong>A variable here!</strong>
        </div>
      );
      await expect(document.querySelector('#second')).toMatchDOM(
        <div q:slot="content-2" id="second" class="after" {...qContainerAttr}>
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

      const { document, vNode } = await render(<Cmp>{content}</Cmp>, { debug: DEBUG });
      if (render == ssrRenderToDom) {
        await expect(document.querySelector('q\\:template')).toMatchDOM(
          <q:template key={undefined} hidden aria-hidden="true">
            {content}
          </q:template>
        );
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Projection ssr-required>{content}</Projection>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Projection ssr-required>{content}</Projection>
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

      const { document } = await render(<Cmp>{content}</Cmp>, { debug: DEBUG });
      expect(document.querySelector('q\\:template')).toBeUndefined();
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

      const { document } = await render(<Parent />, { debug: DEBUG });
      if (render == ssrRenderToDom) {
        await expect(document.querySelector('q\\:template')).toMatchDOM(
          <q:template key={undefined} hidden aria-hidden="true">
            {content}
          </q:template>
        );
      }

      await trigger(document.body, '#reload', 'click');
      await trigger(document.body, '#slot', 'click');
      if (render == ssrRenderToDom) {
        await expect(document.querySelector('q\\:template')).toMatchDOM(
          <q:template key={undefined} hidden aria-hidden="true"></q:template>
        );
      }
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

      const { document } = await render(<Parent />, { debug: DEBUG });
      if (render == ssrRenderToDom) {
        await expect(document.querySelector('q\\:template')).toMatchDOM(
          <q:template key={undefined} hidden aria-hidden="true">
            {content}
          </q:template>
        );
      }
      await trigger(document.body, '#reload', 'click');
    });

    it('should not go into an infinity loop because of removing nodes from q:template', async () => {
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

      const { document, vNode } = await render(<SlotParent />, { debug: DEBUG });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <Component ssr-required>
              <div>
                <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <Component ssr-required>
              <div>
                <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <button></button>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <Component ssr-required>
              <div>
                <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <Component ssr-required>
              <div>
                <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
              </div>
            </Component>
            <button></button>
          </Fragment>
        </Component>
      );
    });

    it('should correctly inflate text nodes from q:template', async () => {
      const Cmp = component$((props: { show: boolean }) => {
        return <span>{props.show && <Slot />}</span>;
      });
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            <Cmp show={show.value}>a</Cmp>
            <Cmp show={show.value}>b</Cmp>
          </>
        );
      });
      const { vNode, document } = await render(<Parent />, { debug: DEBUG });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <span></span>
            </Component>
            <Component ssr-required>
              <span></span>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <span>
                <Projection ssr-required>a</Projection>
              </span>
            </Component>
            <Component ssr-required>
              <span>
                <Projection ssr-required>b</Projection>
              </span>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <span></span>
            </Component>
            <Component ssr-required>
              <span></span>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <span>
                <Projection ssr-required>a</Projection>
              </span>
            </Component>
            <Component ssr-required>
              <span>
                <Projection ssr-required>b</Projection>
              </span>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });

  describe('svg', () => {
    it('#4215 - should toggle svg children with correct namespace', async () => {
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
      const { container, document, vNode } = await render(<Parent />, { debug: DEBUG });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <Projection ssr-required>
                  <path d="M14.71 6.71c-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L10.83 12l3.88-3.88c.39-.39.38-1.03 0-1.41z"></path>
                </Projection>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );

      expect(document.querySelector('svg')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('path')?.namespaceURI).toEqual(SVG_NS);

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <Projection ssr-required></Projection>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <Projection ssr-required>
                  <path d="M14.71 6.71c-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L10.83 12l3.88-3.88c.39-.39.38-1.03 0-1.41z"></path>
                </Projection>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );
      expect(document.querySelector('svg')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('path')?.namespaceURI).toEqual(SVG_NS);
    });

    it('should toggle svg nested children with correct namespace', async () => {
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
                <filter id="blurMe">
                  <feGaussianBlur in="SourceGraphic" class="test" />
                </filter>
              )}
            </QwikSvgWithSlot>
          </>
        );
      });
      const { container, document, vNode } = await render(<Parent />, { debug: DEBUG });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <Projection ssr-required>
                  <filter id="blurMe">
                    <feGaussianBlur in="SourceGraphic" class="test" />
                  </filter>
                </Projection>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );

      expect(document.querySelector('filter')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('feGaussianBlur')?.namespaceURI).toEqual(SVG_NS);

      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <Projection ssr-required>
                  <filter id="blurMe">
                    <feGaussianBlur in="SourceGraphic" class="test" />
                  </filter>
                </Projection>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );
      expect(document.querySelector('filter')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('feGaussianBlur')?.namespaceURI).toEqual(SVG_NS);
    });

    it('should toggle foreignObject children with correct namespace', async () => {
      const QwikSvgWithSlot = component$(() => {
        return (
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '24px', height: '24px' }}
          >
            <foreignObject>
              <Slot />
            </foreignObject>
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
            <QwikSvgWithSlot>{show.value && <div></div>}</QwikSvgWithSlot>
          </>
        );
      });
      const { container, document, vNode } = await render(<Parent />, { debug: DEBUG });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <foreignObject>
                  <Projection ssr-required>
                    <div></div>
                  </Projection>
                </foreignObject>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );

      expect(document.querySelector('svg')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('foreignObject')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('div')?.namespaceURI).toEqual(HTML_NS);

      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <svg
                viewBox="0 0 24 24"
                style="width:24px;height:24px"
                xmlns="http://www.w3.org/2000/svg"
              >
                <foreignObject>
                  <Projection ssr-required>
                    <div></div>
                  </Projection>
                </foreignObject>
              </svg>
            </Component>
          </Fragment>
        </Component>
      );
      expect(document.querySelector('svg')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('foreignObject')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('div')?.namespaceURI).toEqual(HTML_NS);
    });

    it('should toggle slot inside svg and render nested children with correct namespace', async () => {
      const Parent = component$(() => {
        const show = useSignal<boolean>(false);

        return (
          <>
            <button
              onClick$={() => {
                show.value = !show.value;
              }}
            ></button>
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '24px', height: '24px' }}
            >
              {show.value && <Slot />}
            </svg>
          </>
        );
      });
      const { container, document, vNode } = await render(
        <Parent>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" class="test" />
            <foreignObject>
              <div id="inner-div">
                test
                <svg id="inner-svg" xmlns="http://www.w3.org/2000/svg">
                  <path></path>
                </svg>
              </div>
            </foreignObject>
          </filter>
        </Parent>,
        { debug: DEBUG }
      );
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <svg
              viewBox="0 0 24 24"
              style="width:24px;height:24px"
              xmlns="http://www.w3.org/2000/svg"
            >
              {''}
            </svg>
          </Fragment>
        </Component>
      );

      await trigger(container.element, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <svg
              viewBox="0 0 24 24"
              style="width:24px;height:24px"
              xmlns="http://www.w3.org/2000/svg"
            >
              <Projection ssr-required>
                <filter id="blurMe">
                  <feGaussianBlur in="SourceGraphic" class="test" />
                  <foreignObject>
                    <div id="inner-div">
                      test
                      <svg id="inner-svg" xmlns="http://www.w3.org/2000/svg">
                        <path></path>
                      </svg>
                    </div>
                  </foreignObject>
                </filter>
              </Projection>
            </svg>
          </Fragment>
        </Component>
      );

      expect(document.querySelector('filter')?.namespaceURI).toEqual(SVG_NS);
      if (render === ssrRenderToDom) {
        expect(document.querySelector('fegaussianblur')?.namespaceURI).toEqual(SVG_NS);
        expect(document.querySelector('foreignobject')?.namespaceURI).toEqual(SVG_NS);
      } else {
        expect(document.querySelector('feGaussianBlur')?.namespaceURI).toEqual(SVG_NS);
        expect(document.querySelector('foreignObject')?.namespaceURI).toEqual(SVG_NS);
      }
      expect(document.querySelector('#inner-div')?.namespaceURI).toEqual(HTML_NS);
      expect(document.querySelector('#inner-svg')?.namespaceURI).toEqual(SVG_NS);
      expect(document.querySelector('path')?.namespaceURI).toEqual(SVG_NS);
    });
  });

  it('should serialize all component props next to projection', async () => {
    const InnerCmp = component$(() => {
      return <Slot />;
    });

    const Cmp = component$(() => {
      return (
        <div>
          <InnerCmp>
            {/* ^ This component */}
            <div></div>
          </InnerCmp>
          <Slot />
        </div>
      );
    });

    const Parent = component$(() => {
      const counter = useSignal(0);
      return (
        <>
          <Cmp key={counter.value}>
            <div></div>
          </Cmp>
          <button id="counter" onClick$={() => counter.value++}></button>
        </>
      );
    });

    const { container } = await render(<Parent />, { debug: DEBUG });

    if (ssrRenderToDom === render) {
      const CmpVNode = vnode_locate(container.rootVNode, '4A');
      const renderProp = CmpVNode.getProp('q:renderFn', null);
      expect(renderProp).not.toBeNull();
    }
  });

  it('should toggle content projection from undefined or null', async () => {
    const Wrapper = component$(() => {
      return <Slot />;
    });

    const Cmp = component$(() => {
      const show = useSignal(false);

      return (
        <>
          <button
            onClick$={() => {
              show.value = !show.value;
            }}
          >
            Click
          </button>
          <Wrapper>{show.value ? <div>Test</div> : undefined}</Wrapper>
          <Wrapper>{show.value ? <div>Test</div> : null}</Wrapper>
        </>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>Click</button>
          <Component ssr-required>
            <Projection ssr-required></Projection>
          </Component>
          <Component ssr-required>
            <Projection ssr-required></Projection>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>Click</button>
          <Component ssr-required>
            <Projection ssr-required>
              <div>Test</div>
            </Projection>
          </Component>
          <Component ssr-required>
            <Projection ssr-required>
              <div>Test</div>
            </Projection>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should locate slot parent in detached subtree', async () => {
    const Projector = component$(() => {
      return <Slot />;
    });
    const Child = component$((props: { state: any }) => {
      return !props.state.disableNested && <Slot />;
    });

    const Parent = component$(() => {
      const state = useStore({
        count: 0,
        disableNested: false,
      });
      return (
        <>
          <Child state={state}>
            <Projector>
              {state.count}
              {state.count}
            </Projector>
          </Child>
          <button id="toggle" onClick$={() => (state.disableNested = !state.disableNested)}>
            Toggle
          </button>
          <button id="count" onClick$={() => state.count++}>
            Count
          </button>
        </>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Projection ssr-required>
              <Component ssr-required>
                <Projection ssr-required>
                  <WrappedSignal ssr-required>{'0'}</WrappedSignal>
                  <WrappedSignal ssr-required>{'0'}</WrappedSignal>
                </Projection>
              </Component>
            </Projection>
          </Component>
          <button id="toggle">Toggle</button>
          <button id="count">Count</button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button[id="toggle"]', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required></Component>
          <button id="toggle">Toggle</button>
          <button id="count">Count</button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button[id="count"]', 'click');
    await trigger(document.body, 'button[id="toggle"]', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Projection ssr-required>
              <Component ssr-required>
                <Projection ssr-required>
                  <WrappedSignal ssr-required>{'1'}</WrappedSignal>
                  <WrappedSignal ssr-required>{'1'}</WrappedSignal>
                </Projection>
              </Component>
            </Projection>
          </Component>
          <button id="toggle">Toggle</button>
          <button id="count">Count</button>
        </Fragment>
      </Component>
    );
  });

  it('should toggle text content projection', async () => {
    const Parent = component$(() => {
      return <Slot />;
    });

    const Cmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = !show.value)}></button>
          {show.value && (
            <Parent>
              <Slot />
            </Parent>
          )}
        </>
      );
    });
    const { vNode, document } = await render(<Cmp>content</Cmp>, { debug: DEBUG });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          {''}
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <Projection ssr-required>
              <Projection ssr-required>content</Projection>
            </Projection>
          </Component>
        </Fragment>
      </Component>
    );
  });

  describe('regression', () => {
    it('#1630', async () => {
      const Child = component$(() => <b>CHILD</b>);
      const Issue1630 = component$(() => {
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
        { debug: DEBUG }
      );
      expect(cleanupAttrs(document.querySelector('div')?.innerHTML || '')).toContain(
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
      expect(cleanupAttrs(document.querySelector('div')?.innerHTML || '')).not.toContain(
        '<b>CHILD</b>DYNAMIC'
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <button></button>
            <Projection ssr-required>
              <p q:slot="static"></p>
            </Projection>
            <Projection ssr-required>
              <Component ssr-required>
                <b>{'CHILD'}</b>
              </Component>
              {'DYNAMIC'}
            </Projection>
          </div>
        </Component>
      );
      expect(cleanupAttrs(document.querySelector('div')?.innerHTML || '')).toContain(
        '</p><b>CHILD</b>DYNAMIC'
      );
    });

    it('#1630 - case 2', async () => {
      const Child = component$(() => (
        <b>
          <Slot />
        </b>
      ));
      const Issue1630 = component$(() => {
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
        { debug: DEBUG }
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

      const Cmp = component$(() => {
        return (
          <section>
            <Issue2688 count={123} />
          </section>
        );
      });

      const { vNode, document } = await render(<Cmp />, { debug: DEBUG });
      expect(vNode).toMatchVDOM(
        <Component>
          <section>
            <Component>
              <Fragment>
                <button id="flip"></button>
                <button id="counter"></button>
                <div>
                  <Component ssr-required>
                    <Projection ssr-required>
                      <div q:slot="a">
                        Alpha <WrappedSignal ssr-required>{'123'}</WrappedSignal>
                      </div>
                    </Projection>
                  </Component>
                </div>
              </Fragment>
            </Component>
          </section>
        </Component>
      );
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <div q:slot="a">Alpha 123</div>
        </div>
      );
      await trigger(document.body, '#flip', 'click');
      await trigger(document.body, '#counter', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <section>
            <Component>
              <Fragment>
                <button id="flip"></button>
                <button id="counter"></button>
                <div>
                  <Component ssr-required>
                    <Projection ssr-required>
                      <div q:slot="b">
                        Bravo <WrappedSignal ssr-required>{'124'}</WrappedSignal>
                      </div>
                    </Projection>
                  </Component>
                </div>
              </Fragment>
            </Component>
          </section>
        </Component>
      );
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <div q:slot="b">Bravo 124</div>
        </div>
      );
    });

    it('#2688 - case 2', async () => {
      const Switch = component$((props: { name: string }) => {
        return <Slot name={props.name} />;
      });
      const Issue2688 = component$(({ count }: { count: number }) => {
        const store = useStore({ flip: false });

        return (
          <>
            <button id="flip" onClick$={() => (store.flip = !store.flip)}></button>
            <Switch name={store.flip ? 'b' : 'a'}>
              <div q:slot="a">Alpha {count}</div>
              <div q:slot="b">Bravo {count}</div>
            </Switch>
          </>
        );
      });

      const Parent = component$(() => {
        const state = useStore({
          count: 0,
        });
        return (
          <div>
            <Issue2688 count={state.count} />
            <button id="counter" onClick$={() => state.count++}></button>
          </div>
        );
      });

      const { vNode, document } = await render(<Parent />, { debug: DEBUG });
      await trigger(document.body, '#flip', 'click');
      await trigger(document.body, '#counter', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <Component ssr-required>
              <Fragment ssr-required>
                <button id="flip"></button>
                <Component ssr-required>
                  <Projection ssr-required>
                    <div q:slot="b">
                      {'Bravo '}
                      <WrappedSignal ssr-required>1</WrappedSignal>
                    </div>
                  </Projection>
                </Component>
              </Fragment>
            </Component>
            <button id="counter"></button>
          </div>
        </Component>
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

      const { vNode, document } = await render(<Issue3727 />, { debug: DEBUG });

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
        { debug: DEBUG }
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

      const { vNode, document } = await render(<SlotParent />, { debug: DEBUG });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'div', ':document:qinit');
      }
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <Fragment ssr-required>
              <Component ssr-required>
                <Component ssr-required>
                  <div>
                    <p>Hide until visible</p>
                    <Projection ssr-required>
                      <p>Content</p>
                      <Projection ssr-required>
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
        <Component ssr-required>
          <Fragment ssr-required>{''}</Fragment>
        </Component>
      );
    });

    it('#6900 - should not execute chores for deleted nodes inside projection', async () => {
      const Issue6900Root = component$(() => <Slot />);
      const Issue6900Image = component$<{ src: string }>(({ src }) => src);

      const Issue6900 = component$(() => {
        const signal = useSignal<null | { url: string }>({ url: 'https://picsum.photos/200' });
        if (!signal.value) {
          return <p>User is not signed in</p>;
        }

        return (
          <div>
            <button onClick$={() => (signal.value = null)}>Sign out</button>
            <Issue6900Root>
              <Issue6900Image src={signal.value.url} />
            </Issue6900Root>
          </div>
        );
      });

      const { vNode, document } = await render(<Issue6900 />, { debug: DEBUG });

      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <button>Sign out</button>
            <Component ssr-required>
              <Projection ssr-required>
                <Component ssr-required>https://picsum.photos/200</Component>
              </Projection>
            </Component>
          </div>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <p>User is not signed in</p>
        </Component>
      );
    });

    it('#7000 - should render promise in th q:template', async () => {
      const TheCursedReveal = component$<{
        open: boolean;
      }>(({ open }) => {
        return <>{open && <Slot />}</>;
      });

      const Issue7000 = component$(() => {
        const open = useSignal(false);

        async function t(key: string): Promise<string> {
          return Promise.resolve(key);
        }

        return (
          <>
            <button onClick$={() => (open.value = !open.value)}></button>
            <TheCursedReveal open={open.value}>{t('I am an async string')}</TheCursedReveal>
          </>
        );
      });

      const { vNode, document } = await render(<Issue7000 />, { debug: DEBUG });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <Projection ssr-required>{''}</Projection>
            </Component>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button></button>
            <Component ssr-required>
              <Fragment ssr-required>
                <Projection ssr-required>
                  <Awaited ssr-required>{'I am an async string'}</Awaited>
                </Projection>
              </Fragment>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });
});
