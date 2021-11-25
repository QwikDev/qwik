import type { CreateRenderToStringOptions, RenderToString } from './types';
import { createQrlMapper } from './qrl-mapper';
import { isAbsolute, resolve } from 'path';
import { stat } from './utils';

/**
 * Utility to load the app's server's main render function.
 * @alpha
 */
export async function createServerRenderer(opts: CreateRenderToStringOptions) {
  const serverDir = opts.serverDir;
  if (!isAbsolute(serverDir)) {
    throw new Error(`serverDir "${serverDir}" must be an absolute path`);
  }

  const serverDirStat = await stat(serverDir);
  if (!serverDirStat.isDirectory()) {
    throw new Error(`serverDir "${serverDir}" must be a directory`);
  }

  const serverMainPath = resolve(serverDir, opts.serverMainPath);
  const serverMainModule = await import(serverMainPath);
  const userRenderToString: RenderToString = serverMainModule.default;

  const symbolsPath = resolve(serverDir, opts.symbolsPath);
  const qrlMapper = await createQrlMapper(symbolsPath);

  const renderToString: RenderToString = (renderOpts) => {
    return userRenderToString({
      serverDir,
      qrlMapper,
      ...renderOpts,
    });
  };

  return renderToString;
}
