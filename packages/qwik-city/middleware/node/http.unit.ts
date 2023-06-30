import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { normalizeUrl } from './http';

[
  {
    url: '/',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/',
  },
  {
    url: '/attacker.com',
    base: 'https://qwik.dev',
    expect: 'https://qwik.dev/attacker.com',
  },
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
].forEach((t) => {
  test(`normalizeUrl(${t.url}, ${t.base})`, () => {
    equal(normalizeUrl(t.url, t.base).href, t.expect);
  });
});

test.run();
