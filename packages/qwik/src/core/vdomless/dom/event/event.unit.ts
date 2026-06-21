import { describe, expect, test, vi } from 'vitest';
import type { qWindow, QElement } from '../../../shared/types';
import { setEvent } from './event';

describe('setEvent', () => {
  test('stores event handlers in _qDispatch', () => {
    const element = createElementTarget();
    const handler = vi.fn();

    setEvent(element, 'q-e:click', handler);

    expect((element as QElement)._qDispatch).toEqual({
      'e:click': handler,
    });
    expect(element.setAttribute).not.toHaveBeenCalled();
  });

  test('adds attrs for window and document event carriers', () => {
    const element = createElementTarget();
    const handler = vi.fn();

    setEvent(element, 'q-wp:scroll', handler);
    setEvent(element, 'q-d:visibilitychange', handler);

    expect((element as QElement)._qDispatch?.['wp:scroll']).toBe(handler);
    expect((element as QElement)._qDispatch?.['d:visibilitychange']).toBe(handler);
    expect(element.setAttribute).toHaveBeenCalledWith('q-wp:scroll', '');
    expect(element.setAttribute).toHaveBeenCalledWith('q-d:visibilitychange', '');
    expect((element.ownerDocument.defaultView as unknown as qWindow)._qwikEv).toEqual([
      'wp:scroll',
      'd:visibilitychange',
    ]);
  });
});

function createElementTarget(): Element {
  return {
    ownerDocument: {
      defaultView: {},
    },
    setAttribute: vi.fn(),
  } as unknown as Element;
}
