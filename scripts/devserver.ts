import { build } from 'esbuild';
import { join } from 'path';
import { BuildConfig, importPath, watcher } from './util';

/**
 * Generate the internal integration dev server cjs module.
 */
export async function buildDevServer(config: BuildConfig) {
  const integrationDir = join(config.rootDir, 'integration');

  const r = await build({
    entryPoints: [join(integrationDir, 'devserver.ts')],
    outdir: integrationDir,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    sourcemap: 'external',
    watch: watcher(config),
    external: ['esbuild', 'express', 'mri', 'source-map-support'],
    plugins: [importPath(/^@builder\.io\/qwik\/optimizer$/, join(config.pkgDir, 'optimizer.cjs'))],
  });
}
