import { describe, expect, it } from 'vitest';
import { createQRL } from '../core/shared/qrl/qrl-class';
import { _qrlSync } from '../core/shared/qrl/qrl.public';
import { createSerializationContext } from '@qwik.dev/core/internal/serializer';
import { serializeSsrEvent } from './ssr-events';

describe('SSR event attributes', () => {
  it('keeps sync handlers synchronous even when captures are moved', () => {
    const serializationCtx = createSerializationContext(null, () => '');
    const sync = _qrlSync((event: Event) => event.preventDefault(), 'link_sync$_segment_1_hash1');

    // a sync handler has no captures to move; wrapping it in _run loses sync dispatch
    expect(serializeSsrEvent(serializationCtx, 'q-e:click', sync, true)).toEqual(
      '#link_sync$_segment_1_hash1'
    );
  });

  it('wraps only the handler whose captures were moved', () => {
    const serializationCtx = createSerializationContext(null, () => '');
    const direct = createQRL('./listener.js', 'direct', () => {}, null, null);
    const moved = createQRL('./listener.js', 'moved', () => {}, null, null).m();

    expect(serializeSsrEvent(serializationCtx, 'q-e:click', [direct, moved], false)).toBe(
      'listener.js#direct|mock-chunk#_run#0'
    );
  });

  it('registers the wrapped handler itself so the preloader fetches its chunk', () => {
    const serializationCtx = createSerializationContext(null, () => '');
    const handler = createQRL('./listener.js', 'handler', () => {}, null, [{ id: 'capture' }]);

    serializeSsrEvent(serializationCtx, 'q-e:click', handler, false);

    expect([...serializationCtx.$eventQrls$]).toEqual([handler]);
  });

  it('wraps capture-less handlers when the container needs an invoke context', () => {
    const serializationCtx = createSerializationContext(null, () => '');
    const direct = createQRL('./listener.js', 'direct', () => {}, null, null);

    expect(serializeSsrEvent(serializationCtx, 'q-e:click', direct, true)).toBe(
      'mock-chunk#_run#0'
    );
  });

  it('keeps capture references as root ids', () => {
    const serializationCtx = createSerializationContext(null, () => '');
    serializationCtx.$addRoot$({ id: 'existing' });
    const first = { id: 'first' };
    const second = { id: 'second' };
    const handler = createQRL('./listener.js', '_handler', () => {}, null, [first, second]);

    expect(serializeSsrEvent(serializationCtx, 'q-e:click', handler, false)).toBe(
      'listener.js#_handler#1 1'
    );
    expect(serializationCtx.$roots$).toEqual([{ id: 'existing' }, first, second]);
  });

  it('escapes the handler reference for the attribute', () => {
    const serializationCtx = createSerializationContext(null, () => '');
    const handler = createQRL('./a"b<c.js', 'direct', () => {}, null, null);

    expect(serializeSsrEvent(serializationCtx, 'q-e:click', handler, false)).toBe(
      'a&quot;b&lt;c.js#direct'
    );
  });
});
