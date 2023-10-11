import { normalizeUrl } from './util';
import { assert, test } from 'vitest';

test('no url', () => {
  assert.equal(normalizeUrl(null).href, 'http://document.qwik.dev/');
  assert.equal(normalizeUrl(undefined).href, 'http://document.qwik.dev/');
  assert.equal(normalizeUrl('').href, 'http://document.qwik.dev/');
  assert.equal(normalizeUrl({} as any).href, 'http://document.qwik.dev/');
});

test('string, full url', () => {
  const url = normalizeUrl('https://my.qwik.dev/some-path?query=string#hash');
  assert.equal(url.pathname, '/some-path');
  assert.equal(url.hash, '#hash');
  assert.equal(url.searchParams.get('query'), 'string');
  assert.equal(url.origin, 'https://my.qwik.dev');
  assert.equal(url.href, 'https://my.qwik.dev/some-path?query=string#hash');
});

test('string, pathname', () => {
  const url = normalizeUrl('/some-path?query=string#hash');
  assert.equal(url.pathname, '/some-path');
  assert.equal(url.hash, '#hash');
  assert.equal(url.searchParams.get('query'), 'string');
  assert.equal(url.origin, 'http://document.qwik.dev');
  assert.equal(url.href, 'http://document.qwik.dev/some-path?query=string#hash');
});
