import { component$, useAsync$, useSignal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

// useAsync$ is a deprecated alias for useComputed$ with one semantic difference:
// it does not auto-track synchronous reads. The shared engine behavior (pending,
// error, clientOnly, cleanup, polling, promise) is tested in use-computed.spec.tsx.
describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useAsync', ({ render }) => {
  it('should only track reads via the explicit track()', async () => {
    const Counter = component$(() => {
      const tracked = useSignal(1);
      const untracked = useSignal(10);
      const sum = useAsync$(({ track }) => {
        return Promise.resolve(track(tracked) + untracked.value);
      });
      return (
        <div>
          <button id="tracked" onClick$={() => tracked.value++}></button>
          <button id="untracked" onClick$={() => untracked.value++}></button>
          <span>{sum.value}</span>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });
    const renderedSum = () => container.document.querySelector('span')!.textContent;
    expect(renderedSum()).toBe('11');

    // sync reads are not auto-tracked, so this must not recompute
    await trigger(container.element, 'button#untracked', 'click');
    await waitForDrain(container);
    expect(renderedSum()).toBe('11');

    // the tracked signal recomputes and picks up the untracked change
    await trigger(container.element, 'button#tracked', 'click');
    await waitForDrain(container);
    expect(renderedSum()).toBe('13');
  });
});
