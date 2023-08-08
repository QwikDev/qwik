import { test } from 'uvu';
import { equal } from 'uvu/assert';
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
    equal(true, cookie.has(key));
  });
  Object.entries(cookieValues).forEach(([key, value]) => {
    equal(cookie.get(key)?.value, value);
  });
  equal(Object.keys(cookie.getAll()).length, 4);
  equal(cookie.getAll().a.value, 'hello=world');
  equal(cookie.getAll().b.number(), 25);
  equal(cookie.getAll().c.json(), { hello: 'world' });
  equal(cookie.getAll().d.value, '%badencoding');
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
      options: { domain: 'https://qwik.builder.io' },
      expect: 'j=10; Domain=https://qwik.builder.io',
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
  ];
  const cookie = new Cookie('');
  const expect = data.map(({ expect }) => expect);

  data.forEach(({ key, value, options }) => {
    cookie.set(key, value, options);
  });

  const result = cookie.headers();
  equal(expect.length, result.length);
  for (let i = 0; i < expect.length; i++) {
    const expected = expect[i];
    const actual = result[i];
    equal(actual, expected);
  }
});

test.run();
