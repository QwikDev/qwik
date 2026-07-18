import { describe, expect, it } from 'vitest';
import { isPublicError, PublicError } from './public-error';

describe('PublicError', () => {
  it('string data doubles as the message', () => {
    const err = new PublicError('Out of stock');
    expect(err.message).toBe('Out of stock');
    expect(err.data).toBe('Out of stock');
  });

  it('object data lifts data.message onto the message', () => {
    const data = { message: 'No access', code: 'FORBIDDEN' };
    const err = new PublicError(data);
    expect(err.message).toBe('No access');
    expect(err.data).toBe(data);
  });

  it('object data without a message falls back to the default', () => {
    const err = new PublicError({ code: 'X' });
    expect(err.message).toBe('Server error');
    expect(err.data).toEqual({ code: 'X' });
  });

  it('is an Error', () => {
    expect(new PublicError('x')).toBeInstanceOf(Error);
  });

  describe('isPublicError', () => {
    it('accepts instances and subclass instances', () => {
      class CartError extends PublicError<{ sku: string }> {}
      expect(isPublicError(new PublicError('x'))).toBe(true);
      expect(isPublicError(new CartError({ sku: 'a' }))).toBe(true);
    });

    it('rejects a plain Error faking the shape', () => {
      expect(isPublicError(Object.assign(new Error('x'), { data: 'leak' }))).toBe(false);
    });

    it('rejects hostile values without throwing', () => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      expect(isPublicError(proxy)).toBe(false);
      expect(
        isPublicError(
          new Proxy(
            {},
            {
              getPrototypeOf() {
                throw new Error('trap');
              },
            }
          )
        )
      ).toBe(false);
    });
  });
});
