import { test } from 'uvu';
import { equal } from 'uvu/assert';
import type { LinkProps } from './link-component';
import {
  getClientDataPath,
  getClientNavPath,
  getPrefetchDataset,
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
    equal(isSameOriginDifferentPathname(a, b), t.expect);
  });
});

[
  { pathname: '/', expect: '/q-data.json' },
  { pathname: '/about', expect: '/about/q-data.json' },
  { pathname: '/about/', expect: '/about/q-data.json' },
].forEach((t) => {
  test(`getClientEndpointUrl("${t.pathname}")`, () => {
    const endpointPath = getClientDataPath(t.pathname);
    equal(endpointPath, t.expect);
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
    equal(endpointPath, t.expect);
  });
});

[
  {
    url: 'http://qwik.builder.io/',
    expect: '/',
  },
  {
    url: 'http://qwik.builder.io/about',
    expect: '/about',
  },
  {
    url: 'http://qwik.builder.io/about?qs=1',
    expect: '/about?qs=1',
  },
  {
    url: 'http://qwik.builder.io/about#hash',
    expect: '/about#hash',
  },
].forEach((t) => {
  test(`toPath("${t.url}")`, () => {
    const url = new URL(t.url);
    equal(toPath(url), t.expect);
  });
});

[
  {
    a: 'http://qwik.builder.io/',
    b: 'http://qwik.builder.io/',
    expect: true,
  },
  {
    a: 'http://qwik.builder.io/',
    b: 'http://qwik.builder.io/#hash',
    expect: true,
  },
  {
    a: 'http://qwik.builder.io/',
    b: 'http://qwik.builder.io/about',
    expect: false,
  },
  {
    a: 'http://qwik.builder.io/',
    b: 'http://qwik.builder.io/?qs',
    expect: false,
  },
  {
    a: 'http://qwik.builder.io/?qs',
    b: 'http://qwik.builder.io/?qs',
    expect: true,
  },
  {
    a: 'http://qwik.builder.io/?qs#hash',
    b: 'http://qwik.builder.io/?qs',
    expect: true,
  },
].forEach((t) => {
  test(`isSamePath(${t.a}, ${t.b})`, () => {
    equal(isSamePath(new URL(t.a), new URL(t.b)), t.expect);
  });
});

test(`isSameOrigin`, () => {
  equal(
    isSameOrigin(new URL('http://qwik.builder.io/'), new URL('http://qwik.builder.io/about-us')),
    true
  );
  equal(
    isSameOrigin(new URL('https://qwik.builder.io/'), new URL('http://qwik.builder.io/about-us')),
    false
  );
  equal(
    isSameOrigin(new URL('https://builder.io/'), new URL('http://qwik.builder.io/about-us')),
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
  { props: { href: '       ' }, expect: null },
  { props: { href: '       ' }, expect: null },
  { props: { href: '' }, expect: null },
  { props: { href: null }, expect: null },
  { props: {}, expect: null },
].forEach((t) => {
  test(`getClientNavPath ${t.props.href}`, () => {
    const baseUrl = new URL('https://qwik.dev/');
    equal(getClientNavPath(t.props, baseUrl), t.expect, `${t.props.href} ${t.expect}`);
  });
});

test('no prefetch, missing clientNavPath', () => {
  const props: LinkProps = { prefetch: true };
  const clientNavPath = null;
  const currentLoc = new URL('https://qwik.builder.io/contact');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), null);
});

test('no prefetch, path and current path the same, has querystring and hash', () => {
  const props: LinkProps = {};
  const clientNavPath = '/about?qs#hash';
  const currentLoc = new URL('https://qwik.builder.io/about');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), null);
});

test('no prefetch, path and current path the same', () => {
  const props: LinkProps = {};
  const clientNavPath = '/about';
  const currentLoc = new URL('https://qwik.builder.io/about');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), null);
});

test('valid prefetchUrl, has querystring and hash', () => {
  const props: LinkProps = {};
  const clientNavPath = '/about?qs#hash';
  const currentLoc = new URL('https://qwik.builder.io/contact');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), '');
});

test('valid prefetchUrl, trailing slash', () => {
  const props: LinkProps = {};
  const clientNavPath = '/about/';
  const currentLoc = new URL('https://qwik.builder.io/contact');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), '');
});

test('valid prefetchUrl, prefetch true', () => {
  const props: LinkProps = { prefetch: true };
  const clientNavPath = '/about';
  const currentLoc = new URL('https://qwik.builder.io/contact');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), '');
});

test('valid prefetchUrl, add by default', () => {
  const props: LinkProps = {};
  const clientNavPath = '/about';
  const currentLoc = new URL('https://qwik.builder.io/contact');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), '');
});

test('prefetch false', () => {
  const props: LinkProps = { prefetch: false };
  const clientNavPath = '/about';
  const currentLoc = new URL('https://qwik.builder.io/contact');
  equal(getPrefetchDataset(props, clientNavPath, currentLoc), null);
});

test.run();
