import { normalizeUrl } from './utils';

describe('normalizeUrl', () => {
  it('no url', () => {
    expect(normalizeUrl(null).href).toBe('http://document.qwik.dev/');
    expect(normalizeUrl(undefined).href).toBe('http://document.qwik.dev/');
    expect(normalizeUrl('').href).toBe('http://document.qwik.dev/');
    expect(normalizeUrl({} as any).href).toBe('http://document.qwik.dev/');
  });

  it('string, full url', () => {
    const url = normalizeUrl('https://my.qwik.dev/some-path?query=string#hash');
    expect(url.pathname).toBe('/some-path');
    expect(url.hash).toBe('#hash');
    expect(url.searchParams.get('query')).toBe('string');
    expect(url.origin).toBe('https://my.qwik.dev');
    expect(url.href).toBe('https://my.qwik.dev/some-path?query=string#hash');
  });

  it('string, pathname', () => {
    const url = normalizeUrl('/some-path?query=string#hash');
    expect(url.pathname).toBe('/some-path');
    expect(url.hash).toBe('#hash');
    expect(url.searchParams.get('query')).toBe('string');
    expect(url.origin).toBe('http://document.qwik.dev');
    expect(url.href).toBe('http://document.qwik.dev/some-path?query=string#hash');
  });
});
