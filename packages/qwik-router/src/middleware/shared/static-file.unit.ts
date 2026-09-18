import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStaticFilePath } from './static-file';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStaticFilePath', () => {
  it.each([
    { base: undefined, request: '/hello.txt', file: '/hello.txt' },
    { base: '/', request: '/guide/', file: '/guide/index.html' },
    { base: '/', request: '/blog/v1.2/', file: '/blog/v1.2/index.html' },
    { base: '/docs/', request: '/docs/hello.txt', file: '/hello.txt' },
    { base: '/docs/v2/', request: '/docs/v2/hello.txt', file: '/hello.txt' },
    { base: '/docs/', request: '/docs/build/q-abc.js', file: '/build/q-abc.js' },
    { base: '/docs/', request: '/docs/guide/', file: '/guide/index.html' },
    { base: '/docs/', request: '/docs/guide', file: '/guide/index.html' },
    { base: '/docs/', request: '/docs/', file: '/index.html' },
    { base: '/docs/', request: '/docs', file: '/index.html' },
    { base: '/docs/', request: '/docs/%2e%2e%2fsecret', file: '/%2e%2e%2fsecret/index.html' },
    { base: '/docs/', request: '/docstore/hello.txt', file: undefined },
  ])('maps $request under base $base to $file', ({ base, request, file }) => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', base);
    expect(getStaticFilePath(request)).toBe(file);
  });
});
