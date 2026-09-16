import { describe, expect, test } from 'vitest';
import type { QwikManifest } from '@qwik.dev/core/optimizer';
import { replResolver, replWorkerQrlChunks } from './rolldown-plugins';

test.each(['client', 'ssr'] as const)(
  'resolves async local storage to the browser module for REPL %s',
  (target) => {
    const plugin = replResolver(
      {
        '@builder.io/qwik': {
          version: 'bundled',
          '/dist/async-local-storage.mjs': '/assets/async-local-storage.mjs',
        },
      },
      { srcInputs: [], buildMode: 'development', replId: 'test' },
      target
    );
    if (typeof plugin.resolveId !== 'function') {
      throw new Error('Expected resolveId hook');
    }
    expect(
      plugin.resolveId.call(
        {} as any,
        '@qwik.dev/core/async-local-storage',
        '/qwik/dist/core.mjs',
        {} as any
      )
    ).toEqual({ id: '/qwik/dist/async-local-storage.mjs', sideEffects: false });
  }
);

describe('repl worker qrl chunk rewrites', () => {
  test('rewrites worker qrl placeholders to repl client bundle paths', () => {
    const manifest = {
      manifestHash: 'hash',
      version: '1',
      mapping: {
        incrementInWorker_worker_nQ0IoPmz43I: 'build/app-q-worker.js',
      },
      symbols: {
        incrementInWorker_worker_nQ0IoPmz43I: {
          canonicalFilename: 'app.tsx_incrementInWorker_worker_nQ0IoPmz43I',
          origin: 'app.tsx',
          displayName: 'incrementInWorker',
          hash: 'nQ0IoPmz43I',
          ctxKind: 'function',
          ctxName: 'worker$',
          captures: false,
          parent: null,
          loc: [0, 0],
        },
      },
      bundles: {},
    } satisfies QwikManifest;

    const bundle = {
      'build/event.js': {
        type: 'chunk',
        code:
          'const chunk = ' +
          '"__QWIK_WORKER_QRL__:./app.tsx_incrementInWorker_worker_nQ0IoPmz43I.js";',
      },
    };

    const plugin = replWorkerQrlChunks(() => manifest);
    if (typeof plugin.generateBundle !== 'function') {
      throw new Error('Expected generateBundle hook');
    }
    plugin.generateBundle.call({} as any, {} as any, bundle as any, false);

    expect(bundle['build/event.js'].code).toBe(
      'const chunk = "/docs/src/repl/bundler/app.tsx_incrementInWorker_worker_nQ0IoPmz43I.js?worker_file&type=module";'
    );
  });
});
