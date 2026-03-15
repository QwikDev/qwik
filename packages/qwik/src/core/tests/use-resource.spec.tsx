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
    await waitForDrain(container);
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

  it('should handle client-side click after async resource SSR (resource-serialization pattern)', async () => {
    const TestCmp = component$(() => {
      const state = useStore({ count0: 0, count1: 0 });
      const resourceSuccess = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'Success';
      });
      const resourceFailure = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('failed');
      });
      const resourceTimeout = useResource$(
        async () => {
          await new Promise((r) => setTimeout(r, 100));
          return 'Success';
        },
        { timeout: 10 }
      );

      return (
        <>
          <Resource
            value={resourceSuccess}
            onResolved={(data) => (
              <button class="success r1" onClick$={() => state.count0++}>
                PASS: {data} {state.count0}
              </button>
            )}
            onRejected={(reason) => (
              <button class="failure r1" onClick$={() => state.count1++}>
                ERROR: {String(reason)} {state.count1}
              </button>
            )}
          />
          <Resource
            value={resourceFailure}
            onResolved={(data) => (
              <button class="success r2" onClick$={() => state.count0++}>
                PASS: {data} {state.count0}
              </button>
            )}
            onRejected={(reason) => (
              <button class="failure r2" onClick$={() => state.count1++}>
                ERROR: {String(reason)} {state.count1}
              </button>
            )}
          />
          <Resource
            value={resourceTimeout}
            onResolved={(data) => (
              <button class="success r3" onClick$={() => state.count0++}>
                PASS: {data} {state.count0}
              </button>
            )}
            onRejected={(reason) => (
              <button class="failure r3" onClick$={() => state.count1++}>
                ERROR: {String(reason)} {state.count1}
              </button>
            )}
          />
        </>
      );
    });

    const { container } = await render(<TestCmp />, { debug });
    // Log full HTML for debugging
    // console.log('SSR HTML:', (container.element as any).innerHTML || container.element.outerHTML);
    const r1 = container.element.querySelector('.r1') as HTMLElement;
    const r2 = container.element.querySelector('.r2') as HTMLElement;
    const r3 = container.element.querySelector('.r3') as HTMLElement;

    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
    expect(r3).toBeTruthy();
    expect(r1.textContent).toContain('PASS: Success 0');
    expect(r2.textContent).toContain('ERROR:');
    expect(r3.textContent).toContain('ERROR:');

    // Click button1 to trigger client-side re-render
    await trigger(container.element, '.r1', 'click');
    await waitForDrain(container);
    expect(r1.textContent).toContain('PASS: Success 1');
  });

  it('should not duplicate content with async resource (simple)', async () => {
    const TestCmp = component$(() => {
      const resourceSuccess = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'Success';
      });
      const resourceFailure = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('failed');
      });

      return (
        <>
          <Resource
            value={resourceSuccess}
            onResolved={(data) => <button class="success r1">PASS: {data}</button>}
            onRejected={(reason) => <button class="failure r1">ERROR: {String(reason)}</button>}
          />
          <Resource
            value={resourceFailure}
            onResolved={(data) => <button class="success r2">PASS: {data}</button>}
            onRejected={(reason) => <button class="failure r2">ERROR: {String(reason)}</button>}
          />
        </>
      );
    });

    const { document } = await render(<TestCmp />, { debug });
    const html = document.querySelector('body')?.innerHTML || (document as any).innerHTML || '';
    const passCount = (html.match(/PASS:/g) || []).length;
    const errorCount = (html.match(/ERROR:/g) || []).length;
    expect(passCount).toBeLessThanOrEqual(1);
    expect(errorCount).toBeLessThanOrEqual(1);
  });

  it('should not duplicate content with async resource (wrapped in parent component)', async () => {
    const Inner = component$(() => {
      const resource = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'InnerValue';
      });
      return (
        <Resource
          value={resource}
          onResolved={(data) => <span class="inner">INNER: {data}</span>}
        />
      );
    });

    const Outer = component$(() => {
      return <Inner />;
    });

    const { document } = await render(<Outer />, { debug });
    const html = document.querySelector('body')?.innerHTML || (document as any).innerHTML || '';
    const innerCount = (html.match(/INNER:/g) || []).length;
    expect(innerCount).toBeLessThanOrEqual(1);
  });

  it('should not duplicate content with async resource (nested components)', async () => {
    const ChildWithResource = component$(() => {
      const resource = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'ChildValue';
      });
      return (
        <Resource
          value={resource}
          onResolved={(data) => <span class="child-resolved">{data}</span>}
        />
      );
    });

    const ParentCmp = component$(() => {
      const parentResource = useResource$(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'ParentSuccess';
      });

      return (
        <>
          <ChildWithResource />
          <Resource
            value={parentResource}
            onResolved={(data) => <button class="parent-resolved">PASS: {data}</button>}
            onRejected={(reason) => <button class="parent-error">ERROR: {String(reason)}</button>}
          />
        </>
      );
    });

    const { document } = await render(<ParentCmp />, { debug });
    const html = document.querySelector('body')?.innerHTML || (document as any).innerHTML || '';
    const passCount = (html.match(/PASS:/g) || []).length;
    const childCount = (html.match(/ChildValue/g) || []).length;
    expect(passCount).toBeLessThanOrEqual(1);
    expect(childCount).toBeLessThanOrEqual(1);
  });
});
