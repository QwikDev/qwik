import {
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  Fragment as Signal,
  Resource,
  component$,
  useResource$,
  useSignal,
} from '@builder.io/qwik';
import { describe, expect, it } from 'vitest';
import '../../../testing/vdom-diff.unit-util';
import { getTestPlatform, trigger, domRender, ssrRenderToDom } from '@builder.io/qwik/testing';

const debug = false; //true;
Error.stackTraceLimit = 100;

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
        return track(() => count.value);
      });
      return (
        <button onClick$={() => count.value++}>
          <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
        </button>
      );
    });

    const { vNode, container } = await render(<TestCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <span>0</span>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <InlineComponent>
            <Fragment>
              <Awaited>
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
      <Component>
        <button>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <span>0</span>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <InlineComponent>
            <Fragment>
              <Awaited>...</Awaited>
            </Fragment>
          </InlineComponent>
        </button>
      </Component>
    );
    await (global as any).delay.resolve();
    await getTestPlatform().flush();

    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <InlineComponent>
            <Fragment>
              <Awaited>
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
      <Component>
        <Fragment>
          <button>
            <Signal>0</Signal>
          </button>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <div>0</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button>
            <Signal>1</Signal>
          </button>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <div>0</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    await (global as any).delay.resolve();
    await getTestPlatform().flush();

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button>
            <Signal>1</Signal>
          </button>
          <InlineComponent>
            <Fragment>
              <Awaited>
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
      <Component>
        <Fragment>
          <button>
            <Signal>0</Signal>
          </button>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <div>0</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
    // double click
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');
    await (global as any).delay.resolve();
    await getTestPlatform().flush();

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button>
            <Signal>2</Signal>
          </button>
          <InlineComponent>
            <Fragment>
              <Awaited>
                <div>2</div>
              </Awaited>
            </Fragment>
          </InlineComponent>
        </Fragment>
      </Component>
    );
  });
});
