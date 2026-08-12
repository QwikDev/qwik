import { describe, expect, it } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { useComputed, useSignal } from '../reactive/public-api';
import {
  _props,
  allocatePropsProxy,
  createPropsProxy,
  getPropSource,
  getPropsSources,
} from './props';

describe('component props', () => {
  it('resolves a registered prop source and drops undefined entries', () => {
    const id = useSignal(0);
    const props = _props({ id: 0, label: 'static' }, { id, label: undefined });

    // an undefined entry means the caller passed a static value: snapshot path
    expect(getPropsSources(props)).toEqual({ id });
    expect(getPropSource(props, 'id')).toBe(id);
    expect(getPropSource(props, 'label')).toBeUndefined();
    expect(getPropSource({}, 'id')).toBeUndefined();
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
