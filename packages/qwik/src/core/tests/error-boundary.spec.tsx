import { component$, noSerialize, Slot, useErrorBoundary } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false;

/** Minimal boundary: provides ERROR_CONTEXT and renders a marker when its store gets an error. */
const Boundary = component$<{ name: string }>((props) => {
  const store = useErrorBoundary();
  // Expose the fallback so SSR can render it in place when a child throws (mirrors <ErrorBoundary>).
  store.$fallback$ = noSerialize(() => <div id={`caught-${props.name}`}>caught</div>);
  if (store.error) {
    return <div id={`caught-${props.name}`}>caught</div>;
  }
  return <Slot />;
});

const Thrower = component$(() => {
  throw new Error('boom');
});

describe('ErrorBoundary closest-parent resolution', () => {
  it('a synchronous render throw is caught by the NEAREST boundary, not the outer one', async () => {
    const { container } = await domRender(
      <Boundary name="outer">
        <div id="outer-content">ok</div>
        <Boundary name="inner">
          <Thrower />
        </Boundary>
      </Boundary>,
      { debug }
    );
    const el = container.element;
    expect(el.querySelector('#caught-inner')).toBeTruthy();
    expect(el.querySelector('#caught-outer')).toBeFalsy();
    // the outer subtree outside the inner boundary keeps rendering
    expect(el.querySelector('#outer-content')).toBeTruthy();
  });

  it('an async qerror is routed to the NEAREST boundary by the container', async () => {
    const { container } = await domRender(
      <Boundary name="outer">
        <Boundary name="inner">
          <button id="target">x</button>
        </Boundary>
      </Boundary>,
      { debug }
    );
    const el = container.element;
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('async boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    await waitForDrain(container);

    expect(el.querySelector('#caught-inner')).toBeTruthy();
    expect(el.querySelector('#caught-outer')).toBeFalsy();
  });

  it('SSR: a child throw inside the inner boundary renders the inner fallback, not a 500', async () => {
    const Page = component$(() => (
      <Boundary name="outer">
        <h1>Hi 👋</h1>
        <Boundary name="inner">
          <Thrower />
        </Boundary>
      </Boundary>
    ));
    const { container } = await ssrRenderToDom(<Page />, { debug });
    expect(container.element.querySelector('#caught-inner')).toBeTruthy();
    expect(container.element.querySelector('#caught-outer')).toBeFalsy();
  });

  it('repro shape: a child component (Thrower) inside the inner boundary is caught by the inner one', async () => {
    const Page = component$(() => (
      <>
        <Boundary name="outer">
          <h1>Hi 👋</h1>
          <div>
            text
            <br />
            <Boundary name="inner">
              <Thrower />
            </Boundary>
          </div>
        </Boundary>
      </>
    ));
    const { container } = await domRender(<Page />, { debug });
    expect(container.element.querySelector('#caught-inner')).toBeTruthy();
    expect(container.element.querySelector('#caught-outer')).toBeFalsy();
  });

  it('an async qerror walks up to the outer boundary when there is no inner one', async () => {
    const { container } = await domRender(
      <Boundary name="outer">
        <button id="target">x</button>
      </Boundary>,
      { debug }
    );
    const el = container.element;
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('async boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    await waitForDrain(container);

    expect(el.querySelector('#caught-outer')).toBeTruthy();
  });
});
