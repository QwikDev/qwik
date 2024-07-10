import { assert, test } from 'vitest';
import { Cookie } from './cookie';
import type { CookieOptions } from './types';

export interface TestData {
  key: string;
  value: string | Record<string, any>;
  options: CookieOptions;
  expect: string;
}

test('parses cookie', () => {
  const cookieValues = {
    a: 'hello=world',
    b: '25',
    c: '{"hello": "world"}',
    d: '%badencoding',
  };
  const cookieString = Object.entries(cookieValues)
    .reduce((prev: string[], [key, value]) => {
      return [...prev, `${key}=${value}`];
    }, [])
    .join(';');
  const cookie = new Cookie(cookieString);
  Object.keys(cookieValues).forEach((key) => {
    assert.equal(true, cookie.has(key));
  });
  Object.entries(cookieValues).forEach(([key, value]) => {
    assert.equal(cookie.get(key)?.value, value);
  });
  assert.equal(Object.keys(cookie.getAll()).length, 4);
  assert.equal(cookie.getAll().a.value, 'hello=world');
  assert.equal(cookie.getAll().b.number(), 25);
  assert.deepEqual(cookie.getAll().c.json(), { hello: 'world' });
  assert.equal(cookie.getAll().d.value, '%badencoding');
});

test('creates correct headers', () => {
  const data: TestData[] = [
    { key: 'a', value: '1', options: {}, expect: 'a=1' },
    { key: 'b', value: '2', options: { sameSite: 'strict' }, expect: 'b=2; SameSite=Strict' },
    { key: 'c', value: '3', options: { sameSite: 'lax' }, expect: 'c=3; SameSite=Lax' },
    { key: 'd', value: '4', options: { sameSite: 'none' }, expect: 'd=4; SameSite=None' },
    { key: 'e', value: '5', options: { httpOnly: true }, expect: 'e=5; HttpOnly' },
    { key: 'f', value: '6', options: { secure: true }, expect: 'f=6; Secure' },
    {
      key: 'g',
      value: '7',
      options: { path: '/qwikcity/overview/' },
      expect: 'g=7; Path=/qwikcity/overview/',
    },
    {
      key: 'h',
      value: '8',
      options: { maxAge: [60, 'minutes'] },
      expect: `h=8; Max-Age=${60 * 60}`,
    },
    { key: 'i', value: '9', options: { maxAge: 60 * 60 }, expect: `i=9; Max-Age=${60 * 60}` },
    {
      key: 'j',
      value: '10',
      options: { domain: 'https://qwik.dev' },
      expect: 'j=10; Domain=https://qwik.dev',
    },
    {
      key: 'k',
      value: '11',
      options: { expires: 'Wed, 21 Oct 2015 07:28:00 GMT' },
      expect: 'k=11; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
    },
    {
      key: 'l',
      value: '12',
      options: { expires: new Date('Wed, 21 Oct 2015 07:28:00 GMT') },
      expect: 'l=12; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
    },
    {
      key: 'm',
      value: '13',
      options: { expires: new Date(0) },
      expect: 'm=13; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    },
    { key: 'n', value: '14', options: { sameSite: 'Strict' }, expect: 'n=14; SameSite=Strict' },
    { key: 'o', value: '15', options: { sameSite: 'Lax' }, expect: 'o=15; SameSite=Lax' },
    { key: 'p', value: '16', options: { sameSite: 'None' }, expect: 'p=16; SameSite=None' },
  ];
  const cookie = new Cookie('');
  const expect = data.map(({ expect }) => expect);

  data.forEach(({ key, value, options }) => {
    cookie.set(key, value, options);
  });

  const result = cookie.headers();
  assert.equal(expect.length, result.length);
  for (let i = 0; i < expect.length; i++) {
    const expected = expect[i];
    const actual = result[i];
    assert.equal(actual, expected);
  }
});

test('append cookies all keys are present', () => {
  const data: TestData[] = [
    { key: 'a', value: '1', options: {}, expect: 'a=1' },
    { key: 'a', value: '2', options: { sameSite: 'strict' }, expect: 'a=2; SameSite=Strict' },
    { key: 'a', value: '2', options: { sameSite: 'lax' }, expect: 'a=2; SameSite=Lax' },
    { key: 'a', value: '2', options: { sameSite: 'none' }, expect: 'a=2; SameSite=None' },
    { key: 'a', value: '2', options: { httpOnly: true }, expect: 'a=2; HttpOnly' },
    { key: 'a', value: '6', options: { secure: true }, expect: 'a=6; Secure' },
    {
      key: 'a',
      value: '7',
      options: { path: '/qwikcity/overview/' },
      expect: 'a=7; Path=/qwikcity/overview/',
    },
    {
      key: 'a',
      value: '8',
      options: { maxAge: [60, 'minutes'] },
      expect: `a=8; Max-Age=${60 * 60}`,
    },
    { key: 'a', value: '9', options: { maxAge: 60 * 60 }, expect: `a=9; Max-Age=${60 * 60}` },
    {
      key: 'a',
      value: '10',
      options: { domain: 'https://qwik.dev' },
      expect: 'a=10; Domain=https://qwik.dev',
    },
    {
      key: 'b',
      value: '1',
      options: { expires: 'Wed, 21 Oct 2015 07:28:00 GMT' },
      expect: 'b=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
    },
    {
      key: 'b',
      value: '1',
      options: { domain: 'https://qwik.dev' },
      expect: 'b=1; Domain=https://qwik.dev',
    },
    {
      key: 'b',
      value: '1',
      options: { expires: new Date(0) },
      expect: 'b=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    },
    { key: 'c', value: '14', options: { sameSite: 'Strict' }, expect: 'c=14; SameSite=Strict' },
    { key: 'c', value: '15', options: { sameSite: 'Lax' }, expect: 'c=15; SameSite=Lax' },
    { key: 'd', value: '16', options: { sameSite: 'None' }, expect: 'd=16; SameSite=None' },
  ];
  const cookie = new Cookie('');
  const expect = data.map(({ expect }) => expect);

  data.forEach(({ key, value, options }) => {
    cookie.append(key, value, options);
  });

  const result = cookie.headers();
  assert.equal(expect.length, result.length);
  for (let i = 0; i < expect.length; i++) {
    const expected = expect[i];
    const actual = result[i];
    assert.equal(actual, expected);
  }
});

test('set cookies only latest key is present', () => {
  const data: TestData[] = [
    { key: 'a', value: '1', options: {}, expect: 'a=1' },
    { key: 'a', value: '2', options: { sameSite: 'strict' }, expect: 'a=2; SameSite=Strict' },
  ];
  const cookie = new Cookie('');

  data.forEach(({ key, value, options }) => {
    cookie.set(key, value, options);
  });

  const result = cookie.headers();
  assert.equal(1, result.length);
  assert.equal(result[0], data[1].expect);
});
