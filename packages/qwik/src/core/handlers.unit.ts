import { describe, expect, it, vi } from 'vitest';
import { createWindow } from '../testing/document';
import { _run } from './handlers';
import { createContainerContext } from './runtime/container-context';
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

  it.each(['q:p', 'q:ps'])('restores %s before starting the lazy handler', async (name) => {
    const { button, event } = createButton();
    const context = createContainerContext(button.closest('[q\\:container]')!);
    const row = { id: 1 };
    const values = name === 'q:p' ? row : [row, 7];
    vi.spyOn(context, 'getRoot').mockResolvedValue(values);
    button.setAttribute(name, '42');
    const calls: unknown[][] = [];
    const handler = createLazyHandler('row', (...args) => calls.push(args));
    const start = (await runWith(handler, event, button)) as () => unknown;
    expect(calls).toEqual([]);
    await start();
    expect(calls).toEqual([[event, button, ...(name === 'q:p' ? [row] : [row, 7])]]);
    expect(context.getRoot).toHaveBeenCalledWith('42');
  });

  it.each(['q:p', 'q:ps'])('waits for an inflating %s parameter', async (name) => {
    const { button, event } = createButton();
    const context = createContainerContext(button.closest('[q\\:container]')!);
    const row = { id: 1 };
    const values = name === 'q:p' ? row : [row, 7];
    let finish!: () => void;
    const inflation = new Promise<void>((resolve) => (finish = resolve));
    context.state.inflatingRoots = new WeakMap([[values, inflation]]);
    vi.spyOn(context, 'getRoot').mockResolvedValue(values);
    button.setAttribute(name, '42');
    const handler = createLazyHandler('row', () => {});
    let ready = false;
    const loading = Promise.resolve(runWith(handler, event, button)).then(() => (ready = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ready).toBe(false);
    finish();
    await loading;
    expect(ready).toBe(true);
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
