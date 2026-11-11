import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { rolldown } from 'rolldown';
import { expect, test } from 'vitest';
import { createQwikPlugin } from './plugin';
import { qwikRolldown } from './rolldown';
import { normalizePath } from '../../../qwik/src/testing/util';

const renderConsumers = {
  hook: 'hooked',
  tag: '<Read />',
  alias: '<View />',
  getter: `_jsxSorted('button', null, {get 'q-e:click'() {Read(); return Read;}}, 'getter', 3, null)`,
};
const fixture = (
  consumer: keyof typeof renderConsumers
) => `import { $, component$, useSignal, _jsxSorted } from '@qwik.dev/core';
import { clientFeature } from './client-feature';
function invoke(callback) { return callback(); }
function useCustomHook(callback) { return invoke(callback); }
export const Probe = component$(() => {
  const count = useSignal(0);
  const click = $(() => { console.log('FUTURE_QRL'); clientFeature(count.value); });
  const alias = click;
  const Read = $(() => <span>RENDER_QRL{count.value}</span>);
  ${consumer === 'alias' ? 'const View = Read;' : ''}
  ${consumer === 'hook' ? 'const hooked = useCustomHook(Read);' : ''}
  return <><button onClick$={(alias)}>RENDER_VIEW</button><button onClick$={Read}>mixed</button>{${renderConsumers[consumer]}}</>;
});`;

test.each(
  [true, false].flatMap((tsOptimizer) =>
    [false, true].flatMap((library) =>
      [false, true].flatMap((minify) =>
        (Object.keys(renderConsumers) as Array<keyof typeof renderConsumers>).map((consumer) => ({
          tsOptimizer,
          library,
          minify,
          consumer,
        }))
      )
    )
  )
)(
  'smart isolates event-only references without a render waterfall ($tsOptimizer, library=$library, minify=$minify, consumer=$consumer)',
  async ({ tsOptimizer, library, minify, consumer }) => {
    const chunks = library
      ? await buildLinkedLibraryApp(fixture(consumer), minify)
      : await buildApp(fixture(consumer), tsOptimizer, minify);
    const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const chunkWith = (marker: string) => chunks.find((chunk) => chunk.code.includes(marker));
    const render = chunkWith('RENDER_VIEW')!;
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) {
        return;
      }
      seen.add(file);
      const chunk = byName.get(file)!;
      expect(chunk.code).not.toContain('HEAVY_INTERACTION');
      expect(chunk.code).not.toContain('FUTURE_QRL');
      chunk.imports.filter((file) => byName.has(file)).forEach(visit);
    };
    visit(render.fileName);
    expect([...seen]).toContain(chunkWith('RENDER_QRL')!.fileName);
    expect(chunkWith('FUTURE_QRL')).toBeDefined();
    expect(chunkWith('HEAVY_INTERACTION')).toBeDefined();
  }
);

/** The application's own source, split by the plugin and bundled with its code splitting. */
async function buildApp(source: string, tsOptimizer: boolean, minify: boolean) {
  const root = normalizePath(resolve(process.cwd(), 'event-qrl-fixture'));
  const srcDir = root + '/src';
  const featureId = srcDir + '/client-feature';
  const plugin = createQwikPlugin({ tsOptimizer });
  await plugin.init();
  await plugin.normalizeOptions({
    target: 'client',
    buildMode: 'production',
    entryStrategy: { type: 'smart' },
    rootDir: root,
    srcDir,
  });
  const parent = srcDir + '/app.tsx';
  const transformed = await plugin.transform(
    { addWatchFile() {}, emitFile() {} } as any,
    source,
    parent
  );
  const modules = new Map<string, any>([[parent, transformed]]);
  for (const id of transformed!.meta!.qwikdeps) {
    modules.set(id, await plugin.load({} as any, id));
  }
  const build = await rolldown({
    input: [...modules.keys()],
    external: (id) => id.startsWith('@qwik.dev/'),
    preserveEntrySignatures: 'allow-extension',
    plugins: [
      {
        name: 'event-qrl-fixture',
        resolveId(id, importer) {
          const resolved = normalizePath(id.startsWith('.') ? resolve(dirname(importer!), id) : id);
          return modules.has(resolved) || resolved === featureId ? resolved : null;
        },
        load(id) {
          return id === featureId
            ? 'exports.clientFeature = () => "HEAVY_INTERACTION";'
            : modules.get(id);
        },
      },
    ],
  });
  try {
    const generated = await build.generate({
      format: 'es',
      minify,
      codeSplitting: { ...plugin.codeSplitting(), includeDependenciesRecursively: false },
    });
    return generated.output.filter((chunk) => chunk.type === 'chunk');
  } finally {
    await build.close();
  }
}

/** A published library: the application links it from its plan, as it links the router. */
async function buildLinkedLibraryApp(source: string, minify: boolean) {
  const directory = normalizePath(await mkdtemp(join(tmpdir(), 'qwik-event-qrls-')));
  try {
    await writeFile(join(directory, 'library.tsx'), source);
    await writeFile(
      join(directory, 'client-feature.ts'),
      'export const clientFeature = () => "HEAVY_INTERACTION";'
    );
    await writeFile(
      join(directory, 'app.tsx'),
      `import { component$ } from '@qwik.dev/core';
import { Probe } from './lib/library.js';
export default component$(() => <Probe />);`
    );
    const bundle = async (input: string, target: 'lib' | 'client') =>
      rolldown({
        input: join(directory, input),
        external: (id) => id === '@qwik.dev/core',
        plugins: [
          qwikRolldown({
            target,
            buildMode: 'production',
            entryStrategy: { type: 'smart' },
            rootDir: directory,
            srcDir: directory,
          }),
        ],
      });
    const libraryBuild = await bundle('library.tsx', 'lib');
    try {
      await libraryBuild.write({ dir: join(directory, 'lib'), format: 'es' });
    } finally {
      await libraryBuild.close();
    }
    const appBuild = await bundle('app.tsx', 'client');
    try {
      const generated = await appBuild.generate({ format: 'es', minify });
      return generated.output.filter((chunk) => chunk.type === 'chunk');
    } finally {
      await appBuild.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
