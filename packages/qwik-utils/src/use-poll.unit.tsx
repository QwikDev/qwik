import { component$, useComputed$ } from '@qwik.dev/core';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { usePoll } from './use-poll';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('usePoll', () => {
  it('re-runs the signal after `expires` and keeps polling', async () => {
    const ref = { runs: 0 };
    const Cmp = component$(() => {
      const signal = useComputed$(async () => ++ref.runs);
      usePoll(signal, 20);
      return <span>{signal.value}</span>;
    });

    const { document } = await domRender(<Cmp />, { debug: false });
    expect(ref.runs).toBe(1);
    await trigger(document.body, 'span', 'd:qidle');

    await delay(100);
    expect(ref.runs).toBeGreaterThan(1);
  });

  it('keeps polling after a failed computation', async () => {
    const ref = { runs: 0 };
    const Cmp = component$(() => {
      const signal = useComputed$(async () => {
        ref.runs++;
        if (ref.runs === 2) {
          throw new Error('boom');
        }
        return ref.runs;
      });
      usePoll(signal, 20);
      return <span>{signal.error ? 'err' : signal.value}</span>;
    });

    const { document } = await domRender(<Cmp />, { debug: false });
    await trigger(document.body, 'span', 'd:qidle');
    await delay(150);
    expect(ref.runs).toBeGreaterThan(2);
  });
});
