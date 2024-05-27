import {
  $,
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as Projection,
  Fragment as DerivedSignal,
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  Slot,
  component$,
  noSerialize,
  type NoSerialize,
  type Signal,
  getPlatform,
  setPlatform,
  _getDomContainer,
} from '@builder.io/qwik';
import { describe, expect, it } from 'vitest';
import {
  trigger,
  domRender,
  ssrRenderToDom,
  createDocument,
  emulateExecutionOfQwikFuncs,
} from '@builder.io/qwik/testing';
import '../../../testing/vdom-diff.unit-util';
import { renderToString2 } from 'packages/qwik/src/server/v2-ssr-render2';

const debug = true; //true;
Error.stackTraceLimit = 100;

/**
 * Below are helper functions that are constant. They have to be in the top level scope so that the
 * optimizer doesn't consider them as captured scope. It would be great if the optimizer could
 * detect that these are constant and don't require capturing.
 */
interface MyStore {
  value: number;
}
const myFooFnContext = createContextId<MyStore>('mytitle');
const useFooFn = () => {
  const state = useContext(myFooFnContext);

  return $((val: number) => {
    return (state.value + val).toString();
  });
};

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useContext', ({ render }) => {
  it('should provide and retrieve a context', async () => {
    const contextId = createContextId<{ value: string }>('myTest');
    const Consumer = component$(() => {
      const ctxValue = useContext(contextId);
      return <span>{ctxValue.value}</span>;
    });
    const Provider = component$(() => {
      useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
      return <Consumer />;
    });

    const { vNode } = await render(<Provider />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <span>
            <DerivedSignal>CONTEXT_VALUE</DerivedSignal>
          </span>
        </Component>
      </Component>
    );
  });
  it('should provide and retrieve a context on client change', async () => {
    const contextId = createContextId<{ value: string }>('myTest');
    const Consumer = component$(() => {
      const ctxValue = useContext(contextId);
      return <span>{ctxValue.value}</span>;
    });
    const Provider = component$(() => {
      useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
      const show = useSignal(false);
      return show.value ? <Consumer /> : <button onClick$={() => (show.value = true)} />;
    });

    const { vNode, document } = await render(<Provider />, { debug });
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <span>
            <DerivedSignal>CONTEXT_VALUE</DerivedSignal>
          </span>
        </Component>
      </Component>
    );
  });

  // it('should provide and retrieve a context with non-serializable content changing inside', async () => {
  //   const contextId = createContextId<Signal<NoSerialize<{ data: string }>>>('myTest1');
  //   const Consumer = component$(() => {
  //     const ctxValue = useContext(contextId);
  //     return <span>{ctxValue.value?.data}</span>;
  //   });
  //   const Provider = component$(() => {
  //     const data = useSignal();
  //     useContextProvider(contextId, data);
  //     const show = useSignal(false);

  //     useTask$(({ track }) => {
  //       track(() => show.value);
  //       data.value = noSerialize({ data: 'UPDATED_CONTEXT_VALUE' });
  //     });

  //     return (
  //       <>
  //         <button
  //           onClick$={() => {
  //             show.value = true;
  //           }}
  //         />
  //         <Slot />
  //       </>
  //     );
  //   });

  //   const { vNode, document } = await render(
  //     <Provider>
  //       <Consumer />
  //     </Provider>,
  //     { debug }
  //   );
  //   console.log('click');
  //   await trigger(document.body, 'button', 'click');
  //   expect(vNode).toMatchVDOM(<Component>{/* <Fragment> */}</Component>);
  // });

  describe('regression', () => {
    it('#4038', async () => {
      interface IMyComponent {
        val: string;
      }
      const MyComponent = component$((props: IMyComponent) => {
        const count = useSignal(0);
        const c = useFooFn();

        return (
          <>
            <p>{props.val}</p>
            <p>{c(count.value)}</p>
            <p>{count.value}</p>
            <button onClick$={() => count.value++}>Increment</button>
          </>
        );
      });

      const Parent = component$(() => {
        const c = useFooFn();

        return (
          <div>
            {c(1).then((val) => (
              <MyComponent val={val} />
            ))}
          </div>
        );
      });

      const Layout = component$(() => {
        useContextProvider(myFooFnContext, {
          value: 0,
        });
        return <Slot />;
      });
      const { vNode, document } = await render(
        <Layout>
          <Parent />
        </Layout>,
        { debug }
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Projection>
            <Component>
              <div>
                <Awaited>
                  <Component>
                    <Fragment>
                      <p>
                        <DerivedSignal>1</DerivedSignal>
                      </p>
                      <p>
                        <Awaited>0</Awaited>
                      </p>
                      <p>
                        <DerivedSignal>0</DerivedSignal>
                      </p>
                      <button>Increment</button>
                    </Fragment>
                  </Component>
                </Awaited>
              </div>
            </Component>
          </Projection>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Projection>
            <Component>
              <div>
                <Awaited>
                  <Component>
                    <Fragment>
                      <p>
                        <DerivedSignal>1</DerivedSignal>
                      </p>
                      <p>
                        <Awaited>2</Awaited>
                      </p>
                      <p>
                        <DerivedSignal>2</DerivedSignal>
                      </p>
                      <button>Increment</button>
                    </Fragment>
                  </Component>
                </Awaited>
              </div>
            </Component>
          </Projection>
        </Component>
      );
    });
    it('#5270 - retrieve context on un-projected component', async () => {
      const Issue5270Context = createContextId<{ hi: string }>('5270');
      const ProviderParent = component$(() => {
        useContextProvider(Issue5270Context, { hi: 'hello' });
        const projectSlot = useSignal(false);
        return (
          <div>
            <button
              id="issue-5270-button"
              onClick$={() => (projectSlot.value = !projectSlot.value)}
            >
              toggle
            </button>
            <br />
            {projectSlot.value && <Slot />}
          </div>
        );
      });
      const ContextChild = component$(() => {
        // return <debug />;
        const t = useContext(Issue5270Context);
        return <div id="issue-5270-div">Ctx: {t.hi}</div>;
      });
      const Issue5270 = component$(() => {
        useContextProvider(Issue5270Context, { hi: 'wrong' });
        return (
          <ProviderParent>
            <ContextChild />
          </ProviderParent>
        );
      });
      const { vNode, document } = await render(<Issue5270 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div>
              <button id="issue-5270-button">toggle</button>
              <br></br>
              {'' /** Slot not projected */}
            </div>
          </Component>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div>
              <button id="issue-5270-button">toggle</button>
              <br></br>
              <Projection>
                <Component>
                  <div id="issue-5270-div">
                    {'Ctx: '}
                    <DerivedSignal>{'hello'}</DerivedSignal>
                  </div>
                </Component>
              </Projection>
            </div>
          </Component>
        </Component>
      );
    });
  });
});

