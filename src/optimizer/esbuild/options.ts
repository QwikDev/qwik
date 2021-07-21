import type { Optimizer } from '../types';
import type { BuildOptions } from 'esbuild';
import { clientEsbuildPlugin, serverEsbuildPlugin } from './plugins';

/**
 * @alpha
 */
export async function createClientEsbuildOptions(optimizer: Optimizer): Promise<any> {
  await optimizer.getTsconfig();

  const clientBuildOpts: BuildOptions = {
    entryPoints: optimizer.getEntryInputs({ platform: 'client' }),
    outdir: optimizer.getRootDir(),
    plugins: [clientEsbuildPlugin(optimizer)],
    format: 'esm',
    bundle: true,
    splitting: true,
    incremental: true,
    write: false,
  };

  if (optimizer.isDev()) {
    clientBuildOpts.sourcemap = 'inline';
  } else {
    clientBuildOpts.sourcemap = 'external';
    clientBuildOpts.minify = true;
    clientBuildOpts.define = {
      qDev: false as any,
    };
  }

  return clientBuildOpts;
}

/**
 * @alpha
 */
export async function createServerEsbuildOptions(optimizer: Optimizer): Promise<any> {
  await optimizer.getTsconfig();

  const serverBuildOpts: BuildOptions = {
    entryPoints: optimizer.getEntryInputs({ platform: 'server' }),
    outdir: optimizer.getRootDir(),
    plugins: [serverEsbuildPlugin(optimizer)],
    format: 'cjs',
    platform: 'node',
    target: 'node10',
    incremental: true,
    write: false,
    sourcemap: 'external',
  };

  return serverBuildOpts;
}
