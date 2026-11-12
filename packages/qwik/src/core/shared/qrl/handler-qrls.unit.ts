import { describe, expect, it } from 'vitest';
import { _val } from '../jsx/bind-handlers';
import { toCoreHandlerQrl, valQrl } from './handler-qrls';
import { createQRL } from './qrl-class';

describe('toCoreHandlerQrl', () => {
  it("swaps the optimizer's bind:value QRL for core's, keeping its captures", () => {
    const signal = {};
    const qrl = toCoreHandlerQrl(createQRL(null, '_val', _val, null, [signal]));

    expect(qrl.$symbol$).toBe(valQrl().$symbol$);
    expect(qrl.$captures$).toEqual([signal]);
  });

  it('keeps a QRL whose captures are still serialized', () => {
    const qrl = createQRL('chunk.js', '_val', _val, null, '1 2');

    expect(toCoreHandlerQrl(qrl)).toBe(qrl);
  });
});
