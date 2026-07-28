import { describe, expect, it } from 'vitest';
import { PublicError } from './public-error';

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
});
