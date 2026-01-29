import { assert, test } from 'vitest';
import {
  getClientDataPath,
  getClientNavPath,
  shouldPreload,
  isSameOrigin,
  isSameOriginDifferentPathname,
  isSamePath,
  toPath,
} from './utils';

[
  {
    a: 'http://qwik.dev/',
    b: 'http://qwik.dev/',
    expect: false,
  },
  {
    a: 'http://qwik.dev/',
    b: 'http://b.io/',
    expect: false,
  },
  {
    a: 'http://qwik.dev/',
    b: 'http://b.io/path-b',
    expect: false,
  },
  {
    a: 'http://qwik.dev/path-a',
    b: 'http://qwik.dev/path-b',
    expect: true,
  },
  {
    a: 'http://qwik.dev/qs=a',
    b: 'http://qwik.dev/qs=b',
    expect: true,
  },
  {
    a: 'http://qwik.dev/qs=a',
    b: 'http://qwik.dev/qs=a',
    expect: false,
  },
  {
    a: 'http://qwik.dev/qs=a#hash1',
    b: 'http://qwik.dev/qs=b#hash1',
    expect: true,
  },
  {
    a: 'http://qwik.dev/qs=a#hash1',
    b: 'http://qwik.dev/qs=a#hash1',
    expect: false,
  },
  {
    a: 'http://qwik.dev/qs=a#hash1',
    b: 'http://qwik.dev/qs=a#hash2',
    expect: false,
  },
].forEach((t) => {
  const a = new URL(t.a);
  const b = new URL(t.b);
  test(`isSameOriginDifferentPathname(${a},${b})`, () => {
    assert.equal(isSameOriginDifferentPathname(a, b), t.expect);
  });
});

[
  { pathname: '/', expect: '/q-data.json' },
  { pathname: '/about', expect: '/about/q-data.json' },
  { pathname: '/about/', expect: '/about/q-data.json' },
].forEach((t) => {
  test(`getClientEndpointUrl("${t.pathname}")`, () => {
    const endpointPath = getClientDataPath(t.pathname);
    assert.equal(endpointPath, t.expect);
  });
});

[
  { pathname: '/', search: '?foo=bar', expect: '/q-data.json?foo=bar' },
  { pathname: '/about', search: '?foo=bar', expect: '/about/q-data.json?foo=bar' },
  { pathname: '/about/', search: '?foo=bar', expect: '/about/q-data.json?foo=bar' },
  { pathname: '/about/', search: '?foo=bar&baz=qux', expect: '/about/q-data.json?foo=bar&baz=qux' },
].forEach((t) => {
  test(`getClientEndpointUrl("${t.pathname}", "${t.search}")`, () => {
    const endpointPath = getClientDataPath(t.pathname, t.search);
    assert.equal(endpointPath, t.expect);
  });
});

[
  {
    url: 'http://qwik.dev/',
    expect: '/',
  },
  {
    url: 'http://qwik.dev/about',
    expect: '/about',
  },
  {
    url: 'http://qwik.dev/about?qs=1',
    expect: '/about?qs=1',
  },
  {
    url: 'http://qwik.dev/about#hash',
    expect: '/about#hash',
  },
].forEach((t) => {
  test(`toPath("${t.url}")`, () => {
    const url = new URL(t.url);
    assert.equal(toPath(url), t.expect);
  });
});

[
  {
    a: 'http://qwik.dev/',
    b: 'http://qwik.dev/',
    expect: true,
  },
  {
    a: 'http://qwik.dev/',
    b: 'http://qwik.dev/#hash',
    expect: true,
  },
  {
    a: 'http://qwik.dev/',
    b: 'http://qwik.dev/about',
    expect: false,
  },
  {
    a: 'http://qwik.dev/',
    b: 'http://qwik.dev/?qs',
    expect: false,
  },
  {
    a: 'http://qwik.dev/?qs',
    b: 'http://qwik.dev/?qs',
    expect: true,
  },
  {
    a: 'http://qwik.dev/?qs#hash',
    b: 'http://qwik.dev/?qs',
    expect: true,
  },
].forEach((t) => {
  test(`isSamePath(${t.a}, ${t.b})`, () => {
    assert.equal(isSamePath(new URL(t.a), new URL(t.b)), t.expect);
  });
});

test(`isSameOrigin`, () => {
  assert.equal(
    isSameOrigin(new URL('http://qwik.dev/'), new URL('http://qwik.dev/about-us')),
    true
  );
  assert.equal(
    isSameOrigin(new URL('https://qwik.dev/'), new URL('http://qwik.dev/about-us')),
    false
  );
  assert.equal(
    isSameOrigin(new URL('https://builder.io/'), new URL('http://qwik.dev/about-us')),
    false
  );
});

[
  { props: { href: '#hash' }, expect: '/#hash' },
  { props: { href: '?qs=true' }, expect: '/?qs=true' },
  { props: { href: '/abs-path' }, expect: '/abs-path' },
  { props: { href: './rel-path' }, expect: '/rel-path' },
  { props: { href: 'rel-path' }, expect: '/rel-path' },
  { props: { href: '/path/../rel-path' }, expect: '/rel-path' },
  { props: { href: '/abs-path', target: '_blank' }, expect: null },
  { props: { href: 'http://qwik.dev/' }, expect: null },
  { props: { href: 'http://builder.io/' }, expect: null },
  { props: { href: '       ' }, expect: '/' },
  { props: { href: '' }, expect: '/' },
  { props: { href: null }, expect: null },
  { props: {}, expect: null },
  { props: { reload: true }, expect: '/' },
].forEach((t) => {
  test(`getClientNavPath ${t.props.href}`, () => {
    const baseUrl = new URL('https://qwik.dev/');
    assert.equal(
      getClientNavPath(t.props, { url: baseUrl }),
      t.expect,
      `${t.props.href} ${t.expect}`
    );
  });
});

// ======================
test('missing clientNavPath', () => {
  const clientNavPath = null;
  const currentLoc = new URL('https://qwik.dev/contact');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), false);
});

test('path and current path the same, has different querystring and hash', () => {
  const clientNavPath = '/about?qs#hash';
  const currentLoc = new URL('https://qwik.dev/about');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), false);
});

test('path and current path the same, different trailing slash', () => {
  const clientNavPath = '/about/';
  const currentLoc = new URL('https://qwik.dev/about');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), false);
});

test('path and current path the same', () => {
  const clientNavPath = '/about';
  const currentLoc = new URL('https://qwik.dev/about');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), false);
});

test('valid prefetchUrl, has querystring and hash', () => {
  const clientNavPath = '/about?qs#hash';
  const currentLoc = new URL('https://qwik.dev/contact');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), true);
});

test('valid prefetchUrl, trailing slash', () => {
  const clientNavPath = '/about/';
  const currentLoc = new URL('https://qwik.dev/contact');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), true);
});

test('valid prefetchUrl', () => {
  const clientNavPath = '/about';
  const currentLoc = new URL('https://qwik.dev/contact');
  assert.equal(shouldPreload(clientNavPath, { url: currentLoc }), true);
});
