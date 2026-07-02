import { describe, expect, it } from 'vitest';
import { RealGeneratorProp } from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import { invokeApply, newInvokeContext, tryGetInvokeContext } from './use-core';

describe('invokeApply generator driving', () => {
  it('should await yielded values and restore the invoke context on each resume', async () => {
    const ctx = newInvokeContext('test-locale');
    const seenContexts: unknown[] = [];
    function* segment() {
      seenContexts.push(tryGetInvokeContext());
      const a = (yield Promise.resolve(1)) as number;
      seenContexts.push(tryGetInvokeContext());
      const b = (yield 2) as number;
      seenContexts.push(tryGetInvokeContext());
      return a + b;
    }

    const result = invokeApply(ctx, segment as any);
    expect(tryGetInvokeContext()).toBeUndefined();
    expect(isPromise(result)).toBe(true);
    await expect(result).resolves.toBe(3);
    expect(seenContexts).toEqual([ctx, ctx, ctx]);
  });

  it('should unwrap a returned promise like an async function does', async () => {
    const ctx = newInvokeContext();
    // eslint-disable-next-line require-yield
    function* segment() {
      return Promise.resolve('done');
    }
    await expect(invokeApply(ctx, segment as any)).resolves.toBe('done');
  });

  it('should throw rejections back into the generator', async () => {
    const ctx = newInvokeContext();
    function* segment() {
      try {
        yield Promise.reject(new Error('boom'));
        return 'not reached';
      } catch (e) {
        return `caught ${(e as Error).message} ${tryGetInvokeContext() === ctx}`;
      }
    }
    await expect(invokeApply(ctx, segment as any)).resolves.toBe('caught boom true');
  });

  it('should reject instead of throwing when the body throws synchronously', async () => {
    const ctx = newInvokeContext();
    // eslint-disable-next-line require-yield
    function* segment() {
      throw new Error('sync throw');
    }
    let result: unknown;
    expect(() => (result = invokeApply(ctx, segment as any))).not.toThrow();
    await expect(result).rejects.toThrow('sync throw');
  });

  it('should reject when the generator does not handle the error', async () => {
    const ctx = newInvokeContext();
    function* segment() {
      yield Promise.reject(new Error('unhandled'));
    }
    await expect(invokeApply(ctx, segment as any)).rejects.toThrow('unhandled');
  });

  it('should return generators from marked real generator functions as-is', () => {
    const ctx = newInvokeContext();
    function* realGen() {
      yield 1;
      yield 2;
    }
    (realGen as any)[RealGeneratorProp] = true;
    const result = invokeApply(ctx, realGen as any) as Generator;
    expect(isPromise(result)).toBe(false);
    expect([...result]).toEqual([1, 2]);
  });

  it('should pass through non-generator results synchronously', () => {
    const ctx = newInvokeContext();
    expect(invokeApply(ctx, () => 42)).toBe(42);
    const iterable = { next: () => ({ done: true, value: 1 }) };
    expect(invokeApply(ctx, () => iterable)).toBe(iterable);
    async function* asyncGen() {}
    const asyncGenInstance = asyncGen();
    expect(invokeApply(ctx, () => asyncGenInstance)).toBe(asyncGenInstance);
  });
});
