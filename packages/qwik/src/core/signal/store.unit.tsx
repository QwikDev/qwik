import { describe, it, expect, beforeEach } from 'vitest';
import { StoreFlags, getOrCreateStore, isStore } from './store';
import { getDomContainer } from '@qwik.dev/core';
import type { Container } from '../shared/types';
import { createDocument } from '@builder.io/qwik-dom';

describe('v2/store', () => {
  let container: Container | null = null;
  beforeEach(() => {
    const document = createDocument('<html><body q:container="paused"></body></html>');
    container = getDomContainer(document.body);
  });

  it('should create and toString', () => {
    const store = getOrCreateStore({ name: 'foo' }, StoreFlags.NONE, container);
    expect(isStore({})).toEqual(false);
    expect(isStore(store)).toEqual(true);
    expect(store.toString()).toEqual('[Store]');
  });
  it('should respond to instanceof', () => {
    const target = { name: 'foo' };
    Object.freeze(target);
    const store = getOrCreateStore(target, StoreFlags.NONE, container);
    expect(store instanceof Array).toEqual(false);
    expect(target instanceof Object).toEqual(true);
  });
});
