import { join } from 'node:path';
import { build } from 'vite';
import { minifyClientScript } from './submodule-qwikloader.ts';
import { readFile, writeFile, type BuildConfig } from './util.ts';

export async function submoduleInsights(config: BuildConfig) {
  await buildComponents(config);
  await buildVite(config);
  await buildPinger(config);
  await buildCollector(config);

  console.log(`📈 insights`);
}

/** Server-only collector that writes beacons into a local libSQL file (uses node:sqlite). */
async function buildCollector(config: BuildConfig) {
  await build({
    build: {
      lib: {
        entry: join(config.srcQwikDir, 'insights', 'collector', 'index.ts'),
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
      outDir: join(config.distQwikPkgDir, 'insights', 'collector'),
      emptyOutDir: false,
      target: 'es2022',
      minify: false,
      rollupOptions: {
        external: (id) => /^(@|node:)/i.test(id),
      },
    },
  });
}

/** Standalone browser chunk the inline gate lazily imports to drain buffered symbols and track. */
async function buildPinger(config: BuildConfig) {
  await build({
    configFile: false,
    build: {
      lib: {
        entry: join(config.srcQwikDir, 'insights', 'insights-pinger.ts'),
        formats: ['es'],
        fileName: () => 'insights-pinger.js',
      },
      outDir: config.distQwikPkgDir,
      emptyOutDir: false,
      target: 'es2020',
      minify: false,
    },
  });

  // vite lib mode doesn't minify reliably here; terser it like the qwikloader (keeps the ESM exports).
  const file = join(config.distQwikPkgDir, 'insights-pinger.js');
  const minified = await minifyClientScript(await readFile(file, 'utf-8'));
  await writeFile(file, minified.code || '');
}

async function buildComponents(config: BuildConfig) {
  const entryPoint = join(config.srcQwikDir, 'insights', 'index.ts');
  const distBase = join(config.distQwikPkgDir, 'insights');

  await build({
    build: {
      lib: {
        entry: entryPoint,
        formats: ['es'],
        fileName: () => 'index.qwik.mjs',
      },
      outDir: distBase,
      emptyOutDir: false,
      target: 'es2022',
      minify: false,
      rollupOptions: {
        external: (id) => /^(@|node:)/i.test(id),
      },
    },
  });
}

async function buildVite(config: BuildConfig) {
  const entryPoint = join(config.srcQwikDir, 'insights', 'vite', 'index.ts');
  const distBase = join(config.distQwikPkgDir, 'insights', 'vite');

  await build({
    build: {
      lib: {
        entry: entryPoint,
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
      outDir: distBase,
      emptyOutDir: false,
      rollupOptions: {
        external: (id) => /^(@|node:)/i.test(id),
      },
    },
  });
}
