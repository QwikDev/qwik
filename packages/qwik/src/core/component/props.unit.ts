import { describe, expect, it } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { useComputed, useSignal } from '../reactive/public-api';
import {
  _props,
  allocatePropsProxy,
  createPropsProxy,
  getMemberSource,
  getPropSource,
  getPropsSources,
} from './props';
import { getStoreSource, useStore } from '../reactive/store';

describe('component props', () => {
  it('views remaining own props without copying values or reading excluded keys', () => {
    const symbol = Symbol('prop');
    const props = Object.create({ inherited: 'ignored' });
    Object.defineProperties(props, {
      children: {
        enumerable: true,
        get() {
          throw new Error('children read');
        },
      },
      title: {
        enumerable: true,
        get() {
          throw new Error('excluded read');
        },
      },
      hidden: { value: 'ignored' },
      label: {
        enumerable: true,
        get() {
          return this.current;
        },
      },
      current: { writable: true, value: 'label' },
    });
    Object.defineProperty(props, '__proto__', { enumerable: true, value: 'safe' });
    props[symbol] = 'symbol';
    const rest = createPropsProxy(props, ['children', 'title']);
    expect(Reflect.ownKeys(rest)).toEqual(['label', '__proto__', symbol]);
    expect(rest.label).toBe('label');
    expect(rest[symbol]).toBe('symbol');
    expect(rest.title).toBeUndefined();
    expect(rest.children).toBeUndefined();
    expect(rest.hidden).toBeUndefined();
    expect(rest.inherited).toBeUndefined();
    expect('title' in rest).toBe(false);
    expect(Object.getOwnPropertyDescriptor(rest, 'title')).toBeUndefined();
    expect(Object.getPrototypeOf(rest)).toBeNull();
    expect(rest.__proto__).toBe('safe');
    props.current = 'updated';
    props.added = 'new';
    expect(rest.label).toBe('updated');
    expect(rest.added).toBe('new');
    expect(Object.keys(rest)).toEqual(['label', '__proto__', 'added']);
  });
  it('resolves a registered prop source and drops undefined entries', () => {
    const id = useSignal(0);
    const props = _props({ id: 0, label: 'static' }, { id, label: undefined });

    // an undefined entry means the caller passed a static value: snapshot path
    expect(getPropsSources(props)).toEqual({ id });
    expect(getPropSource(props, 'id')).toBe(id);
    expect(getPropSource(props, 'label')).toBeUndefined();
    expect(getPropSource({}, 'id')).toBeUndefined();
  });

  it('resolves member sources by what the slot actually holds', () => {
    const signal = useSignal(0);
    const store = useStore({ foo: 10, signal });

    // a store target yields its slot source, whatever the slot holds
    expect(getMemberSource(store, 'foo')).toBe(getStoreSource(store, 'foo'));
    // a signal target yields itself for .value reads only
    expect(getMemberSource(signal, 'value')).toBe(signal);
    expect(getMemberSource(signal, 'other')).toBeUndefined();
    // plain data has no source: the snapshot path is correct
    expect(getMemberSource({ value: 1 }, 'value')).toBeUndefined();
    expect(getMemberSource(undefined, 'value')).toBeUndefined();
  });

  it('reads and tracks the current props source', () => {
    const owner = createOwner(null);
    const source = useSignal({ count: 1, value: 'user value' });
    const props = createPropsProxy(source);
    const count = runWithOwner(owner, () => useComputed(() => props.count));

    expect(count.value).toBe(1);
    expect(props.value).toBe('user value');

    source.value = { count: 2, value: 'next value' };

    expect(count.value).toBe(2);
    expect(props.value).toBe('next value');
  });

  it('reflects the current own property shape', () => {
    const symbol = Symbol('symbol prop');
    const source = useSignal<Record<PropertyKey, unknown>>({
      first: 1,
      value: 'user value',
    });
    const props = createPropsProxy(source);

    expect(Object.keys(props)).toEqual(['first', 'value']);
    expect('first' in props).toBe(true);
    expect(Object.getOwnPropertyDescriptor(props, 'first')).toMatchObject({
      configurable: true,
      enumerable: true,
      value: 1,
    });

    source.value = { second: 2, [symbol]: 3 };

    expect(Object.keys(props)).toEqual(['second']);
    expect(Reflect.ownKeys(props)).toEqual(['second', symbol]);
    expect('first' in props).toBe(false);
    expect(props[symbol]).toBe(3);
  });

  it('reports reads before restoring the props source', () => {
    const props = allocatePropsProxy() as Record<string, unknown>;

    expect(() => props.value).toThrow('Code(Q39): Uninitialized props proxy');
  });
});
