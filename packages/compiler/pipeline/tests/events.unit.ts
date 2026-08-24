import { describe, expect, test } from 'vitest';
import { eventScopeName } from '../analyse/events';

describe('eventScopeName', () => {
  test('element events map to q-e: scope keys', () => {
    expect(eventScopeName('onClick$')).toBe('q-e:click');
    expect(eventScopeName('onDblClick$')).toBe('q-e:dblclick');
    expect(eventScopeName('onKeyDown$')).toBe('q-e:keydown');
    expect(eventScopeName('on-CustomEvent$')).toBe('q-e:-custom-event');
    expect(eventScopeName('onDOMContentLoaded$')).toBe('q-e:-d-o-m-content-loaded');
  });

  test('non-event names pass through as attributes', () => {
    expect(eventScopeName('onClick')).toBe(null);
    expect(eventScopeName('online$')).toBe(null);
    expect(eventScopeName('title')).toBe(null);
  });
});
