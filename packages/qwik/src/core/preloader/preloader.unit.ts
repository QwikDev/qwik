import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { createDocument } from '@qwik.dev/core/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

let outDir: string | undefined;
let preloaderCode: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'qwik-preloader-'));
  const buildScript = new URL('../../../../../scripts/submodule-preloader.ts', import.meta.url);
  const { submodulePreloader } = await import(buildScript.href);
  await submodulePreloader({
    srcQwikDir: fileURLToPath(new URL('../../', import.meta.url)),
    distVersion: 'test',
    distQwikPkgDir: outDir,
  });
  preloaderCode = await readFile(join(outDir, 'preloader.mjs'), 'utf8');
});

afterAll(async () => {
  if (outDir) {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('runs independently of core and replays buffered hints', async () => {
  const { code } = await transform(preloaderCode, { format: 'cjs' });
  try {
    vi.useFakeTimers();
    const document = createDocument();
    const module = { exports: {} as typeof import('./index') };
    const context = {
      module,
      __qwik__: undefined,
      document,
      URL,
      setTimeout,
      performance: { now: () => 0 },
      qPreloadQueue: [['route/', 1]],
      qPreload: undefined as undefined | typeof module.exports.p,
      require: (id: string) => {
        expect(id).toBe('@qwik.dev/core/build');
        return { isServer: false };
      },
    };
    runInNewContext(code, context);
    expect(context.__qwik__).toBeUndefined();
    expect(context.qPreload).toBe(module.exports.p);
    expect(typeof module.exports.g).toBe('function');
    expect(context.qPreloadQueue).toBeUndefined();
    module.exports.l(
      '/build/',
      Promise.resolve(
        new Response(
          JSON.stringify(['route/', 2, 'route.js', 4, 'component.js', 6, 'static.js', 'event.js'])
        )
      ),
      { P: 1 }
    );
    await vi.runAllTimersAsync();
    const paths = () =>
      Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname);
    expect(paths()).toEqual(['/build/route.js', '/build/component.js', '/build/static.js']);
    context.qPreload!('event.js', 1);
    await vi.runAllTimersAsync();
    expect(paths()).toEqual([
      '/build/route.js',
      '/build/component.js',
      '/build/static.js',
      '/build/event.js',
    ]);
  } finally {
    vi.useRealTimers();
  }
});
