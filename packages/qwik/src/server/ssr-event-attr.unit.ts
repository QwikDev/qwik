import { describe, expect, it } from 'vitest';
import { createQRL } from '../core/shared/qrl/qrl-class';
import { createSerializationContext } from '../core/shared/serdes/serialization-context';
import { createSsrEventAttr, createSsrEventAttrParts } from './ssr-event-attr';

describe('SSR event attributes', () => {
  it('keeps capture references typed until ordered output commit', () => {
    const serializationCtx = createSerializationContext(
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const first = { id: 'first' };
    const second = { id: 'second' };
    const handler = createQRL('./listener.js', '_handler', () => {}, null, [first, second]);

    expect(createSsrEventAttr(serializationCtx, 'q-e:click', handler, false)).toEqual({
      type: 'event-attr',
      name: 'q-e:click',
      valueParts: [
        'listener.js#_handler#',
        { type: 'root-ref', localId: 0 },
        ' ',
        { type: 'root-ref', localId: 1 },
      ],
    });
    expect(serializationCtx.$roots$).toEqual([first, second]);
  });

  it('converts root paths and escapes only literal attribute chunks', () => {
    expect(
      createSsrEventAttrParts('q-e:input', ['listener.js#_handler<#', { path: [2, 1] }])
    ).toEqual([
      ' q-e:input="listener.js#_handler&lt;#',
      { type: 'root-ref-path', localPath: [2, 1] },
      '"',
    ]);
  });
});
