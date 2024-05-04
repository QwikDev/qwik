import {
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
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
});
