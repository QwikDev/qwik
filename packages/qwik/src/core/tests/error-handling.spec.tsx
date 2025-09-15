import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import {
  Fragment,
  Fragment as Component,
  Fragment as Signal,
  Fragment as Projection,
  component$,
  useSignal,
} from '@qwik.dev/core';
import { ErrorProvider } from '../../testing/rendering.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: error handling', ({ render }) => {
  it('should handle error in component with element wrapper', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      if (counter.value !== 0) {
        throw new Error('error');
      }
      return (
        <main>
          {''}
          <button onClick$={() => counter.value++}>{counter.value}</button>
        </main>
      );
    });

    const { vNode, document } = await render(
      <ErrorProvider>
        <Cmp />
      </ErrorProvider>,
      { debug }
    );
    // override globalThis.document to make moving elements logic work
    globalThis.document = document;

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Projection ssr-required>
          <Component ssr-required>
            <errored-host>
              <main>
                {''}
                <button>
                  <Signal ssr-required>1</Signal>
                </button>
              </main>
            </errored-host>
          </Component>
        </Projection>
      </Component>
    );
  });

  it('should handle error in component with virtual wrapper', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      if (counter.value !== 0) {
        throw new Error('error');
      }
      return (
        <>
          {''}
          <button onClick$={() => counter.value++}>{counter.value}</button>
        </>
      );
    });

    const { vNode, document } = await render(
      <ErrorProvider>
        <Cmp />
      </ErrorProvider>,
      { debug }
    );
    // override globalThis.document to make moving elements logic work
    globalThis.document = document;

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Projection ssr-required>
          <Component ssr-required>
            <Fragment ssr-required></Fragment>
            <errored-host>
              {''}
              <button>
                <Signal ssr-required>1</Signal>
              </button>
            </errored-host>
          </Component>
        </Projection>
      </Component>
    );
  });

  it('should handle error in event handler', async () => {
    const Cmp = component$(() => {
      return (
        <>
          <button
            onClick$={() => {
              throw new Error('error');
            }}
          >
            error
          </button>
          <div>some div</div>
        </>
      );
    });

    const { vNode, document } = await render(
      <ErrorProvider>
        <Cmp />
      </ErrorProvider>,
      { debug }
    );
    // override globalThis.document to make moving elements logic work
    globalThis.document = document;

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Projection ssr-required>
          <Component ssr-required>
            <Fragment ssr-required>
              <errored-host>
                <button>error</button>
              </errored-host>
              <div>some div</div>
            </Fragment>
          </Component>
        </Projection>
      </Component>
    );
  });
});
