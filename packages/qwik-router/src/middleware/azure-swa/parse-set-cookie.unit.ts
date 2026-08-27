import { assert, test } from 'vitest';
import { parseSetCookieString } from './parse-set-cookie';

test('parses name and value', () => {
  assert.deepEqual(parseSetCookieString('foo=bar'), { name: 'foo', value: 'bar' });
});

test('decodes percent-encoded values', () => {
  assert.deepEqual(parseSetCookieString('foo=hello%20world'), {
    name: 'foo',
    value: 'hello world',
  });
});

test('keeps values that are not valid percent-encoding', () => {
  assert.deepEqual(parseSetCookieString('foo=100%'), { name: 'foo', value: '100%' });
});

test('keeps = inside the value', () => {
  assert.deepEqual(parseSetCookieString('foo=a=b'), { name: 'foo', value: 'a=b' });
});

test('parses all supported attributes', () => {
  const cookie = parseSetCookieString(
    'session=abc123; Domain=example.com; Path=/app; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Max-Age=3600; Secure; HttpOnly; SameSite=Lax'
  );
  assert.deepEqual(cookie, {
    name: 'session',
    value: 'abc123',
    domain: 'example.com',
    path: '/app',
    expires: new Date('Wed, 21 Oct 2026 07:28:00 GMT'),
    maxAge: 3600,
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  });
});

test('ignores unknown attributes', () => {
  assert.deepEqual(parseSetCookieString('foo=bar; Partitioned; Priority=High'), {
    name: 'foo',
    value: 'bar',
  });
});
