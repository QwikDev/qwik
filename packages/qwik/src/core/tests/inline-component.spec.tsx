import {
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  Fragment as Projection,
  Slot,
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
  type PublicProps,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import * as logUtils from '../shared/utils/log';

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

const ChildInline = () => {
  return <div>Child inline</div>;
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
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <InlineComponent ssr-required>
            <InlineComponent ssr-required>
              <Fragment ssr-required>
                <h1>Test</h1>
                <p>Lorem</p>
                <h2>ipsum</h2>
                <p>foo</p>
                <h2>bar</h2>
              </Fragment>
            </InlineComponent>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component>
            <div>Test</div>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <InlineComponent ssr-required>
            <InlineComponent ssr-required>
              <Fragment ssr-required>
                <h1>Test</h1>
                <p>Lorem</p>
                <h2>ipsum</h2>
                <p>foo</p>
                <h2>bar</h2>
              </Fragment>
            </InlineComponent>
          </InlineComponent>
        </Fragment>
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
                  <Fragment ssr-required>{'0'}</Fragment>
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
                  <Fragment ssr-required>{'1'}</Fragment>
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
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <InlineComponent ssr-required>
                <div>foo</div>
              </InlineComponent>
            </Fragment>
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
            <Fragment ssr-required>
              <InlineComponent ssr-required>
                <span>bar</span>
              </InlineComponent>
            </Fragment>
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
            <Fragment ssr-required>
              <InlineComponent ssr-required>
                <div>foo</div>
              </InlineComponent>
            </Fragment>
          </InlineComponent>
        </footer>
      </Component>
    );
  });

  it('should rerender without locate error', async () => {
    const errorSpy = vi.spyOn(logUtils, 'throwErrorAndStop');
    const ReplOutputPanel = component$(() => {
      const store = useStore<any>({
        selectedOutputPanel: 'app',
        serverUrl: undefined,
      });

      const ReplTabButton = (props: any) => {
        return (
          <button id={props.id} class={{ 'active-tab': props.isActive }} onClick$={props.onClick$}>
            {props.text}
          </button>
        );
      };

      useVisibleTask$(() => {
        store.serverUrl = 'test';
      });

      return (
        <div>
          <ReplTabButton
            text="App"
            id="1"
            isActive={store.selectedOutputPanel === 'app'}
            onClick$={async () => {
              store.selectedOutputPanel = 'app';
            }}
          />

          <ReplTabButton
            text="HTML"
            id="2"
            isActive={store.selectedOutputPanel === 'html'}
            onClick$={async () => {
              store.selectedOutputPanel = 'html';
            }}
          />

          {store.serverUrl && <div>test</div>}
        </div>
      );
    });

    const { vNode, document } = await render(<ReplOutputPanel />, { debug });

    if (render === ssrRenderToDom) {
      await trigger(document.body, 'div', 'qvisible');
    }

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <button id="1" class="active-tab">
              App
            </button>
          </Component>
          <Component>
            <button id="2" class="">
              HTML
            </button>
          </Component>
          <div>test</div>
        </div>
      </Component>
    );

    await trigger(document.body, 'button[id="2"]', 'click');

    expect(errorSpy).not.toHaveBeenCalled();

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <button id="1" class="">
              App
            </button>
          </Component>
          <Component>
            <button id="2" class="active-tab">
              HTML
            </button>
          </Component>
          <div>test</div>
        </div>
      </Component>
    );
  });

  it('should render component$ inside inlined wrapper', async () => {
    interface ComplexWrapperProps {
      foo: string;
    }

    const ComplexWrapper = (
      props: PublicProps<ComplexWrapperProps>,
      key: string | null,
      flags: number
    ) => {
      const cmpFn = component$<ComplexWrapperProps>(({ foo }) => {
        return (
          <div>
            {foo}: <Slot />
          </div>
        );
      });
      return cmpFn(props, key, flags);
    };

    const { vNode } = await render(
      <ComplexWrapper foo="aaa">
        <div>
          bar: <div id="1">Test</div>
        </div>
      </ComplexWrapper>,
      { debug }
    );
    expect(vNode).toMatchVDOM(
      <InlineComponent>
        <Component>
          <div>
            aaa
            {': '}
            <Projection>
              <div>
                {'bar: '}
                <div id="1">Test</div>
              </div>
            </Projection>
          </div>
        </Component>
      </InlineComponent>
    );
  });

  it('should render component$ inside inlined wrapper - case 2', async () => {
    interface ComplexWrapperProps {
      foo: string;
      aaa: string;
    }

    const ComplexWrapper = (
      props: PublicProps<ComplexWrapperProps>,
      key: string | null,
      flags: number
    ) => {
      const cmpFn = component$<ComplexWrapperProps>(({ foo }) => {
        const cmpFn2 = component$<ComplexWrapperProps>(({ aaa }) => {
          return (
            <div>
              {aaa}: <Slot />
            </div>
          );
        });
        return (
          <div>
            {foo}: <Slot />
            {cmpFn2({ ...props, children: 'Test2' }, key, flags)}
          </div>
        );
      });
      return cmpFn(props, key, flags);
    };

    const { vNode } = await render(
      <ComplexWrapper foo="bar" aaa="bbb">
        Test
      </ComplexWrapper>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <InlineComponent>
        <Component>
          <div>
            {'bar'}
            {': '}
            <Projection>Test</Projection>
            <Component>
              <div>
                {'bbb'}
                {': '}
                <Projection>Test2</Projection>
              </div>
            </Component>
          </div>
        </Component>
      </InlineComponent>
    );
  });

  it('should render swap component$ and inline component with the same key', async () => {
    const Child = component$(() => {
      return <div>Child component$</div>;
    });

    const Parent = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {/* same key, simulate different routes and files, but the same keys at the same place */}
          {toggle.value ? <ChildInline key="samekey" /> : <Child key="samekey" />}
        </>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <InlineComponent ssr-required>
            <div>Child inline</div>
          </InlineComponent>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>Child component$</div>
          </Component>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <InlineComponent ssr-required>
            <div>Child inline</div>
          </InlineComponent>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>Child component$</div>
          </Component>
        </Fragment>
      </Component>
    );
  });
});
