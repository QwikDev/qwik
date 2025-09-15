import {
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  Resource,
  Fragment as Signal,
  component$,
  useResource$,
  useSignal,
  useStore,
  type ResourceReturn,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { ChoreType } from '../shared/util-chore-type';

const debug = false; //true;
Error.stackTraceLimit = 100;

export function mutable(value: any) {
  return value;
}

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useResource', ({ render }) => {
  it('should execute resource task', async () => {
    const TestCmp = component$(() => {
      const rsrc = useResource$(() => 'RESOURCE_VALUE');
      return (
        <div>
          <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
        </div>
      );
    });

    const { vNode } = await render(<TestCmp />, { debug });
    const result = <span>RESOURCE_VALUE</span>;
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <InlineComponent>
            <Fragment>
              <Awaited>{result}</Awaited>
            </Fragment>
          </InlineComponent>
        </div>
      </Component>
    );
  });

  it('should update resource task', async () => {
    const TestCmp = component$(() => {
      const count = useSignal(0);
      const rsrc = useResource$(async ({ track }) => {
        return track(count);
      });
      return (
        <button onClick$={() => count.value++}>
          <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<TestCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <span>0</span>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <span>1</span>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should show loading state', async () => {
    (global as any).delay = () => new Promise<void>((res) => ((global as any).delay.resolve = res));
    const ResourceCmp = component$(() => {
      const count = useSignal(0);
      const rsrc = useResource$(async ({ track }) => {
        const value = track(() => count.value);
        if (count.value === 1) {
          await (global as any).delay();
        }
        return value;
      });
      return (
        <button onClick$={() => count.value++}>
          <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} onPending={() => '...'} />
        </button>
      );
    });
    const { vNode, container } = await render(<ResourceCmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <span>0</span>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click', {}, { waitForIdle: false });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>...</Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );
    await (global as any).delay.resolve();
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <span>1</span>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );
    (global as any).delay = undefined;
  });

  it('should immediately increment button count', async () => {
    (global as any).delay = () => new Promise<void>((res) => ((global as any).delay.resolve = res));
    const ResourceCmp = component$(() => {
      const count = useSignal(0);
      const resource = useResource$<number>(async ({ track }) => {
        track(count);
        const value = count.value;
        if (count.value >= 1) {
          await (global as any).delay();
        }
        return value;
      });

      return (
        <>
          <button onClick$={() => count.value++}>{count.value}</button>
          <Resource value={resource} onResolved={(data) => <div>{data}</div>} />
        </>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>0</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <div>0</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click', {}, { waitForIdle: false });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>1</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <div>0</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await (global as any).delay.resolve();
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>1</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <div>1</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    (global as any).delay = undefined;
  });

  it('should handle multiple the same resource tasks', async () => {
    (global as any).delay = () => new Promise<void>((res) => ((global as any).delay.resolve = res));

    const ResourceRaceCondition = component$(() => {
      const count = useSignal(0);
      const resource = useResource$<number>(async ({ track }) => {
        track(count);
        const value = count.value;
        if (count.value === 1) {
          await (global as any).delay();
        }
        return value;
      });

      return (
        <>
          <button onClick$={() => count.value++}>{count.value}</button>
          <Resource value={resource} onResolved={(data) => <div>{data}</div>} />
        </>
      );
    });

    const { vNode, container } = await render(<ResourceRaceCondition />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>0</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <div>0</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    // double click
    await trigger(container.element, 'button', 'click', {}, { waitForIdle: false });
    await trigger(container.element, 'button', 'click', {}, { waitForIdle: false });
    await (global as any).delay.resolve();
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>2</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <div>2</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
  });

  it('should render component on resolved', async () => {
    const MyButton = component$(() => {
      return <div></div>;
    });

    const Cmp = component$(() => {
      const text = useSignal('');

      const textResource = useResource$(async (ctx) => {
        return ctx.track(() => text.value);
      });

      return (
        <>
          <Resource
            value={textResource}
            onResolved={() => (
              <>
                <MyButton />
              </>
            )}
          />
        </>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <Fragment>
                  <Component>
                    <div></div>
                  </Component>
                </Fragment>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
  });

  it('should update elements correctly inside onResolved fn', async () => {
    const ResourceCmp = component$(() => {
      const count = useSignal(0);
      const resource = useResource$<number>(async ({ track }) => {
        track(count);
        return count.value + 10;
      });

      return (
        <>
          <button onClick$={() => count.value++}>{count.value}</button>
          <Resource
            value={resource}
            // uncomment to test pending WORKING and test pass
            // onPending={() => <p>Loading..</p>}
            onRejected={() => <p>error ...</p>}
            onResolved={(data) => (
              <>
                <div>{data}</div>
                <input value={data} />
              </>
            )}
          />
        </>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>0</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <Fragment ssr-required>
                  <div>10</div>
                  <input value="10" />
                </Fragment>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>1</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <Awaited ssr-required>
                <Fragment ssr-required>
                  <div>11</div>
                  <input value="11" />
                </Fragment>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
  });

  it('should track subscription', async () => {
    const Results = component$((props: { result: ResourceReturn<number> }) => {
      const state = useStore({
        count: 0,
      });
      return (
        <div>
          <Resource
            value={props.result}
            onResolved={(number) => {
              return (
                <>
                  <div>resource 1 is {number}</div>
                  <button onClick$={() => state.count++}>
                    count is {mutable(state.count + 0)}
                  </button>
                </>
              );
            }}
          />
        </div>
      );
    });

    const ResourceApp = component$(() => {
      const resource = useResource$<number>(() => {
        return 0;
      });

      return <Results result={resource} />;
    });

    const { vNode, document } = await render(<ResourceApp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <InlineComponent>
              <Fragment>
                <Awaited>
                  <Fragment>
                    <div>
                      {'resource 1 is '}
                      {'0'}
                    </div>
                    <button>{'count is '}0</button>
                  </Fragment>
                </Awaited>
              </Fragment>
            </InlineComponent>
          </div>
        </Component>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <InlineComponent>
              <Fragment>
                <Awaited>
                  <Fragment>
                    <div>
                      {'resource 1 is '}
                      {'0'}
                    </div>
                    <button>{'count is '}1</button>
                  </Fragment>
                </Awaited>
              </Fragment>
            </InlineComponent>
          </div>
        </Component>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <InlineComponent>
              <Fragment>
                <Awaited>
                  <Fragment>
                    <div>
                      {'resource 1 is '}
                      {'0'}
                    </div>
                    <button>{'count is '}2</button>
                  </Fragment>
                </Awaited>
              </Fragment>
            </InlineComponent>
          </div>
        </Component>
      </Component>
    );
  });

  it('should render array from resource', async () => {
    const Cmp = component$(() => {
      const resource = useResource$(() => {
        return [
          {
            id: 1,
            name: 'John Doe',
            age: 30,
          },
          {
            id: 2,
            name: 'Jane Smith',
            age: 25,
          },
        ];
      });

      return (
        <Resource
          value={resource}
          onResolved={(res) => {
            return res.map((val, index) => (
              <div key={index}>
                <p>{val.id}</p>
                <p>{val.name}</p>
                <p>{val.age}</p>
              </div>
            ));
          }}
        />
      );
    });

    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <InlineComponent>
          <Fragment>
            <Awaited>
              <div>
                <p>
                  <Signal>1</Signal>
                </p>
                <p>
                  <Signal>John Doe</Signal>
                </p>
                <p>
                  <Signal>30</Signal>
                </p>
              </div>
              <div>
                <p>
                  <Signal>2</Signal>
                </p>
                <p>
                  <Signal>Jane Smith</Signal>
                </p>
                <p>
                  <Signal>25</Signal>
                </p>
              </div>
            </Awaited>
          </Fragment>
        </InlineComponent>
      </Component>
    );
  });
});
