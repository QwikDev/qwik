import { describe, expect, expectTypeOf, test } from 'vitest';
import { ServerError } from './server-error';

describe('ServerError payload flattening', () => {
  test('flattens regular payload fields onto the error', () => {
    const err = new ServerError(400, { fieldErrors: { name: 'too short' }, code: 'BAD_NAME' });
    expect(err.fieldErrors).toEqual({ name: 'too short' });
    expect(err.code).toBe('BAD_NAME');
    expect(err.data).toEqual({ fieldErrors: { name: 'too short' }, code: 'BAD_NAME' });
  });

  test('a string `message` field sets Error.message', () => {
    const err = new ServerError(401, { message: 'Invalid credentials' });
    expect(err.message).toBe('Invalid credentials');
    expect(err.data.message).toBe('Invalid credentials');
  });

  test('a non-string `message` field does not clobber Error.message', () => {
    const err = new ServerError(400, { message: ['Too short', 'No spaces'] });
    expect(err.message).toBe('');
    expect(typeof err.message).toBe('string');
    expect(err.data.message).toEqual(['Too short', 'No spaces']);
  });

  test('payload cannot spoof status, data, name, or stack', () => {
    const payload = { status: 999, data: 'spoofed', name: 'NotAnError', stack: 'fake stack' };
    const err = new ServerError(403, payload as Record<string, unknown>);
    expect(err.status).toBe(403);
    expect(err.data).toEqual(payload);
    expect(err.name).toBe('Error');
    expect(err.stack).not.toBe('fake stack');
  });

  test('a JSON-derived __proto__ key cannot replace the prototype', () => {
    const payload = JSON.parse('{"__proto__": {"isAdmin": true}, "reason": "nope"}');
    const err = new ServerError(400, payload);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as unknown as Record<string, unknown>).isAdmin).toBeUndefined();
    expect((err as unknown as Record<string, unknown>).reason).toBe('nope');
  });

  test('string payloads keep working', () => {
    const err = new ServerError(404, 'Not found');
    expect(err.message).toBe('Not found');
    expect(err.data).toBe('Not found');
  });

  test('reserved keys are excluded from the flat type but kept on .data', () => () => {
    const err = new ServerError(400, {
      message: ['a'] as string[],
      custom: 1,
    });
    expectTypeOf(err.message).toEqualTypeOf<string>();
    expectTypeOf(err.custom).toEqualTypeOf<number>();
    expectTypeOf(err.data.message).toEqualTypeOf<string[]>();
  });
});
