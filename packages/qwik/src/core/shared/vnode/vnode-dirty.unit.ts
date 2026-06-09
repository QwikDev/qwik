import { describe, expect, it, vi } from 'vitest';
import { markVNodeDirty } from './vnode-dirty';
import { ChoreBits } from './enums/chore-bits.enum';
import type { Container } from '../types';

describe('markVNodeDirty', () => {
  it('does not throw when vNode is undefined (destroyed container)', () => {
    // After DomContainer.$destroy$(), $getObjectById$ returns undefined for all IDs.
    // Callers like scheduleTask, _hmr, _val, _chk pass the deserialized result
    // directly to markVNodeDirty — which would be undefined.
    const container = {} as Container;
    expect(() => {
      markVNodeDirty(container, undefined as any, ChoreBits.TASKS);
    }).not.toThrow();
  });

  it('does not throw when vNode is null', () => {
    const container = {} as Container;
    expect(() => {
      markVNodeDirty(container, null as any, ChoreBits.TASKS);
    }).not.toThrow();
  });
});
