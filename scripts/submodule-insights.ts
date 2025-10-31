import { join } from 'node:path';
import { build } from 'vite';
import { type BuildConfig } from './util';

export async function submoduleInsights(config: BuildConfig) {
  await buildComponents(config);
  await buildVite(config);

  console.log(`📈 insights`);
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
      minify: true,
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
