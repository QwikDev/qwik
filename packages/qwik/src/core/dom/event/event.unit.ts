import { describe, expect, test, vi } from 'vitest';
import { _captures } from '../../shared/qrl/qrl-captures';
import type { CapturedEventHandler, qWindow, QElement } from '../../shared/types';
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

  test('stores captured event handlers without binding a closure', () => {
    const element = createElementTarget();
    const handler = vi.fn();
    const captures = ['row'];
    const event = new Event('click');

    setEvent(element, 'q-e:click', handler, captures);

    const stored = (element as QElement)._qDispatch?.['e:click'] as CapturedEventHandler;
    expect(typeof stored).not.toBe('function');
    expect(Array.isArray(stored)).toBe(true);
    stored._qRun(stored, event, element);
    expect(_captures).toBe(stored);
    expect(handler).toHaveBeenCalledWith(event, element);
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
