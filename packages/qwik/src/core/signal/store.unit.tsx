import { getDomContainer } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Container } from '../shared/types';
import { StoreFlags, getOrCreateStore, isStore } from './store';

describe('v2/store', () => {
  let container: Container | null = null;
  beforeEach(() => {
    const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
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
