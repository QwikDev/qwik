import { describe, expect, test } from 'vitest';
import type { QwikManifest } from '@qwik.dev/core/optimizer';
import { replWorkerQrlChunks } from './rollup-plugins';

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
