import { describe, expect, it, vi } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { useComputed, useSignal } from '../reactive/public-api';
import {
  _props,
  allocatePropsProxy,
  createPropsProxy,
  getPropsSources,
  PropSource,
  propSource,
} from './props';
import { createQRL } from '../shared/qrl/qrl-class';
import { readTrackedValue } from '../dom/effect/text-effect';

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

  it('keeps reading its source after props named like its internals are written or deleted', () => {
    const source = useSignal({ source: 'prop', excluded: 'prop' });
    const props = createPropsProxy(source) as Record<string, unknown>;
    const rest = createPropsProxy(props, ['excluded']) as Record<string, unknown>;

    props.source = 'written';
    delete props.excluded;
    rest.source = 'written';
    Object.defineProperty(rest, 'excluded', { value: 'defined' });

    expect([props.source, props.excluded, rest.source, rest.excluded]).toEqual([
      'prop',
      'prop',
      'prop',
      undefined,
    ]);
    source.value = { source: 'next', excluded: 'next' };
    expect([props.source, rest.source]).toEqual(['next', 'next']);
  });

  it('is never a thenable, so resolving it as a state root never reads its source', async () => {
    const owner = createOwner(null);
    const source = runWithOwner(owner, () =>
      useComputed<{ count: number }>(() => {
        throw new Error('read');
      })
    );
    const props = createPropsProxy(source);

    expect((props as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(props)).resolves.toBe(props);
  });

  it('warns once in dev that a prop named then is unreadable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const props = createPropsProxy(useSignal({ then: 'next', label: 'a' }));

      expect((props as { label: string }).label).toBe('a');
      expect((props as { label: string }).label).toBe('a');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0])).toContain('then');
    } finally {
      warn.mockRestore();
    }
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

  it('resolves a prop to the source behind it', () => {
    const owner = createOwner();
    runWithOwner(owner, () => {
      const title = useSignal('Hello');
      const passed = _props(
        {
          get title() {
            return title.value;
          },
          get computed() {
            return 'later';
          },
          count: 1,
        },
        { title, computed: createQRL('./later.js', 'later', () => 'later', null, null) }
      );

      // The parent's signal is the source itself.
      expect(propSource(passed, 'title')).toBe(title);
      // A computed prop reads through its getter, so the record is what resumes it.
      const computed = propSource(passed, 'computed') as PropSource;
      expect(computed).toBeInstanceOf(PropSource);
      expect(computed.v).toBe('later');
      // A static prop is its value: nothing can change it, so nothing subscribes.
      expect(propSource(passed, 'count')).toBe(1);
      expect(getPropsSources(_props({ a: 1 }, { a: 1 }))).toEqual({});
      // Spread props read through the proxy, so a replaced record reaches the member.
      const record = useSignal<Record<string, unknown>>({ label: 'a' });
      const proxied = propSource(createPropsProxy(record), 'label') as PropSource;
      expect(proxied).toBeInstanceOf(PropSource);
      record.value = { label: 'b' };
      expect(proxied.v).toBe('b');
    });
  });

  it('preserves a signal stored in a plain prop', () => {
    const shared = useSignal(7);
    const source = propSource({ shared }, 'shared');

    expect(source).toBeInstanceOf(PropSource);
    expect(readTrackedValue(source)).toBe(shared);
  });
});
