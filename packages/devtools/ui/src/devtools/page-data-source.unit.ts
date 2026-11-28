import { afterEach, describe, expect, test, vi } from 'vitest';
import { DEVTOOLS_MESSAGES } from '@qwik.dev/devtools/kit';
import { createIframePageDataSource, findHostQwikWindow } from './page-data-source';

function applicationWindow(name: string) {
  const tree = [{ id: name, name }];
  const target = Object.assign(new EventTarget(), {
    document: {},
    __QWIK_DEVTOOLS__: {
      version: 1,
      hook: {
        getVNodeTree: () => tree,
      },
    },
  });
  return { target: target as unknown as Window, tree };
}

describe('iframe page source', () => {
  afterEach(() => vi.useRealTimers());

  test('finds an application ancestor and stops at a cross-origin boundary', () => {
    const app = applicationWindow('App');
    Object.assign(app.target, { parent: app.target });
    const iframe = { parent: { parent: app.target } } as Window;
    expect(findHostQwikWindow(iframe)).toBe(app.target);

    const crossOrigin = Object.defineProperty({}, '__QWIK_DEVTOOLS__', {
      get() {
        throw new DOMException('Cross-origin access', 'SecurityError');
      },
    });
    expect(findHostQwikWindow({ parent: crossOrigin } as Window)).toBeNull();
  });

  test('rebinds tree subscriptions when the application window changes', async () => {
    vi.useFakeTimers();
    const first = applicationWindow('First');
    const second = applicationWindow('Second');
    Object.assign(first.target, { parent: first.target });
    Object.assign(second.target, { parent: second.target });
    const iframe = { parent: first.target } as Window;
    const source = createIframePageDataSource(iframe);
    const updates = vi.fn();
    const unsubscribe = source.subscribeTreeUpdates(updates);
    await vi.advanceTimersByTimeAsync(0);
    expect(updates).toHaveBeenLastCalledWith(first.tree);

    Object.assign(iframe, { parent: second.target });
    await vi.advanceTimersByTimeAsync(500);
    expect(updates).toHaveBeenLastCalledWith(second.tree);
    expect(await source.readVNodeTree()).toBe(second.tree);

    unsubscribe?.();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('does not deliver an initial tree after unsubscribing', async () => {
    const app = applicationWindow('App');
    Object.assign(app.target, { parent: app.target });
    const source = createIframePageDataSource({ parent: app.target } as Window);
    const updates = vi.fn();
    source.subscribeTreeUpdates(updates)?.();
    await Promise.resolve();
    expect(updates).not.toHaveBeenCalled();
  });

  test('moves preload subscriptions to the new application and cleans them up', async () => {
    vi.useFakeTimers();
    const first = applicationWindow('First');
    const second = applicationWindow('Second');
    Object.assign(first.target, { parent: first.target });
    Object.assign(second.target, { parent: second.target });
    const iframe = { parent: first.target } as Window;
    const updates = vi.fn();
    const unsubscribe = createIframePageDataSource(iframe).subscribePreloadUpdates(updates);
    updates.mockClear();

    first.target.dispatchEvent(new Event(DEVTOOLS_MESSAGES.events.preloadsUpdate));
    expect(updates).toHaveBeenCalledTimes(1);
    Object.assign(iframe, { parent: second.target });
    await vi.advanceTimersByTimeAsync(500);
    updates.mockClear();
    first.target.dispatchEvent(new Event(DEVTOOLS_MESSAGES.events.preloadsUpdate));
    second.target.dispatchEvent(new Event(DEVTOOLS_MESSAGES.events.preloadsUpdate));
    expect(updates).toHaveBeenCalledTimes(1);

    unsubscribe?.();
    second.target.dispatchEvent(new Event(DEVTOOLS_MESSAGES.events.preloadsUpdate));
    expect(updates).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test('edits signals and highlights elements in the application window', async () => {
    const app = applicationWindow('App');
    Object.assign(app.target, { parent: app.target });
    const setSignalValue = vi.fn(() => true);
    const highlightNode = vi.fn();
    const unhighlightNode = vi.fn();
    Object.assign(app.target.__QWIK_DEVTOOLS__!.hook!, {
      setSignalValue,
      highlightNode,
      unhighlightNode,
    });
    const source = createIframePageDataSource({ parent: app.target } as Window);

    expect(await source.setSignalValue('App', 'chunk', 'count', 2)).toBe(true);
    await source.highlightElement('node-1', 'App');
    await source.unhighlightElement();
    expect(setSignalValue).toHaveBeenCalledWith('App', 'chunk', 'count', 2);
    expect(highlightNode).toHaveBeenCalledWith('node-1', 'App');
    expect(unhighlightNode).toHaveBeenCalledOnce();
  });
});
