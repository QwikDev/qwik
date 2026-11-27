import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import type { OutputChunk } from 'rolldown';
import { expect, test } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';
import type { SegmentAnalysis } from '../types';
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
export const useVisibleTaskQrl = () => {};
export const loadStyles = () => loadQrl(globalThis.stylesQrl);
export const qrl = (load, symbol) => ({ load, symbol });
export const _jsxSorted = () => null;
`;

const root = normalizePath(resolve(process.cwd(), 'segment-chunking-fixture'));
const componentId = root + '/component.tsx';
const entryId = root + '/entry.js';

type BundledFixture = {
  outDir: string;
  chunks: OutputChunk[];
  /** Segment module id and analysis, per segment of the component. */
  segments: [id: string, segment: SegmentAnalysis][];
};

/** Bundles a component for the client like a production build and hands over the chunks. */
const withBundledFixture = async (
  fixture: {
    tsOptimizer: boolean;
    component: string;
    entry: string;
    /** Other modules of the app, by file name. */
    files: Record<string, string>;
  },
  inspect: (bundled: BundledFixture) => void
) => {
  const plugin = createQwikPlugin({ tsOptimizer: fixture.tsOptimizer });
  await plugin.init();
  await plugin.normalizeOptions({
    target: 'client',
    buildMode: 'production',
    entryStrategy: { type: 'smart' },
    rootDir: root,
    srcDir: root,
  });
  const segmentEntries: any[] = [];
  const transformed = await plugin.transform(
    { addWatchFile() {}, emitFile: (file: any) => segmentEntries.push(file) } as any,
    fixture.component,
    componentId
  );
  const modules = new Map<string, any>([
    [entryId, { code: fixture.entry }],
    [componentId, transformed],
    ['@qwik.dev/core', { code: coreStub }],
  ]);
  for (const [fileName, code] of Object.entries(fixture.files)) {
    modules.set(`${root}/${fileName}`, { code });
  }
  for (const id of transformed!.meta!.qwikdeps) {
    modules.set(id, await plugin.load({} as any, id));
  }
  const { rolldown } = await import('rolldown');
  const build = await rolldown({
    input: [entryId],
    preserveEntrySignatures: 'allow-extension',
    plugins: [
      {
        name: 'segment-chunking-fixture',
        buildStart() {
          // The plugin emits every segment as an entry; the stub context above only records them.
          segmentEntries.forEach((file) => this.emitFile(file));
        },
        resolveId(id, importer) {
          const resolved = normalizePath(id.startsWith('.') ? resolve(dirname(importer!), id) : id);
          return modules.has(resolved) ? resolved : null;
        },
        load: (id) => modules.get(id),
      },
    ],
  });
  const outDir = mkdtempSync(join(tmpdir(), 'segment-chunking-'));
  try {
    const { output } = await build.write(normalizeRolldownOutputObject(plugin, {}, outDir));
    inspect({
      outDir,
      chunks: output.filter((file) => file.type === 'chunk'),
      segments: transformed!.meta!.qwikdeps.map((id: string) => [id, modules.get(id).meta.segment]),
    });
  } finally {
    await build.close();
    rmSync(outDir, { recursive: true, force: true });
  }
};

const optimizers = [true, false];

test.each(
  optimizers.flatMap((tsOptimizer) =>
    ['styles', '`${styles}`'].map((stylesExpression) => ({ tsOptimizer, stylesExpression }))
  )
)(
  'a useStyles$ qrl resolves to the imported styles (TS=$tsOptimizer, $stylesExpression)',
  ({ tsOptimizer, stylesExpression }) =>
    withBundledFixture(
      {
        tsOptimizer,
        component: `import { component$, useStyles$ } from '@qwik.dev/core';
import styles from './styles.js';
export const App = component$(() => {
  useStyles$(${stylesExpression});
  return <div />;
});`,
        entry: `export { App } from '${componentId}';\nexport { loadStyles } from '@qwik.dev/core';`,
        files: { 'styles.js': `export default 'STYLES_TEXT';` },
      },
      ({ outDir, chunks, segments }) => {
        const entryChunk = chunks.find((chunk) => chunk.facadeModuleId === entryId)!;
        const [stylesSegmentId] = segments.find(([, segment]) => segment.ctxName === 'useStyles$')!;
        // The qrl imports the segment's facade chunk when it has one.
        const stylesChunk =
          chunks.find((chunk) => chunk.facadeModuleId === stylesSegmentId) ??
          chunks.find((chunk) => stylesSegmentId in chunk.modules)!;
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
      }
    )
);

// The manifest and qwikloader both find a qrl by its symbol's export name.
test.each(optimizers)(
  'a qrl of a function that other chunks import is exported under its symbol name (TS=%s)',
  (tsOptimizer) =>
    withBundledFixture(
      {
        tsOptimizer,
        component: `import { component$, useVisibleTask$ } from '@qwik.dev/core';
import { track } from './analytics.js';
export const App = component$(() => {
  useVisibleTask$(track);
  useVisibleTask$(() => console.log('visible'));
  return <div />;
});`,
        // The entry imports it too, so the function lives in a chunk both share.
        entry: `export { App } from '${componentId}';\nexport { track } from './analytics.js';`,
        files: { 'analytics.js': `export const track = () => 'tracked';` },
      },
      ({ chunks, segments }) => {
        const exportNames = new Set(chunks.flatMap((chunk) => chunk.exports));
        const symbolNames = segments.map(([, segment]) => segment.name);
        expect(symbolNames.filter((name) => !exportNames.has(name))).toEqual([]);
      }
    )
);
