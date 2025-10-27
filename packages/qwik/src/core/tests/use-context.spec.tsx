import {
  $,
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as Projection,
  Slot,
  Fragment as WrappedSignal,
  _getDomContainer,
  component$,
  createContextId,
  getPlatform,
  noSerialize,
  setPlatform,
  useContext,
  useContextProvider,
  useSignal,
  type NoSerialize,
} from '@qwik.dev/core';
import { renderToString } from '@qwik.dev/core/server';
import {
  createDocument,
  domRender,
  emulateExecutionOfQwikFuncs,
  ssrRenderToDom,
  trigger,
} from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Signal } from '../reactive-primitives/signal.public';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import * as qError from '../shared/error/error';

const debug = false; //true;
Error.stackTraceLimit = 100;

vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

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
      <Component ssr-required>
        <Component ssr-required>
          <span>CONTEXT_VALUE</span>
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
      <Component ssr-required>
        <Component ssr-required>
          <span>CONTEXT_VALUE</span>
        </Component>
      </Component>
    );
  });

  it('should add slot information for empty array', async () => {
    const qErrorSpy = vi.spyOn(qError, 'qError');
    const contextId = createContextId('contextId');

    const ContextProducer = component$(() => {
      const context = {
        disabled: false,
      };
      useContextProvider(contextId, context);
      return <Slot />;
    });

    const ProducerParent = component$(() => {
      return (
        <ContextProducer>
          <Slot />
        </ContextProducer>
      );
    });

    const ContextConsumer = component$(() => {
      useContext(contextId);
      return <Slot />;
    });

    const Parent = component$(() => {
      const array = useSignal<string[]>([]);
      return (
        <>
          <ProducerParent>
            {array.value.map((_, index) => (
              <ContextConsumer key={index} />
            ))}
          </ProducerParent>
          <button onClick$={() => (array.value = ['test'])}></button>
        </>
      );
    });

    try {
      const { document } = await render(
        <ErrorProvider>
          <Parent />
        </ErrorProvider>,
        { debug }
      );
      await trigger(document.body, 'button', 'click');
      expect(qErrorSpy).not.toHaveBeenCalled();
    } catch (e) {
      expect(qErrorSpy).not.toHaveBeenCalled();
    }
  });

  it('should find context parent from Slot inside Slot', async () => {
    const qErrorSpy = vi.spyOn(qError, 'qError');
    const contextId = createContextId('contextId');

    const ContextProducer = component$(() => {
      const context = {
        disabled: false,
      };
      useContextProvider(contextId, context);
      return <Slot />;
    });

    const ProducerParent = component$(() => {
      return (
        <ContextProducer>
          <Slot />
        </ContextProducer>
      );
    });

    const ContextConsumer = component$(() => {
      useContext(contextId);
      return <Slot />;
    });

    const Parent = component$(() => {
      return (
        <ProducerParent>
          <ContextConsumer />
        </ProducerParent>
      );
    });

    try {
      await render(
        <ErrorProvider>
          <Parent />
        </ErrorProvider>,
        { debug }
      );
      expect(qErrorSpy).not.toHaveBeenCalled();
    } catch (e) {
      expect(qErrorSpy).not.toHaveBeenCalled();
    }
  });

  it('should find context with falsy value', async () => {
    const ctxIf = createContextId<any>('if');
    const ctxIf2 = createContextId<any>('if2');
    const ctxIf3 = createContextId<any>('if3');

    const Child = component$(() => {
      const value = useContext(ctxIf);
      const value2 = useContext(ctxIf2);
      const value3 = useContext(ctxIf3);
      return (
        <>
          {value}
          {value2}
          {value3}
        </>
      );
    });

    const Cmp = component$(() => {
      useContextProvider(ctxIf, '');
      useContextProvider(ctxIf2, false);
      useContextProvider(ctxIf3, null);
      return (
        <div>
          <Child />
        </div>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <Component ssr-required>
            <Fragment ssr-required>
              {''}
              {''}
              {''}
            </Fragment>
          </Component>
        </div>
      </Component>
    );
  });

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
        <Component ssr-required>
          <Projection ssr-required>
            <Component ssr-required>
              <div>
                <Awaited ssr-required>
                  <Component ssr-required>
                    <Fragment ssr-required>
                      <p>1</p>
                      <p>
                        <Awaited ssr-required>0</Awaited>
                      </p>
                      <p>
                        <WrappedSignal ssr-required>0</WrappedSignal>
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
        <Component ssr-required>
          <Projection ssr-required>
            <Component ssr-required>
              <div>
                <Awaited ssr-required>
                  <Component ssr-required>
                    <Fragment ssr-required>
                      <p>1</p>
                      <p>
                        <Awaited ssr-required>2</Awaited>
                      </p>
                      <p>
                        <WrappedSignal ssr-required>2</WrappedSignal>
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
        <Component ssr-required>
          <Component ssr-required>
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
        <Component ssr-required>
          <Component ssr-required>
            <div>
              <button id="issue-5270-button">toggle</button>
              <br></br>
              <Projection ssr-required>
                <Component ssr-required>
                  <div id="issue-5270-div">
                    {'Ctx: '}
                    {'hello'}
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
      const result = await renderToString(
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
