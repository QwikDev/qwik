import { describe, expect, it } from 'vitest';
import { _val } from '../jsx/bind-handlers';
import { chkQrl, toCoreHandlerQrl, valQrl } from './handler-qrls';
import { createQRL } from './qrl-class';

describe('toCoreHandlerQrl', () => {
  it("swaps the optimizer's bind:value QRL for core's, keeping its captures", () => {
    const signal = {};
    const qrl = toCoreHandlerQrl(createQRL(null, '_val', _val, null, [signal]));

    expect(qrl.$symbol$).toBe(valQrl().$symbol$);
    expect(qrl.$captures$).toEqual([signal]);
  });

  it.each(['_val', '_chk'])(
    "swaps the optimizer's %s QRL from a library's own copy of core",
    (symbol) => {
      const otherCopy = () => {};
      const qrl = toCoreHandlerQrl(createQRL(null, symbol, otherCopy, null, [{}]));

      expect(qrl.$symbol$).toBe((symbol === '_val' ? valQrl() : chkQrl()).$symbol$);
    }
  );

  it('keeps a QRL whose captures are still serialized', () => {
    const qrl = createQRL('chunk.js', '_val', _val, null, '1 2');

    expect(toCoreHandlerQrl(qrl)).toBe(qrl);
  });
});
