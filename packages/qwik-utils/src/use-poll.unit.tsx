import { component$, useComputed$, type ComputedSignal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePoll } from './use-poll';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Counters live on globalThis: SSR serializes captured objects, so a captured
// counter would be a deserialized copy on resume and the test would not see client runs.
const counters = globalThis as any as { pollRuns: number; failRuns: number };

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: usePoll', ({ render }) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('re-runs the signal after `expires` and keeps polling', async () => {
    counters.pollRuns = 0;
    const Cmp = component$(() => {
      // Typed signal in, same typed signal out
      const signal: ComputedSignal<number> = usePoll(
        useComputed$(async () => ++(globalThis as any).pollRuns),
        20
      );
      return <span>{signal.value}</span>;
    });

    const { document } = await render(<Cmp />, { debug: false });
    const runsAfterRender = counters.pollRuns;
    await trigger(document.body, 'span', 'd:qidle');

    await delay(100);
    expect(counters.pollRuns).toBeGreaterThan(runsAfterRender);
  });

  it('keeps polling after a failed computation', async () => {
    counters.failRuns = 0;
    const Cmp = component$(() => {
      const signal = useComputed$(async () => {
        const runs = ++(globalThis as any).failRuns;
        if (runs === 2) {
          throw new Error('boom');
        }
        return runs;
      });
      usePoll(signal, 20);
      return <span>{signal.error ? 'err' : signal.value}</span>;
    });

    const { document } = await render(<Cmp />, { debug: false });
    await trigger(document.body, 'span', 'd:qidle');
    await delay(150);
    expect(counters.failRuns).toBeGreaterThan(2);
  });

  it('clamps `expires` to the 5ms minimum', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const Cmp = component$(() => {
      const signal = useComputed$(async () => 1);
      usePoll(signal, 0);
      return <span>{signal.value}</span>;
    });

    const { document } = await render(<Cmp />, { debug: false });
    await trigger(document.body, 'span', 'd:qidle');

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5);
  });
});
