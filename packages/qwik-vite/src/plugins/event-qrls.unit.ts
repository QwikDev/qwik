import { resolve, dirname } from 'node:path';
import { expect, test } from 'vitest';
import { createQwikPlugin } from './plugin';
import { normalizePath } from '../../../qwik/src/testing/util';

const renderConsumers = {
  hook: 'useCustomHook(Read)',
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
    let source = fixture(consumer);
    if (library) {
      const compiled = await plugin.getOptimizer().transformModules({
        input: [{ path: 'library.tsx', code: source }],
        srcDir: '/',
        rootDir: '/',
        entryStrategy: { type: 'hoist' },
        mode: 'lib',
        transpileTs: true,
        transpileJsx: true,
        isServer: false,
      });
      expect(compiled.diagnostics.filter((diagnostic) => diagnostic.category === 'error')).toEqual(
        []
      );
      source = compiled.modules.map((module) => module.code).join('\n');
    }
    const parent = srcDir + (library ? '/library.qwik.mjs' : '/app.tsx');
    const transformed = await plugin.transform(
      { addWatchFile() {}, emitFile() {} } as any,
      source,
      parent
    );
    const modules = new Map<string, any>([[parent, transformed]]);
    for (const id of transformed!.meta!.qwikdeps) {
      modules.set(id, await plugin.load({} as any, id));
    }
    const renderId = [...modules].find(
      ([, module]) => module?.meta?.segment && module.code.includes('RENDER_VIEW')
    )![0];
    const readId = [...modules].find(
      ([, module]) => module?.meta?.segment && module.code.includes('RENDER_QRL')
    )![0];
    const clickId = [...modules].find(
      ([, module]) => module?.meta?.segment && module.code.includes('FUTURE_QRL')
    )![0];
    const { rolldown } = await import('rolldown');
    const build = await rolldown({
      input: [...modules.keys()],
      external: (id) => id.startsWith('@qwik.dev/'),
      preserveEntrySignatures: 'allow-extension',
      plugins: [
        {
          name: 'event-qrl-fixture',
          resolveId(id, importer) {
            const resolved = normalizePath(
              id.startsWith('.') ? resolve(dirname(importer!), id) : id
            );
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
      const chunks = generated.output.filter((chunk) => chunk.type === 'chunk');
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const render = chunks.find((chunk) => renderId in chunk.modules)!;
      const seen = new Set<string>();
      const visit = (file: string) => {
        if (seen.has(file)) {
          return;
        }
        seen.add(file);
        const chunk = byName.get(file)!;
        expect(Object.keys(chunk.modules)).not.toContain(featureId);
        expect(Object.keys(chunk.modules)).not.toContain(clickId);
        chunk.imports.filter((file) => byName.has(file)).forEach(visit);
      };
      visit(render.fileName);
      expect([...seen].some((file) => readId in byName.get(file)!.modules)).toBe(true);
      expect(chunks.some((chunk) => clickId in chunk.modules)).toBe(true);
      expect(chunks.some((chunk) => chunk.code.includes('HEAVY_INTERACTION'))).toBe(true);
    } finally {
      await build.close();
    }
  }
);
