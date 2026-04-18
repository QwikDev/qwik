import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { build, type Plugin } from 'vite';
import { writeSubmodulePackageJson } from './package-json.ts';
import { copyFile, emptyDir, type BuildConfig } from './util.ts';

/** Builds @qwik.dev/core/worker */
export async function submoduleWorker(config: BuildConfig) {
  const submodule = 'worker';
  const srcDir = join(config.srcQwikDir, 'web-worker');
  const distDir = join(config.distQwikPkgDir, submodule);
  const rootDir = join(config.packagesDir, 'qwik');
  const optimizerPath = pathToFileURL(join(config.distQwikPkgDir, 'optimizer.mjs')).href;
  const { qwikVite } = (await import(optimizerPath)) as typeof import('../packages/qwik-vite/src');

  emptyDir(distDir);

  await build({
    clearScreen: false,
    mode: 'lib',
    root: rootDir,
    build: {
      emptyOutDir: false,
      minify: false,
      outDir: distDir,
      target: 'es2022',
      lib: {
        entry: join(srcDir, 'index.ts'),
        formats: ['es'],
        fileName: () => 'index.qwik.mjs',
      },
      rollupOptions: {
        external: (id) =>
          /^@qwik\.dev\/core(?:\/|$)/.test(id) ||
          id === './worker.js?worker&url' ||
          id === './worker.node.js?worker&url' ||
          id === 'node:worker_threads',
      },
    },
    plugins: [preserveWorkerImports(), qwikVite({ srcDir: 'src/web-worker' })],
  });

  rmSync(join(distDir, 'assets'), { recursive: true, force: true });
  rmSync(join(distDir, 'q-manifest.json'), { force: true });
  await copyFile(join(srcDir, 'worker.js'), join(distDir, 'worker.js'));
  await copyFile(join(srcDir, 'worker.node.js'), join(distDir, 'worker.node.js'));
  await copyFile(join(srcDir, 'worker.shared.js'), join(distDir, 'worker.shared.js'));
  await writeSubmodulePackageJson(distDir, '@qwik.dev/core/worker', config.distVersion, {
    main: 'index.qwik.mjs',
    qwik: 'index.qwik.mjs',
  });

  console.log('🧵', submodule);
}

function preserveWorkerImports(): Plugin {
  return {
    name: 'preserve-worker-imports',
    enforce: 'pre',
    resolveId(id) {
      if (id === './worker.js?worker&url' || id === './worker.node.js?worker&url') {
        return {
          id,
          external: true,
        };
      }
      return null;
    },
  };
}
