import { describe, expect, it } from 'vitest';
import { PublicError } from '../error/public-error';
import { canSerialize } from './can-serialize';

describe('canSerialize: Error fields', () => {
  it('accepts an Error with serializable own fields', () => {
    const err = Object.assign(new Error('x'), { code: 401, meta: { ok: true } });
    expect(canSerialize(err)).toBe(true);
  });

  it('accepts a PublicError with serializable data', () => {
    expect(canSerialize(new PublicError({ code: 'X', items: [1] }))).toBe(true);
  });

  it('handles cyclic Error fields', () => {
    const err = new Error('x') as Error & { self?: unknown };
    err.self = err;
    expect(canSerialize(err)).toBe(true);
  });
});
