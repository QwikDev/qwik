import { assert, test } from 'vitest';
import { normalizeRequestUrl } from './url';

[
  {
    url: '//attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
  {
    url: '\\\\attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
  {
    url: '/some-path//attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/some-path/attacker.com',
  },
  {
    url: '///attacker.com/path?query=1#hash',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com/path?query=1#hash',
  },
  {
    url: '/callback?redirect=https://idp.example/callback',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/callback?redirect=https://idp.example/callback',
  },
  {
    url: '/docs#https://cdn.example/assets//guide',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/docs#https://cdn.example/assets//guide',
  },
].forEach((t) => {
  test(`normalizeRequestUrl(${t.url}, ${t.base})`, () => {
    assert.equal(normalizeRequestUrl(t.url, t.base).href, t.expect);
  });
});
