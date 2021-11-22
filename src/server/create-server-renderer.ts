import type { CreateRenderToStringOptions, RenderToString } from './types';
import { createQrlMapper } from './qrl-mapper';
import { isAbsolute, resolve } from 'path';
import { stat } from './utils';

/**
 * Utility to load the app's server render function.
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

  const clientDir = opts.clientDir;
  if (!isAbsolute(clientDir)) {
    throw new Error(`clientDir "${clientDir}" must be an absolute path`);
  }

  const clientDirStat = await stat(clientDir);
  if (!clientDirStat.isDirectory()) {
    throw new Error(`clientDir "${clientDir}" must be a directory`);
  }

  const serverRenderPath = resolve(serverDir, opts.serverRenderPath);
  const userServerModule = await import(serverRenderPath);
  const userRenderToString: RenderToString = userServerModule.default;

  const clientEntryMapPath = resolve(clientDir, opts.clientEntryMapPath || 'q-entry-map.json');
  const qrlMapper = await createQrlMapper(clientEntryMapPath);

  const renderToString: RenderToString = (renderOpts) => {
    return userRenderToString({
      serverDir,
      qrlMapper,
      ...renderOpts,
    });
  };

  return renderToString;
}
