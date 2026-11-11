import { describe, expect, it } from 'vitest';
import { getDevIdentity } from './dev-identity';

describe('local development identity', () => {
  it('uses an explicitly configured identity on localhost during development', () => {
    expect(getDevIdentity(true, new URL('http://localhost:5173/app/'), 'user@example.com')).toBe(
      'user@example.com'
    );
  });
  it.each(['http://127.0.0.1:5173/', 'http://[::1]:5173/'])('accepts loopback URL %s', (url) => {
    expect(getDevIdentity(true, new URL(url), 'user@example.com')).toBe('user@example.com');
  });
  it('disables the override in production even on localhost', () => {
    expect(getDevIdentity(false, new URL('http://localhost/'), 'user@example.com')).toBeNull();
  });
  it.each(['https://insights.qwik.dev/', 'http://localhost.example.com/', 'http://192.168.1.1/'])(
    'rejects non-loopback URL %s',
    (url) => {
      expect(getDevIdentity(true, new URL(url), 'user@example.com')).toBeNull();
    }
  );
  it('requires a nonempty configured email', () => {
    expect(getDevIdentity(true, new URL('http://localhost/'), undefined)).toBeNull();
    expect(getDevIdentity(true, new URL('http://localhost/'), '   ')).toBeNull();
  });
});
