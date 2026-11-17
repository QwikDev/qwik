import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';
import { createQwikPlugin } from './plugin';
import { normalizeRolldownOutputObject } from './rolldown';

// Loads a QRL whether the bundler resolves it to the module or straight to the symbol.
const coreStub = `
const loadQrl = async ({ load, symbol }) => {
  const loaded = await load();
  return loaded && typeof loaded === 'object' && symbol in loaded ? loaded[symbol] : loaded;
};
export const componentQrl = (renderQrl) => ({ render: () => loadQrl(renderQrl) });
export const useStylesQrl = (stylesQrl) => { globalThis.stylesQrl = stylesQrl; };
export const loadStyles = () => loadQrl(globalThis.stylesQrl);
export const qrl = (load, symbol) => ({ load, symbol });
export const _jsxSorted = () => null;
`;

test.each(
  [true, false].flatMap((tsOptimizer) =>
    ['styles', '`${styles}`'].map((stylesExpression) => ({ tsOptimizer, stylesExpression }))
  )
)(
  'a useStyles$ qrl resolves to the imported styles (TS=$tsOptimizer, $stylesExpression)',
  async ({ tsOptimizer, stylesExpression }) => {
    const root = normalizePath(resolve(process.cwd(), 'use-styles-fixture'));
    const componentId = root + '/component.tsx';
    const stylesId = root + '/styles.js';
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
    const transformed = await plugin.transform(
      { addWatchFile() {}, emitFile() {} } as any,
      `import { component$, useStyles$ } from '@qwik.dev/core';
import styles from './styles.js';
export const App = component$(() => {
  useStyles$(${stylesExpression});
  return <div />;
});`,
      componentId
    );
    const modules = new Map<string, any>([
      [
        entryId,
        {
          code: `export { App } from '${componentId}';\nexport { loadStyles } from '@qwik.dev/core';`,
        },
      ],
      [componentId, transformed],
      [stylesId, { code: `export default 'STYLES_TEXT';` }],
      ['@qwik.dev/core', { code: coreStub }],
    ]);
    for (const id of transformed!.meta!.qwikdeps) {
      modules.set(id, await plugin.load({} as any, id));
    }
    const { rolldown } = await import('rolldown');
    const build = await rolldown({
      input: [entryId],
      preserveEntrySignatures: 'allow-extension',
      plugins: [
        {
          name: 'use-styles-fixture',
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
    const outDir = mkdtempSync(join(tmpdir(), 'use-styles-'));
    try {
      const { output } = await build.write(normalizeRolldownOutputObject(plugin, {}, outDir));
      const entryChunk = output.find(
        (file) => file.type === 'chunk' && file.facadeModuleId === entryId
      )!;
      const stylesSegmentId = transformed!.meta!.qwikdeps.find(
        (id: string) => modules.get(id).meta.segment.ctxName === 'useStyles$'
      )!;
      // The qrl imports the segment's facade chunk when it has one.
      const stylesChunk =
        output.find((file) => file.type === 'chunk' && file.facadeModuleId === stylesSegmentId) ??
        output.find((file) => file.type === 'chunk' && stylesSegmentId in file.modules)!;
      const toUrl = (fileName: string) =>
        JSON.stringify(pathToFileURL(join(outDir, fileName)).href);
      // A plain Node process runs the chunks in real ES module order, unlike vitest's loader.
      const styles = execFileSync(process.execPath, [
        '--input-type=module',
        '-e',
        // Resolving the styles qrl before anything else is what exposes the chunk cycle.
        `await import(${toUrl(stylesChunk.fileName)});
         const { App, loadStyles } = await import(${toUrl(entryChunk.fileName)});
         (await App.render())();
         console.log(String(await loadStyles()));`,
      ])
        .toString()
        .trim();
      expect(styles).toBe('STYLES_TEXT');
    } finally {
      await build.close();
      rmSync(outDir, { recursive: true, force: true });
    }
  }
);
