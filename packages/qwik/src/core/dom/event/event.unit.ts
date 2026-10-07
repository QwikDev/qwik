import { describe, expect, test, vi } from 'vitest';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
} from '../../runtime/invoke-context';
import { _captures } from '../../shared/qrl/qrl-captures';
import type { CapturedEventHandler, qWindow, QElement } from '../../shared/types';
import { createCapturedEvent, removeEvent, setEvent } from './event';
import { Scheduler } from '../../runtime/scheduler';

describe('setEvent', () => {
  test('shares captures while passing the clicked row as an argument', () => {
    const shared = { value: 0 };
    const rows = [{ id: 1 }, { id: 2 }];
    const links = rows.map((row) => Object.assign(createElementTarget(), { _qEventParam: row }));
    const seen: unknown[] = [];
    const sharedEvent = createCapturedEvent(
      (event, element, row) => {
        seen.push([_captures![0], row]);
      },
      [shared],
      1
    );
    links.forEach((link) => setEvent(link, 'q-e:click', sharedEvent));
    const dispatch = links.map(
      (link) => (link as QElement)._qDispatch!['e:click'] as CapturedEventHandler
    );
    expect(dispatch[0]).toBe(dispatch[1]);
    expect(dispatch[0]).toHaveLength(1);
    for (const index of [1, 0])
      dispatch[index]._qRun(dispatch[index], new Event('click'), links[index]);
    expect(seen).toEqual([
      [shared, rows[1]],
      [shared, rows[0]],
    ]);
  });

  test('preserves row arguments when a shared handler retries overlapping clicks', async () => {
    const links = [0, 1].map((row) => Object.assign(createElementTarget(), { _qEventParam: row }));
    const waiting = new Set<unknown>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: unknown[] = [];
    const sharedEvent = createCapturedEvent(
      (_event, _element, row) => {
        if (!waiting.has(row)) {
          waiting.add(row);
          throw gate;
        }
        seen.push(row);
      },
      [],
      1
    );
    links.forEach((link) => setEvent(link, 'q-e:click', sharedEvent));
    const pending = links.map((link) => {
      const dispatch = (link as QElement)._qDispatch!['e:click'] as CapturedEventHandler;
      return dispatch._qRun(dispatch, new Event('click'), link);
    });
    release();
    await Promise.all(pending);
    expect(seen).toEqual([0, 1]);
  });

  test('passes multiple element parameters without changing shared captures', () => {
    const element = Object.assign(createElementTarget(), { _qEventParams: [undefined, 7] });
    const calls: unknown[][] = [];
    const handler = createCapturedEvent((...args) => calls.push(args), ['shared'], 2);
    setEvent(element, 'q-e:click', handler);
    const captured = (element as QElement)._qDispatch!['e:click'] as CapturedEventHandler;
    const event = new Event('click');
    captured._qRun(captured, event, element);
    expect(calls).toEqual([[event, element, undefined, 7]]);
    expect([...captured]).toEqual(['shared']);
  });

  test('wraps plain handlers so bare dispatch still calls them', () => {
    const element = createElementTarget();
    const handler = vi.fn();
    const event = new Event('click');

    setEvent(element, 'q-e:click', handler);

    const stored = (element as QElement)._qDispatch?.['e:click'] as EventHandler;
    expect(typeof stored).toBe('function');
    stored(event, element);
    expect(handler).toHaveBeenCalledWith(event, element);
    expect(element.setAttribute).not.toHaveBeenCalled();
  });

  test('plain handlers run inside a container invoke context', () => {
    const element = createElementTarget();
    let seenContainer: unknown;
    setEvent(element, 'q-e:click', () => {
      seenContainer = getActiveInvokeContextOrNull()?.container;
    });

    const stored = (element as QElement)._qDispatch?.['e:click'] as EventHandler;
    stored(new Event('click'), element);

    expect(seenContainer).toBe(getContainerContext(element));
    expect(getActiveInvokeContextOrNull()).toBe(null);
  });

  test('captured handlers run inside a container invoke context', () => {
    const element = createElementTarget();
    const handler = vi.fn(() => getActiveInvokeContextOrNull()?.container);
    const captures = ['row'];
    const event = new Event('click');

    setEvent(element, 'q-e:click', handler, captures);

    const stored = (element as QElement)._qDispatch?.['e:click'] as CapturedEventHandler;
    expect(typeof stored).not.toBe('function');
    expect(Array.isArray(stored)).toBe(true);
    stored._qRun(stored, event, element);
    expect(_captures).toBe(stored);
    expect(handler).toHaveBeenCalledWith(event, element);
    expect(handler).toHaveReturnedWith(getContainerContext(element));
    expect(getActiveInvokeContextOrNull()).toBe(null);
  });

  test('wraps each entry of a handler array and keeps null slots', () => {
    const element = createElementTarget();
    const first = vi.fn(() => getActiveInvokeContextOrNull()?.container);
    const second = vi.fn();
    const event = new Event('click');

    setEvent(element, 'q-e:click', [first, null as any, second]);

    const stored = (element as QElement)._qDispatch?.['e:click'] as EventHandler[];
    expect(Array.isArray(stored)).toBe(true);
    expect(stored[1]).toBe(null);
    stored[0](event, element);
    stored[2](event, element);
    expect(first).toHaveReturnedWith(getContainerContext(element));
    expect(second).toHaveBeenCalledWith(event, element);
  });

  test('skips dispatch on disconnected elements', () => {
    const element = createElementTarget({ connected: false });
    const handler = vi.fn();

    setEvent(element, 'q-e:click', handler);

    const stored = (element as QElement)._qDispatch?.['e:click'] as EventHandler;
    stored(new Event('click'), element);
    expect(handler).not.toHaveBeenCalled();
  });

  test('retries handlers that throw a promise', async () => {
    const element = createElementTarget();
    let calls = 0;
    const gate = Promise.resolve();
    setEvent(element, 'q-e:click', () => {
      if (++calls === 1) {
        throw gate;
      }
      return getActiveInvokeContextOrNull()?.container;
    });

    const stored = (element as QElement)._qDispatch?.['e:click'] as EventHandler;
    const result = await stored(new Event('click'), element);
    expect(calls).toBe(2);
    expect(result).toBe(getContainerContext(element));
  });

  test('adds attrs for window and document event carriers', () => {
    const element = createElementTarget();
    const handler = vi.fn();

    setEvent(element, 'q-wp:scroll', handler);
    setEvent(element, 'q-d:visibilitychange', handler);

    expect(typeof (element as QElement)._qDispatch?.['wp:scroll']).toBe('function');
    expect(typeof (element as QElement)._qDispatch?.['d:visibilitychange']).toBe('function');
    expect(element.setAttribute).toHaveBeenCalledWith('q-wp:scroll', '');
    expect(element.setAttribute).toHaveBeenCalledWith('q-d:visibilitychange', '');
    expect((element.ownerDocument.defaultView as unknown as qWindow)._qwikEv).toEqual([
      'wp:scroll',
      'd:visibilitychange',
    ]);
  });

  test('does not register an event already active in the loader', () => {
    const element = createElementTarget();
    const push = vi.fn();
    (element.ownerDocument.defaultView as unknown as qWindow)._qwikEv = {
      events: new Set(['e:click']),
      roots: new Set(),
      push,
    };

    setEvent(element, 'q-e:click', (_event: Event, _element: Element) => {});

    expect(push).not.toHaveBeenCalled();
  });

  test('registers a scanned event only after the flush that inserts its element', async () => {
    // the loader finds qvisible by scanning the DOM, so a push before the row lands finds nothing,
    // even on the first registration of the event
    const element = createElementTarget();
    const push = vi.fn();
    (element.ownerDocument.defaultView as unknown as qWindow)._qwikEv = {
      events: new Set(['e:click']),
      roots: new Set(),
      push,
    };
    const scheduler = new Scheduler(() => {});
    const container = { scheduler } as unknown as NonNullable<
      ReturnType<typeof getActiveInvokeContextOrNull>
    >['container'];
    let release!: () => void;
    scheduler.waitFor(new Promise<void>((resolve) => (release = resolve)));
    const flush = scheduler.flushInteraction();
    await Promise.resolve();

    invoke(newInvokeContext({ container }), () => setEvent(element, 'q-e:qvisible', () => {}));

    expect(push).not.toHaveBeenCalled();
    release();
    await flush;
    expect(push).toHaveBeenCalledWith('e:qvisible');
  });

  test('removes local and carrier event handlers', () => {
    const element = createElementTarget();
    const handler = vi.fn();

    setEvent(element, 'q-e:click', handler);
    setEvent(element, 'q-w:scroll', handler);
    removeEvent(element, 'q-e:click');
    removeEvent(element, 'q-w:scroll');

    expect((element as QElement)._qDispatch?.['e:click']).toBeUndefined();
    expect((element as QElement)._qDispatch?.['w:scroll']).toBeUndefined();
    expect(element.removeAttribute).not.toHaveBeenCalledWith('q-e:click');
    expect(element.removeAttribute).toHaveBeenCalledWith('q-w:scroll');
  });
});

type EventHandler = (event: Event, element: Element) => unknown;

function createElementTarget(opts: { connected?: boolean } = {}): Element {
  const container = { _ctx: { element: 'test-container' } };
  return {
    isConnected: opts.connected ?? true,
    closest: () => container,
    ownerDocument: {
      defaultView: {},
    },
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
  } as unknown as Element;
}

function getContainerContext(element: Element): unknown {
  return (element.closest('') as unknown as { _ctx: unknown })._ctx;
}
