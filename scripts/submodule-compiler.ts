import { join } from 'node:path';
import { build as viteBuild } from 'vite';
import type { BuildConfig } from './util.ts';

/** Builds @qwik.dev/compiler. */
export async function submoduleCompiler(config: BuildConfig) {
  await viteBuild({
    root: config.compilerPkgDir,
    configFile: join(config.compilerPkgDir, 'vite.config.ts'),
    mode: config.dev ? 'development' : 'production',
  });

  console.log('🧩 compiler');
}
