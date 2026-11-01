import { component$, useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core';
import { _getDomContainer, _waitUntilRendered } from '@qwik.dev/core/internal';
import { ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';

describe('_waitUntilRendered', () => {
  it('can ignore a cursor that is already paused on a pending async task', async () => {
    // Not captured by the component: Qwik would serialize (= await) a captured promise.
    (globalThis as any).asyncTaskDone = new Promise<void>(
      (resolve) => ((globalThis as any).finishAsyncTask = resolve)
    );
    const Cmp = component$(() => {
      const ready = useSignal(false);
      useVisibleTask$(() => {
        ready.value = true;
      });
      // render blocking by default, so the cursor of the component pauses until it settles
      useTask$(async ({ track }) => {
        track(ready);
        if (ready.value) {
          (globalThis as any).asyncTaskAwaiting = true;
          await (globalThis as any).asyncTaskDone;
        }
      });
      return <span>cmp</span>;
    });

    const { document } = await ssrRenderToDom(<Cmp />, { debug: false });
    const container = _getDomContainer(document.documentElement);
    expect(container.$pendingCount$).toBe(0);

    const visible = trigger(document.body, 'span', 'qvisible', {}, { waitForIdle: false });
    // the cursor of the component pauses on the async task
    await vi.waitFor(() => expect((globalThis as any).asyncTaskAwaiting).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.$pendingCount$).toBe(1);

    let waitedForEverything = false;
    _waitUntilRendered(container).then(() => (waitedForEverything = true));
    // resolves although the async task is still pending
    await _waitUntilRendered(container, true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(waitedForEverything).toBe(false);

    (globalThis as any).finishAsyncTask();
    await visible;
    await vi.waitFor(() => expect(waitedForEverything).toBe(true));
    expect(container.$pendingCount$).toBe(0);

    (globalThis as any).asyncTaskAwaiting = undefined;
    (globalThis as any).asyncTaskDone = undefined;
    (globalThis as any).finishAsyncTask = undefined;
  });
});
