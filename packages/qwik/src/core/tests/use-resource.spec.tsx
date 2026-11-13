import {
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
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

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
          <InlineComponent>{result}</InlineComponent>
        </div>
      </Component>
    );
  });

  it('should update resource task', async () => {
    const TestCmp = component$(() => {
      const count = useSignal(0);
      const rsrc = useResource$<number>(async ({ track }) => {
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
            <span>0</span>
          </InlineComponent>
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    await waitForDrain(container);
    await waitForDrain(container);
    await waitForDrain(container);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>1</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should show loading state', async () => {
    (global as any)._resDelay = () =>
      new Promise<void>((res) => ((global as any)._resDelay.resolve = res));
    const ResourceCmp = component$(() => {
      const count = useSignal(0);
      const rsrc = useResource$(async ({ track }) => {
        const value = track(() => count.value);
        if (count.value === 1) {
          await (global as any)._resDelay();
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

    if (render === domRender) {
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <InlineComponent>...</InlineComponent>
          </button>
        </Component>
      );
      await waitForDrain(container);
    }
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>0</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>...</InlineComponent>
        </button>
      </Component>
    );

    await (global as any)._resDelay.resolve();
    // Give the resource a tick to resolve
    await waitForDrain(container);
    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>1</span>
          </InlineComponent>
        </button>
      </Component>
    );
    (global as any)._resDelay = undefined;
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
            <div>0</div>
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
            <div>0</div>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await (global as any).delay.resolve();
    // let the resource completion chain schedule the render before draining
    await new Promise((resolve) => setTimeout(resolve, 0));
    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>1</Signal>
          </button>
          <InlineComponent ssr-required>
            <div>1</div>
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
            <div>0</div>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    // click twice
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');
    await (global as any).delay.resolve();

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>2</Signal>
          </button>
          <InlineComponent ssr-required>
            <div>2</div>
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
              <Component>
                <div></div>
              </Component>
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
              <div>10</div>
              <input value="10" />
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            <Signal ssr-required>1</Signal>
          </button>
          <InlineComponent ssr-required>
            <Fragment ssr-required>
              <div>11</div>
              <input value="11" />
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
      <InlineComponent>
        <InlineComponent>
          <div>
            <InlineComponent>
              <Fragment>
                <div>
                  {'resource 1 is '}
                  {'0'}
                </div>
                <button>{'count is '}0</button>
              </Fragment>
            </InlineComponent>
          </div>
        </InlineComponent>
      </InlineComponent>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div>
            <InlineComponent ssr-required>
              <Fragment ssr-required>
                <div>
                  {'resource 1 is '}
                  {'0'}
                </div>
                <button>{'count is '}1</button>
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
                <div>
                  {'resource 1 is '}
                  {'0'}
                </div>
                <button>{'count is '}2</button>
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
        </InlineComponent>
      </Component>
    );
  });

  it('should not mutate the cached object when the resource starts from null', async () => {
    const caseA = { name: 'Case A', items: ['knife', 'gloves'], featured: true };
    const caseB = { name: 'Case B', items: ['sticker'] };
    (global as any).resourceCache = { a: caseA, b: caseB };

    const ResourceCmp = component$(() => {
      const selected = useSignal<null | 'a' | 'b'>(null);
      const resource = useResource$(async ({ track }) => {
        const key = track(selected);
        if (!key) {
          return null;
        }
        return (global as any).resourceCache[key];
      });
      return (
        <button
          onClick$={() => {
            selected.value = selected.value === null ? 'a' : selected.value === 'a' ? 'b' : 'a';
          }}
        >
          <Resource value={resource} onResolved={(value) => <span>{JSON.stringify(value)}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    const settle = async () => {
      await waitForDrain(container);
      await waitForDrain(container);
      await waitForDrain(container);
      await waitForDrain(container);
    };
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>null</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await settle();
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"name":"Case A","items":["knife","gloves"],"featured":true}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await settle();
    expect((global as any).resourceCache.a).toEqual({
      name: 'Case A',
      items: ['knife', 'gloves'],
      featured: true,
    });

    await trigger(container.element, 'button', 'click');
    await settle();
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"name":"Case A","items":["knife","gloves"],"featured":true}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );
    (global as any).resourceCache = undefined;
  });

  it('should drop object keys missing when the next resource result is a store proxy', async () => {
    const ResourceCmp = component$(() => {
      const mode = useSignal<'a' | 'b'>('a');
      const storeA = useStore({ name: 'Case A', items: ['knife', 'gloves'], featured: true });
      const storeB = useStore({ name: 'Case B', items: ['sticker'] });
      const resource = useResource$(async ({ track }) => {
        track(mode);
        return mode.value === 'a' ? storeA : storeB;
      });
      return (
        <button
          onClick$={() => {
            mode.value = mode.value === 'a' ? 'b' : 'a';
          }}
        >
          <Resource value={resource} onResolved={(value) => <span>{JSON.stringify(value)}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    const settle = async () => {
      await waitForDrain(container);
      await waitForDrain(container);
      await waitForDrain(container);
      await waitForDrain(container);
    };
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"name":"Case A","items":["knife","gloves"],"featured":true}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await settle();
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"name":"Case B","items":["sticker"]}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should drop object keys missing from the next resource result', async () => {
    const ResourceCmp = component$(() => {
      const showFeatured = useSignal(true);
      const resource = useResource$(async ({ track }) => {
        track(showFeatured);
        if (showFeatured.value) {
          return { name: 'Case A', items: ['knife', 'gloves'], featured: true };
        }
        return { name: 'Case B', items: ['sticker'] };
      });
      return (
        <button onClick$={() => (showFeatured.value = false)}>
          <Resource value={resource} onResolved={(value) => <span>{JSON.stringify(value)}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"name":"Case A","items":["knife","gloves"],"featured":true}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    await waitForDrain(container);
    await waitForDrain(container);
    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"name":"Case B","items":["sticker"]}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should drop trailing items when a resource array shrinks', async () => {
    const ResourceCmp = component$(() => {
      const length = useSignal(3);
      const resource = useResource$(async ({ track }) => {
        const size = track(length);
        return Array.from({ length: size }, (_, index) => index + 1);
      });
      return (
        <button onClick$={() => (length.value = 1)}>
          <Resource value={resource} onResolved={(value) => <span>{JSON.stringify(value)}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>[1,2,3]</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    await waitForDrain(container);
    await waitForDrain(container);
    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>[1]</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should switch a resource result between an array and an object', async () => {
    const ResourceCmp = component$(() => {
      const step = useSignal(0);
      const resource = useResource$(async ({ track }) => {
        const current = track(step);
        if (current === 1) {
          return { x: 1 };
        }
        return [1, 2, 3];
      });
      return (
        <button onClick$={() => step.value++}>
          <Resource value={resource} onResolved={(value) => <span>{JSON.stringify(value)}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    const settle = async () => {
      await waitForDrain(container);
      await waitForDrain(container);
      await waitForDrain(container);
      await waitForDrain(container);
    };
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>[1,2,3]</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await settle();
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>{'{"x":1}'}</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await settle();
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button>
          <InlineComponent ssr-required>
            <span>[1,2,3]</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });
});
