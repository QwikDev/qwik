import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isStaticPath, staticPaths } from '../request-handler/static-paths';

vi.mock('@qwik.dev/router/middleware/request-handler', async () => ({
  isStaticPath: (await import('../request-handler/static-paths')).isStaticPath,
  requestHandler: vi.fn(),
  mergeHeadersCookies: vi.fn(),
  _TextEncoderStream_polyfill: globalThis.TextEncoderStream,
}));

vi.mock('https://deno.land/std/path/mod.ts', async () => ({
  ...(await import('node:path')),
  fromFileUrl: (await import('node:url')).fileURLToPath,
}));

import { createQwikRouter } from './index';

const cases = [
  { base: '/', pathname: '/a.txt', staticPath: '/a.txt', file: 'a.txt', noTrailingSlash: false },
  {
    base: '/documentation/',
    pathname: '/documentation/a.txt',
    staticPath: '/documentation/a.txt',
    file: 'a.txt',
    noTrailingSlash: false,
  },
  {
    base: '/documentation/',
    pathname: '/documentation/guide/',
    staticPath: '/documentation/guide/',
    file: 'guide/index.html',
    noTrailingSlash: false,
  },
  {
    base: '/documentation/',
    pathname: '/documentation/guide',
    staticPath: '/documentation/guide/',
    file: 'guide/index.html',
    noTrailingSlash: true,
  },
  {
    base: '/documentation/',
    pathname: '/documentation',
    staticPath: '/documentation/',
    file: 'index.html',
    noTrailingSlash: true,
  },
];

describe('deno staticFile base paths', () => {
  let staticRoot: string;
  let openFile: ReturnType<typeof vi.fn>;
  const configuredPaths = new Set<string>();

  beforeEach(async () => {
    staticRoot = await mkdtemp(join(tmpdir(), 'qwik-deno-static-base-'));
    await Promise.all(
      ['guide', 'build', 'assets'].map((directory) => mkdir(join(staticRoot, directory)))
    );
    await Promise.all([
      writeFile(join(staticRoot, 'a.txt'), 'asset content'),
      writeFile(join(staticRoot, 'guide/index.html'), '<p>guide</p>'),
      writeFile(join(staticRoot, 'index.html'), '<p>home</p>'),
      writeFile(join(staticRoot, 'build/a.js'), 'export const value = 1;'),
      writeFile(join(staticRoot, 'assets/a.js'), 'export const value = 1;'),
    ]);
    openFile = vi.fn(async (filePath: string) => ({
      readable: new Blob([await readFile(filePath)]).stream(),
    }));
    vi.stubGlobal('Deno', { env: { get: () => undefined }, open: openFile });
  });

  afterEach(async () => {
    for (const pathname of configuredPaths) {
      staticPaths.delete(pathname);
    }
    configuredPaths.clear();
    vi.unstubAllGlobals();
    await rm(staticRoot, { recursive: true, force: true });
  });

  it.each(cases)(
    'serves $pathname from the static root',
    async ({ base, pathname, staticPath, file, noTrailingSlash }) => {
      vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', base);
      vi.stubGlobal('__NO_TRAILING_SLASH__', noTrailingSlash);
      configuredPaths.add(staticPath);
      staticPaths.add(staticPath);
      const url = new URL(pathname, 'http://localhost:3301');
      expect(isStaticPath('GET', url)).toBe(true);
      const middleware = createQwikRouter({
        render: vi.fn(),
        static: { root: staticRoot },
      });

      const response = await middleware.staticFile(new Request(url));

      expect(response?.status).toBe(200);
      expect(await response?.text()).toBe(await readFile(join(staticRoot, file), 'utf8'));
      expect(response?.headers.get('content-type')).toContain(
        file.endsWith('.html') ? 'text/html' : 'text/plain'
      );
    }
  );

  it.each(['build', 'assets'])(
    'serves unlisted %s resources beneath the base',
    async (directory) => {
      vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/documentation/');
      const pathname = '/documentation/' + directory + '/a.js';
      expect(staticPaths.has(pathname)).toBe(false);
      const middleware = createQwikRouter({ render: vi.fn(), static: { root: staticRoot } });

      const response = await middleware.staticFile(new Request('http://localhost:3301' + pathname));

      expect(response?.status).toBe(200);
      expect(await response?.text()).toBe('export const value = 1;');
      expect(response?.headers.get('content-type')).toContain('javascript');
    }
  );

  it('ignores a static path outside the configured base', async () => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    const pathname = '/docs-extra/a.txt';
    configuredPaths.add(pathname);
    staticPaths.add(pathname);
    const middleware = createQwikRouter({ render: vi.fn(), static: { root: staticRoot } });

    expect(await middleware.staticFile(new Request('http://localhost:3301' + pathname))).toBeNull();
    expect(openFile).not.toHaveBeenCalled();
  });

  it('does not open a file that is absent from the static path list', async () => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    const middleware = createQwikRouter({ render: vi.fn(), static: { root: staticRoot } });

    expect(
      await middleware.staticFile(new Request('http://localhost:3301/docs/private.txt'))
    ).toBeNull();
    expect(openFile).not.toHaveBeenCalled();
  });
});
