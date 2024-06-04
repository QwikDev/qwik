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
import { trigger } from '../../../testing/element-fixture';
import { domRender, ssrRenderToDom } from '../../../testing/rendering.unit-util';
import '../../../testing/vdom-diff.unit-util';
import { delay } from '../../util/promises';

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
        const value = track(() => count.value);
        await delay(5);
        return value;
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
            <span>1</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should show loading state', async () => {
    const ResourceCmp = component$(() => {
      const count = useSignal(0);
      const rsrc = useResource$(async ({ track }) => {
        const value = track(() => count.value);
        await delay(10);
        return value;
      });
      return (
        <button onClick$={() => count.value++}>
          <Resource
            value={rsrc}
            onResolved={(v) => <span>{v}</span>}
            onPending={() => <span>loading</span>}
          />
        </button>
      );
    });

    const { vNode, container } = await render(<ResourceCmp />, { debug });
    // TODO: we should send the loading state for ssr instead of waiting for the promise
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <InlineComponent>
            <span>loading</span>
          </InlineComponent>
        </button>
      </Component>
    );

    await trigger(container.element, 'button', 'click');
    await delay(30);
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <InlineComponent>
            <span>1</span>
          </InlineComponent>
        </button>
      </Component>
    );
  });

  it('should handle multiple the same resource tasks', async () => {
    const ResourceRaceCondition = component$(() => {
      const count = useSignal(0);
      const resource = useResource$<number>(async ({ track }) => {
        track(count);
        const value = count.value;
        // console.log('scheduled', value);
        if (count.value === 1) {
          await delay(30);
        }
        // console.log('return', value);
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
    await delay(10);
    await trigger(container.element, 'button', 'click');
    // wait for the second resource to finish
    await delay(50);
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button>
            <Signal>2</Signal>
          </button>
          <InlineComponent>
            <div>2</div>
          </InlineComponent>
        </Fragment>
      </Component>
    );
  });
});
