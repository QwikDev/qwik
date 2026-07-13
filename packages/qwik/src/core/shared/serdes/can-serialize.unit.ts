import { describe, expect, it } from 'vitest';
import { canSerialize } from './can-serialize';

describe('canSerialize: Error fields', () => {
  it('accepts an Error with serializable own fields', () => {
    const err = Object.assign(new Error('x'), { code: 401, meta: { ok: true } });
    expect(canSerialize(err)).toBe(true);
  });

  it('rejects an Error with a function-valued own field', () => {
    expect(canSerialize(Object.assign(new Error('x'), { retry: () => {} }))).toBe(false);
  });

  it('rejects an Error with a nested unserializable field', () => {
    expect(canSerialize(Object.assign(new Error('x'), { meta: { cb: () => {} } }))).toBe(false);
  });

  it('rejects an Error whose message getter throws', () => {
    class Evil extends Error {
      // eslint-disable-next-line getter-return
      get message(): string {
        throw new Error('trap');
      }
    }
    expect(canSerialize(new Evil())).toBe(false);
  });

  it('handles cyclic Error fields', () => {
    const err = new Error('x') as Error & { self?: unknown };
    err.self = err;
    expect(canSerialize(err)).toBe(true);
  });
});
