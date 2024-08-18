import { describe, it, expect } from 'vitest';
import { Store2Flags, getOrCreateStore2, isStore2 } from './v2-store';

describe('v2/store', () => {
  it('should create and toString', () => {
    const store = getOrCreateStore2({ name: 'foo' }, Store2Flags.NONE);
    expect(isStore2({})).toEqual(false);
    expect(isStore2(store)).toEqual(true);
    expect(store.toString()).toEqual('[Store]');
  });
  it('should respond to instanceof', () => {
    const target = { name: 'foo' };
    Object.freeze(target);
    const store = getOrCreateStore2(target, Store2Flags.NONE);
    expect(store instanceof Array).toEqual(false);
    expect(target instanceof Object).toEqual(true);
  });
});
