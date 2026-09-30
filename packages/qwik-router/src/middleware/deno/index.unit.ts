import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { staticPaths } from '../request-handler/static-paths';

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

describe('createQwikRouter().staticFile', () => {
  afterEach(() => {
    staticPaths.delete('/docs/hello.txt');
    vi.unstubAllGlobals();
  });

  it('opens static files without the base', async () => {
    const open = vi.fn(async () => ({ readable: new Blob(['hello']).stream() }));
    vi.stubGlobal('Deno', { env: { get: () => undefined }, open });
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    staticPaths.add('/docs/hello.txt');
    const { staticFile } = createQwikRouter({ render: vi.fn(), static: { root: '/dist' } });

    await staticFile(new Request('http://localhost/docs/hello.txt'));

    expect(open).toHaveBeenCalledWith(join('/dist', 'hello.txt'), { read: true });
  });
});
