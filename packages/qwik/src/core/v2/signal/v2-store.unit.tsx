import { describe, it, expect, beforeEach } from 'vitest';
import { Store2Flags, getOrCreateStore2, isStore2 } from './v2-store';
import { getDomContainer } from '@builder.io/qwik';
import type { Container2 } from '../shared/types';
import { createDocument } from '@builder.io/qwik-dom';

describe('v2/store', () => {
  let container: Container2 | null = null;
  beforeEach(() => {
    const document = createDocument('<html><body q:container="paused"></body></html>');
    container = getDomContainer(document.body);
  });

  it('should create and toString', () => {
    const store = getOrCreateStore2({ name: 'foo' }, Store2Flags.NONE, container);
    expect(isStore2({})).toEqual(false);
    expect(isStore2(store)).toEqual(true);
    expect(store.toString()).toEqual('[Store]');
  });
  it('should respond to instanceof', () => {
    const target = { name: 'foo' };
    Object.freeze(target);
    const store = getOrCreateStore2(target, Store2Flags.NONE, container);
    expect(store instanceof Array).toEqual(false);
    expect(target instanceof Object).toEqual(true);
  });
});
