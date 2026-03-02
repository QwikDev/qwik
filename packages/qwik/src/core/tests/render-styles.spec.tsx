import {
  Fragment as Component,
  component$,
  createContextId,
  Fragment,
  Fragment as Signal,
  type Signal as SignalType,
  useStore,
  useContext,
  useComputed$,
  useSignal,
  useContextProvider,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: render styles', ({ render }) => {
  it('should render styles', async () => {
    const Child = component$<{ count: number }>(({ count }) => {
      // const count = props.counter.count;
      return (
        <span
          class={{
            even: count % 2 === 0,
            odd: count % 2 === 1,
            stable0: true,
            hidden: false,
          }}
        >
          {count}
        </span>
      );
    });

    const TestCmp = component$(() => {
      const count = useStore({ count: 0 });

      return (
        <>
          <button onClick$={() => count.count++} />
          <Child count={count.count} />
        </>
      );
    });

    const { vNode, container } = await render(<TestCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button />
          <Component>
            <span class="even stable0">
              <Signal ssr-required>0</Signal>
            </span>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button />
          <Component>
            <span class="odd stable0">
              <Signal ssr-required>1</Signal>
            </span>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should render styles from computed and context', async () => {
    const Ctx = createContextId<{
      val: SignalType<Record<string, number>>;
      abc: SignalType<number>;
    }>('test');

    const Child = component$(() => {
      const ctx = useContext(Ctx);
      // use computed to add context value as dependency
      const color = useComputed$(() => (ctx.abc.value > 0 ? 'red' : 'green'));
      return (
        // use spread props to convert div props to var props
        <div style={{ color: color.value }} {...ctx.val.value}>
          Abcd
        </div>
      );
    });

    const Parent = component$(() => {
      const signal = useSignal(0);
      // use computed to create a new object
      const comp = useComputed$<Record<string, number>>(() => ({
        'data-value': signal.value,
      }));
      useContextProvider(Ctx, {
        val: comp,
        abc: signal,
      });
      return (
        <div>
          <Child />
          <button onClick$={() => signal.value++}></button>
        </div>
      );
    });

    const { vNode, container } = await render(<Parent />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <Component ssr-required>
            <div style="color:green" data-value={0}>
              Abcd
            </div>
          </Component>
          <button />
        </div>
      </Component>
    );

    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <Component ssr-required>
            <div style="color:red" data-value={1}>
              Abcd
            </div>
          </Component>
          <button />
        </div>
      </Component>
    );
  });
});
