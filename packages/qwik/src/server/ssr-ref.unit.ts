import { describe, expect, it, vi } from 'vitest';
import { Signal } from '@qwik.dev/core';
import { SsrDomRef, setSsrRef } from './ssr-ref';

describe('SSR refs', () => {
  it('stores an SSR ref in a signal and registers the signal as a root', () => {
    const ctx = createContext();
    const signal = new Signal<unknown>(undefined);

    setSsrRef(signal, 3, ctx);

    expect(signal.untrackedValue).toBeInstanceOf(SsrDomRef);
    expect((signal.untrackedValue as SsrDomRef).$nodeId$).toBe(3);
    expect(ctx.roots).toEqual([signal]);
  });

  it('calls a function ref and ignores its return value', () => {
    const callback = vi.fn(() => Promise.resolve('ignored'));

    expect(setSsrRef(callback, 5, createContext())).toBeUndefined();
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ $nodeId$: 5 }));
  });

  it('ignores empty refs and rejects invalid scalar refs', () => {
    const ctx = createContext();

    expect(setSsrRef(null, 0, ctx)).toBeUndefined();
    expect(setSsrRef(undefined, 0, ctx)).toBeUndefined();
    expect(() => setSsrRef('invalid', 0, ctx)).toThrow();
    expect(ctx.roots).toEqual([]);
  });
});

function createContext() {
  const roots: unknown[] = [];
  return {
    roots,
    $addRoot$(value: unknown) {
      const existing = roots.indexOf(value);
      if (existing !== -1) {
        return existing;
      }
      roots.push(value);
      return roots.length - 1;
    },
  };
}
