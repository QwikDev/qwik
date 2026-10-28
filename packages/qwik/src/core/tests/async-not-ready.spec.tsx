import { $, component$, createAsyncQrl, useComputed$, useTask$ } from '@qwik.dev/core';
import { domRender } from '@qwik.dev/core/testing';
import { expect, it, vi } from 'vitest';
import { delay } from '../shared/utils/promises';
import type { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';

interface List {
  items: string[];
}

// Module bindings keep the scenario out of the components' serialized captures.
const scenario = {
  list: undefined as AsyncSignalImpl<List> | undefined,
  runs: [] as number[],
};

/** An async signal whose first computation never settles until it is aborted. */
function createCancellableList() {
  scenario.list = createAsyncQrl<List>(
    $(
      async ({ abortSignal }) =>
        new Promise<List>((_, reject) => {
          abortSignal.addEventListener('abort', () => reject(abortSignal.reason), { once: true });
        })
    )
  ) as AsyncSignalImpl<List>;
  scenario.runs = [];
  return scenario.list;
}

/** Renders while the first computation is pending, then cancels it. */
async function renderAndCancel(jsx: any) {
  const list = createCancellableList();
  const rendered = domRender(jsx);
  await delay(0);
  list.abort();
  const { document, container } = await rendered;
  return { document, container, list };
}

it('skips a render that reads a cancelled value and reruns when it arrives', async () => {
  const Child = component$(() => {
    const list = scenario.list!.value;
    return <p id="count">{list.items.length}</p>;
  });
  const { document, container, list } = await renderAndCancel(<Child />);
  const onError = vi.spyOn(container, 'handleError');
  expect(document.querySelector('#count')).toBeFalsy();

  list.value = { items: ['a', 'b'] };
  await container.$renderPromise$;
  expect(document.querySelector('#count')?.textContent).toBe('2');
  expect(onError).not.toHaveBeenCalled();
});

it('reruns a computed that reads a cancelled value once it arrives', async () => {
  const Child = component$(() => {
    const count = useComputed$(() => scenario.list!.value.items.length);
    return <p id="count">{count.value}</p>;
  });
  const { document, container, list } = await renderAndCancel(<Child />);
  // The computed is bound in JSX, so only its text waits for the value.
  expect(document.querySelector('#count')?.textContent).toBe('');

  list.value = { items: ['a', 'b', 'c'] };
  await container.$renderPromise$;
  expect(document.querySelector('#count')?.textContent).toBe('3');
});

it('reruns a task that tracks a cancelled value once it arrives', async () => {
  const Child = component$(() => {
    useTask$(({ track }) => {
      const list = track(scenario.list!);
      scenario.runs.push(list.items.length);
    });
    return <p id="ready">ready</p>;
  });
  const { document, container, list } = await renderAndCancel(<Child />);
  expect(document.querySelector('#ready')?.textContent).toBe('ready');
  expect(scenario.runs).toEqual([]);

  list.value = { items: ['a'] };
  await container.$renderPromise$;
  expect(scenario.runs).toEqual([1]);
});
