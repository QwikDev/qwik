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

  test('marks scoped event carriers for qwikloader', () => {
    const element = createElementTarget();
    const handler = vi.fn();

    setEvent(element, 'q-wp:scroll', handler);

    expect((element as QElement)._qDispatch?.['wp:scroll']).toBe(handler);
    expect(element.setAttribute).toHaveBeenCalledWith('q-wp:scroll', '');
    expect((element.ownerDocument.defaultView as unknown as qWindow)._qwikEv).toEqual([
      'wp:scroll',
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
