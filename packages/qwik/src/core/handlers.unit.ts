import { describe, expect, it } from 'vitest';
import { createWindow } from '../testing/document';
import { _run } from './handlers';
import { setCaptures } from './shared/qrl/qrl-captures';
import { createQRL } from './shared/qrl/qrl-class';

type Handler = (event: Event, element: Element) => unknown;

describe('_run', () => {
  it('loads the handler without starting it', async () => {
    const { button, event } = createButton();
    const calls: unknown[][] = [];
    const handler = createLazyHandler('handler', (...args) => {
      calls.push(args);
      return 'done';
    });

    const start = (await runWith(handler, event, button)) as () => unknown;
    expect(calls).toEqual([]);

    expect(await start()).toBe('done');
    expect(calls).toEqual([[event, button]]);
  });

  it('reports a chunk that fails to load before any start', async () => {
    const { button, event } = createButton();
    const broken = createQRL<Handler>('./broken.js', 'broken', null, () =>
      Promise.reject(new Error('load failed'))
    );

    await expect(runWith(broken, event, button)).rejects.toThrow('load failed');
  });

  it('ignores an element that already left the document', () => {
    const { button, event } = createButton();
    const handler = createLazyHandler('handler', () => {});
    button.remove();

    expect(runWith(handler, event, button)).toBeUndefined();
  });
});

function createButton() {
  const win = createWindow({ html: '<div q:container><button></button></div>' });
  const button = win.document.querySelector('button')!;
  return { button, event: { type: 'click' } as Event };
}

function createLazyHandler(symbol: string, handler: Handler) {
  return createQRL<Handler>(`./${symbol}.js`, symbol, null, () =>
    Promise.resolve({ [symbol]: handler })
  );
}

/** The loader hands the handler QRL to `_run` through the ambient captures. */
function runWith(qrl: unknown, event: Event, element: Element) {
  setCaptures([qrl]);
  return _run.call(undefined as unknown as string, event, element);
}
