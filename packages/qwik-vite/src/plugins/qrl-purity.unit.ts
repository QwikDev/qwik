import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';
import { createQwikPlugin } from './plugin';

test.each(
  [true, false].flatMap((tsOptimizer) => [false, true].map((minify) => ({ tsOptimizer, minify })))
)(
  'tree shakes unused compiled QRLs and retains render calls (TS=$tsOptimizer, minify=$minify)',
  async ({ tsOptimizer, minify }) => {
    const root = normalizePath(resolve(process.cwd(), 'qrl-purity-fixture'));
    const libraryId = root + '/node_modules/library/index.qwik.mjs';
    const entryId = root + '/entry.js';
    const plugin = createQwikPlugin({ tsOptimizer });
    await plugin.init();
    await plugin.normalizeOptions({
      target: 'client',
      buildMode: 'production',
      entryStrategy: { type: 'smart' },
      rootDir: root,
      srcDir: root,
    });
    const source = readFileSync(
      new URL('../../../optimizer/core/src/fixtures/migrated-qrl-pure.js', import.meta.url),
      'utf8'
    );
    const transformed = await plugin.transform(
      { addWatchFile() {}, emitFile() {} } as any,
      source,
      libraryId
    );
    const modules = new Map<string, any>([
      [entryId, { code: `export {App} from '${libraryId}';` }],
      [libraryId, transformed],
    ]);
    for (const id of transformed!.meta!.qwikdeps) {
      modules.set(id, await plugin.load({} as any, id));
    }
    const { rolldown } = await import('rolldown');
    const build = await rolldown({
      input: [entryId],
      preserveEntrySignatures: 'allow-extension',
      external: (id) => id.startsWith('@qwik.dev/'),
      plugins: [
        {
          name: 'qrl-purity-fixture',
          resolveId(id, importer) {
            const resolved = normalizePath(
              id.startsWith('.') ? resolve(dirname(importer!), id) : id
            );
            return modules.has(resolved) ? resolved : null;
          },
          load: (id) => modules.get(id),
        },
      ],
    });
    try {
      const { output } = await build.generate({
        format: 'es',
        minify,
        codeSplitting: { ...plugin.codeSplitting(), includeDependenciesRecursively: false },
      });
      const code = output
        .filter((chunk) => chunk.type === 'chunk')
        .map((chunk) => chunk.code)
        .join('\n');
      expect(code).not.toContain('UNUSED_CALLBACK');
      expect(code).toContain('LIVE_READ');
      expect(code).toContain('KEEP_SIDE_EFFECT');
    } finally {
      await build.close();
    }
  }
);
