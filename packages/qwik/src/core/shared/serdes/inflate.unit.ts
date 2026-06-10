import { describe, expect, it } from 'vitest';
import { TypeIds } from './constants';
import { inflate } from './inflate';

const encodeObjectData = (entries: Array<[unknown, unknown]>): unknown[] => {
  const out: unknown[] = [];
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    out.push(TypeIds.Plain, key, TypeIds.Plain, value);
  }
  return out;
};

describe('inflate(TypeIds.Object) unsafe key handling', () => {
  it('should skip "__proto__" to prevent prototype pollution', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const data = encodeObjectData([
      ['__proto__', { polluted: true }],
      ['ok', 1],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target.ok).toBe(1);
    expect((target as any).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
  });

  it('should skip dangerous keys when value is a function', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const fn = () => 'x';
    const data = encodeObjectData([
      ['constructor', fn],
      ['prototype', fn],
      ['toString', fn],
      ['valueOf', fn],
      ['toJSON', fn],
      ['then', fn],
      ['safeFn', fn],
    ]);

    inflate(container, target, TypeIds.Object, data);

    const keys = ['constructor', 'prototype', 'toString', 'valueOf', 'toJSON', 'then'];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      expect(Object.prototype.hasOwnProperty.call(target, key)).toBe(false);
    }
    expect(target.safeFn).toBe(fn);
  });

  it('should allow dangerous-looking keys when value is not a function', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const data = encodeObjectData([
      ['constructor', 123],
      ['toString', 'ok'],
      ['then', false],
      ['regular', 'value'],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target.constructor).toBe(123);
    expect(target.toString).toBe('ok');
    expect(target.then).toBe(false);
    expect(target.regular).toBe('value');
  });

  it('should allow numeric keys and skip other non-string keys', () => {
    const container = {} as any;
    const target: Record<string, unknown> = {};
    const sym = Symbol('k');
    const data = encodeObjectData([
      [1, 'one'],
      [sym, 'symbol'],
      ['valid', 2],
    ]);

    inflate(container, target, TypeIds.Object, data);

    expect(target[1]).toBe('one');
    expect(target.valid).toBe(2);
    expect((target as any)[sym]).toBeUndefined();
  });
});
