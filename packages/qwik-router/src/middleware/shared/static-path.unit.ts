import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStaticFilePathname } from './static-path';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStaticFilePathname', () => {
  const cases: Array<[string | undefined, string, string | undefined]> = [
    [undefined, '/hello.txt', '/hello.txt'],
    ['', '/hello.txt', '/hello.txt'],
    ['/', '/docs/hello.txt', '/docs/hello.txt'],
    ['/docs/', '/docs/hello.txt', '/hello.txt'],
    ['/docs/', '/docs/', '/'],
    ['/docs/', '/docs', '/'],
    ['/docs/v2/', '/docs/v2/hello.txt', '/hello.txt'],
    ['/docs/', '/docs/docs/hello.txt', '/docs/hello.txt'],
    ['/docs/', '/docs/%2e%2e%2fprivate', '/%2e%2e%2fprivate'],
    ['/docs/', '/docstore/hello.txt', undefined],
    ['/docs/', '/docs-other/hello.txt', undefined],
    ['/docs/', '/elsewhere/docs/hello.txt', undefined],
  ];

  it.each(cases)('resolves %s %s within the static root', (basePathname, pathname, expected) => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', basePathname);
    expect(getStaticFilePathname(pathname)).toBe(expected);
  });
});
