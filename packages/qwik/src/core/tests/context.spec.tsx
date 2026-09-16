import {
  $,
  component$,
  createContextId,
  noSerialize,
  Slot,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  type NoSerialize,
  type Signal,
} from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: context`, () => {
  it('should provide and retrieve context', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-integration');
      const source = useSignal('provided');
      useContextProvider(contextId, source);
      const context = useContext(contextId);

      return <p>{context.value}</p>;
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('provided');
    cleanup();
  });

  it('should keep retrieved context reactive', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-reactive');
      const source = useSignal('before');
      useContextProvider(contextId, source);
      const context = useContext(contextId);

      return <button onClick$={() => (context.value = 'after')}>{context.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('before');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('after');

    cleanup();
  });

  it('should provide and retrieve context in nested component', async () => {
    const contextId = createContextId<Signal<string>>('context-integration');
    const MyComp = () => {
      const source = useSignal('provided');
      useContextProvider(contextId, source);

      return <Child />;
    };

    const Child = () => {
      const context = useContext(contextId);
      return <p>{context.value}</p>;
    };
    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('provided');
    cleanup();
  });

  it('should provide and retrieve context in dynamic component', async () => {
    const contextId = createContextId<Signal<string>>('context-integration');
    const MyComp = () => {
      const source = useSignal('provided');
      useContextProvider(contextId, source);
      const toggle = useSignal(false);

      return (
        <button onClick$={() => (toggle.value = !toggle.value)}>
          {toggle.value ? <Child /> : null}
        </button>
      );
    };

    const Child = () => {
      const context = useContext(contextId);
      return <span>{context.value}</span>;
    };
    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    expect(container.querySelector('span')).toBeUndefined();

    const button = container.querySelector('button');
    await qwikLoader?.dispatch(button!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('should ignore closed nested context scopes for dynamic components', async () => {
    const contextId = createContextId<Signal<string>>('context-nearest-open');
    const MyComp = () => {
      const source = useSignal('outer');
      const toggle = useSignal(false);
      useContextProvider(contextId, source);

      return (
        <section>
          <Inner />
          <button onClick$={() => (toggle.value = true)}>
            {toggle.value ? <OuterChild /> : null}
          </button>
        </section>
      );
    };

    const Inner = () => {
      const source = useSignal('inner');
      useContextProvider(contextId, source);
      return <InnerChild />;
    };

    const InnerChild = () => {
      const context = useContext(contextId);
      return <span id="inner">{context.value}</span>;
    };

    const OuterChild = () => {
      const context = useContext(contextId);
      return <span id="outer">{context.value}</span>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    expect(container.querySelector('#inner')?.textContent).toBe('inner');
    expect(container.querySelector('#outer')).toBeUndefined();

    const button = container.querySelector('button');
    await qwikLoader?.dispatch(button!, 'click');

    expect(container.querySelector('#outer')?.textContent).toBe('outer');
    cleanup();
  });

  it('should provide and retrieve context in dynamic for block component', async () => {
    const contextId = createContextId<Signal<string>>('context-for-integration');
    const MyComp = () => {
      const source = useSignal('provided');
      const items = useSignal<string[]>([]);
      useContextProvider(contextId, source);

      return (
        <button onClick$={() => (items.value = ['child'])}>
          {items.value.map((item) => (
            <Child key={item} />
          ))}
        </button>
      );
    };

    const Child = () => {
      const context = useContext(contextId);
      return <span>{context.value}</span>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    expect(container.querySelector('span')).toBeUndefined();

    const button = container.querySelector('button');
    await qwikLoader?.dispatch(button!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('should allow a consumer to bind the context to a local named ctx', async () => {
    const contextId = createContextId<Signal<string>>('context-local-ctx-name');
    const Child = () => {
      const ctx = useContext(contextId);
      return <span>{ctx.value}</span>;
    };

    const MyComp = () => {
      const source = useSignal('provided');
      useContextProvider(contextId, source);
      return <Child />;
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('should grow a store-sized collection of context consumers', async () => {
    const contextId = createContextId<Signal<string>>('context-store-collection');
    const Child = () => {
      const context = useContext(contextId);
      return <span class="row">{context.value}</span>;
    };

    const MyComp = () => {
      const source = useSignal('provided');
      const state = useStore({ count: 0 });
      useContextProvider(contextId, source);

      return (
        <div>
          <button onClick$={() => state.count++}>add</button>
          {Array.from({ length: state.count }).map((_, index) => (
            <Child key={index} />
          ))}
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const button = container.querySelector('button');
    expect(container.querySelectorAll('.row').length).toBe(0);

    await qwikLoader?.dispatch(button!, 'click');
    expect(container.querySelectorAll('.row').length).toBe(1);

    await qwikLoader?.dispatch(button!, 'click');
    expect(container.querySelectorAll('.row').length).toBe(2);
    expect(container.querySelector('.row')?.textContent).toBe('provided');

    cleanup();
  });
});

/** A custom hook reading a context, at module scope so nothing captures it. */
const fooContext = createContextId<{ value: number }>('mytitle');
const useFooFn = () => {
  const state = useContext(fooContext);
  return $((val: number) => (state.value + val).toString());
};

describe(`${name}: context through projections`, () => {
  it('retrieves a context in a consumer shown after a client change', async () => {
    const contextId = createContextId<{ value: string }>('myTest');
    const Consumer = component$(() => {
      const context = useContext(contextId);
      return <span>{context.value}</span>;
    });
    const Provider = component$(() => {
      useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
      const show = useSignal(false);
      return <>{show.value ? <Consumer /> : <button onClick$={() => (show.value = true)} />}</>;
    });
    const { container, cleanup, qwikLoader } = await render(Provider);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('span')?.textContent).toBe('CONTEXT_VALUE');
    cleanup();
  });

  it('finds the context for rows projected through a slot inside a slot', async () => {
    const contextId = createContextId<{ disabled: boolean }>('contextId');
    const ContextProducer = component$(() => {
      useContextProvider(contextId, { disabled: false });
      return <Slot />;
    });
    const ProducerParent = component$(() => (
      <ContextProducer>
        <Slot />
      </ContextProducer>
    ));
    const ContextConsumer = component$(() => {
      const value = useContext(contextId);
      return <i>{String(value.disabled)}</i>;
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
    const { container, cleanup, qwikLoader } = await render(Parent);
    expect(container.querySelector('i')).toBeFalsy();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('i')?.textContent).toBe('false');
    cleanup();
  });

  it('finds the context for a component projected through a slot inside a slot', async () => {
    const contextId = createContextId<{ disabled: boolean }>('contextId');
    const ContextProducer = component$(() => {
      useContextProvider(contextId, { disabled: true });
      return <Slot />;
    });
    const ProducerParent = component$(() => (
      <ContextProducer>
        <Slot />
      </ContextProducer>
    ));
    const ContextConsumer = component$(() => {
      const value = useContext(contextId);
      return <i>{String(value.disabled)}</i>;
    });
    const Parent = component$(() => (
      <ProducerParent>
        <ContextConsumer />
      </ProducerParent>
    ));
    const { container, cleanup } = await render(Parent);
    expect(container.querySelector('i')?.textContent).toBe('true');
    cleanup();
  });

  it('finds a context with a falsy value', async () => {
    const ctxIf = createContextId<any>('if');
    const ctxIf2 = createContextId<any>('if2');
    const ctxIf3 = createContextId<any>('if3');
    const Child = component$(() => {
      const value = useContext(ctxIf);
      const value2 = useContext(ctxIf2);
      const value3 = useContext(ctxIf3);
      return (
        <i>
          {JSON.stringify(value)}
          {JSON.stringify(value2)}
          {JSON.stringify(value3)}
        </i>
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
    const { container, cleanup } = await render(Cmp);
    expect(container.querySelector('i')?.textContent).toBe('""falsenull');
    cleanup();
  });

  it('keeps an unclaimed projection out of the render without a context error', async () => {
    const ContextBProvider = component$(() => <div>ContextBProvider</div>);
    const ContextCId = createContextId<Signal<string | undefined>>('contextC');
    const ContextCProvider = component$(() => {
      const signal = useSignal<string | undefined>();
      useContextProvider(ContextCId, signal);
      return <div>ContextCProvider</div>;
    });
    const Child = component$(() => {
      useContext(ContextCId);
      return <div>page path-1</div>;
    });
    const Layout = component$(() => (
      <ContextBProvider>
        <ContextCProvider>
          <Slot />
        </ContextCProvider>
      </ContextBProvider>
    ));
    const Cmp = component$(() => (
      <Layout>
        <Child />
      </Layout>
    ));
    const { container, cleanup } = await render(Cmp);
    const rendered = container.querySelectorAll('div');
    expect(rendered).toHaveLength(1);
    expect(rendered[0].textContent).toBe('ContextBProvider');
    cleanup();
  });

  it('#4038 resolves a context through a custom hook inside a promise child', async () => {
    const MyComponent = component$((props: { val: string }) => {
      const count = useSignal(0);
      const c = useFooFn();
      return (
        <>
          <p id="val">{props.val}</p>
          <p id="sum">{c(count.value)}</p>
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
      useContextProvider(fooContext, { value: 0 });
      return <Slot />;
    });
    const App = component$(() => (
      <Layout>
        <Parent />
      </Layout>
    ));
    const { container, cleanup, qwikLoader } = await render(App);
    expect(container.querySelector('#val')?.textContent).toBe('1');
    expect(container.querySelector('#sum')?.textContent).toBe('0');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#sum')?.textContent).toBe('2');
    cleanup();
  });

  it('#5270 resolves the context of the component whose slot claims the projection', async () => {
    const ctx = createContextId<{ hi: string }>('5270');
    const ProviderParent = component$(() => {
      useContextProvider(ctx, { hi: 'hello' });
      const projectSlot = useSignal(false);
      return (
        <div>
          <button onClick$={() => (projectSlot.value = !projectSlot.value)}>toggle</button>
          {projectSlot.value && <Slot />}
        </div>
      );
    });
    const ContextChild = component$(() => {
      const value = useContext(ctx);
      return <i>Ctx: {value.hi}</i>;
    });
    const Issue5270 = component$(() => {
      useContextProvider(ctx, { hi: 'wrong' });
      return (
        <ProviderParent>
          <ContextChild />
        </ProviderParent>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Issue5270);
    expect(container.querySelector('i')).toBeFalsy();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('i')?.textContent).toBe('Ctx: hello');
    cleanup();
  });

  it('provides a value written on the client through a projected consumer', async () => {
    const contextId = createContextId<Signal<NoSerialize<{ value: string }> | undefined>>('myTest');
    const Consumer = component$(() => {
      const data = useContext(contextId);
      return <span>{data.value?.value}</span>;
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
      const data = useSignal<NoSerialize<{ value: string }>>();
      useContextProvider(contextId, data);
      return <Slot />;
    });
    const App = component$(() => (
      <Provider>
        <Test />
      </Provider>
    ));
    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('span')?.textContent).toBe('CONTEXT_VALUE');
    cleanup();
  });
});

describe(`${name}: context across rendering callbacks`, () => {
  const contextId = createContextId<{ label: string }>('callbacks');
  const Consumer = component$(() => {
    const value = useContext(contextId);
    return <i>{value.label}</i>;
  });

  it('resolves a context for a consumer in a live slot after a swap', async () => {
    const Switch = component$((props: { pick: string }) => <Slot name={props.pick} />);
    const Provider = component$(() => {
      useContextProvider(contextId, { label: 'provided' });
      const flip = useSignal(false);
      return (
        <>
          <button onClick$={() => (flip.value = true)} />
          <Switch pick={flip.value ? 'b' : 'a'}>
            <span q:slot="a">a</span>
            <Consumer q:slot="b" />
          </Switch>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Provider);
    expect(container.querySelector('i')).toBeFalsy();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('i')?.textContent).toBe('provided');
    cleanup();
  });

  it('resolves a context for a consumer inside a dynamic tag', async () => {
    const Provider = component$(() => {
      useContextProvider(contextId, { label: 'provided' });
      const tag = useSignal('section');
      const Tag = tag.value;
      return (
        <Tag>
          <button onClick$={() => (tag.value = 'article')} />
          <Consumer />
        </Tag>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Provider);
    expect(container.querySelector('section > i')?.textContent).toBe('provided');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('article > i')?.textContent).toBe('provided');
    cleanup();
  });

  it('resolves a context for a consumer rendered from a promise after a client change', async () => {
    const Provider = component$(() => {
      useContextProvider(contextId, { label: 'provided' });
      const show = useSignal(false);
      return (
        <div>
          <button onClick$={() => (show.value = true)} />
          {show.value && Promise.resolve(1).then(() => <Consumer />)}
        </div>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Provider);
    expect(container.querySelector('i')).toBeFalsy();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('i')?.textContent).toBe('provided');
    cleanup();
  });

  it('resolves a context for a consumer held in a signal', async () => {
    const Provider = component$(() => {
      useContextProvider(contextId, { label: 'provided' });
      const content = useSignal<unknown>(null);
      return (
        <div>
          <button onClick$={() => (content.value = <Consumer />)} />
          {content.value}
        </div>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Provider);
    expect(container.querySelector('i')).toBeFalsy();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('i')?.textContent).toBe('provided');
    cleanup();
  });
});