describe('html wrapper', () => {
  it('should provide and retrieve a context in client', async () => {
    const contextId = createContextId<Signal<NoSerialize<{ value: string }>>>('myTest');
    const Consumer = component$(() => {
      const ctxValue = useContext(contextId);
      return <span>{ctxValue.value?.value}</span>;
    });
    const Test = component$(() => {
      const data = useContext(contextId);
      const show = useSignal(false);

      return (
        <>
          <button
            onClick$={() => {
              data.value = noSerialize({ value: 'CONTEXT_VALUE' });
              show.value = true;
            }}
          ></button>
          {show.value && <Consumer />}
        </>
      );
    });
    const Provider = component$(() => {
      const data = useSignal();
      useContextProvider(contextId, data);

      return <Slot />;
    });

    let document = createDocument();
    const platform = getPlatform();
    try {
      const result = await renderToString2(
        <Provider>
          <head></head>
          <body>
            <Test />
          </body>
        </Provider>
      );
      document = createDocument({ html: result.html });
    } finally {
      setPlatform(platform);
    }

    emulateExecutionOfQwikFuncs(document);
    const container = _getDomContainer(document.querySelector('[q\\:container]')!);

    await trigger(container.document.body, 'button', 'click');

    expect(document.querySelector('span')?.innerHTML).toContain('CONTEXT_VALUE');
  });
});
