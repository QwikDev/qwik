import { component$, useSignal, useStore } from '@qwik.dev/core';
import { ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DomContainer } from './dom-container';
import { isContainerReady } from './process-state-data';

describe('event handler captures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores large captures in slices before running the click handler', async () => {
    const Cmp = component$(() => {
      const shared = { currency: 'EUR' };
      const store = useStore({
        rows: Array.from({ length: 2000 }, (_, id) => ({ id, tags: ['a', 'b'], shared })),
      });
      const result = useSignal('');
      return (
        <button
          onClick$={() => {
            const rows = store.rows;
            const isShared = rows.every((row) => row.shared === rows[0].shared);
            const sum = rows.reduce((total, row) => total + row.id, 0);
            result.value = `${sum} ${isShared}`;
          }}
        >
          {result.value}
        </button>
      );
    });
    const { document, container } = await ssrRenderToDom(<Cmp />);

    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now++);
    const click = trigger(document.body, 'button', 'click');
    expect(isContainerReady(container as unknown as DomContainer)).toBe(false);
    await click;

    expect(document.querySelector('button')!.textContent).toBe('1999000 true');
  });
});
