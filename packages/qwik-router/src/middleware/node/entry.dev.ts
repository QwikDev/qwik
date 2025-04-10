/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Express HTTP server in the vite environment.
 *
 */
import { platform } from 'node:process';
import type http from 'node:http';
import { basename, dirname } from 'node:path';
import type { Connect } from 'vite';
import { createQwikRouter } from '.';
import { normalizePath } from 'vite';

const isWin = platform === 'win32';
// We must encode the chunk so that e.g. + doesn't get converted to space etc
const encode = (url: string) =>
  encodeURIComponent(url).replaceAll('%2F', '/').replaceAll('%40', '@').replaceAll('%3A', ':');

// TODO move to dev file
const symbolMapper = (
  symbolName: string,
  _mapper: any,
  parent: string | undefined
): [string, string] => {
  if (symbolName === '<sync>') {
    return [symbolName, ''];
  }
  if (!parent) {
    throw new Error(
      `qwik vite-dev-server symbolMapper: parent not provided for ${symbolName}, make sure everything is built in dev mode.`
    );
  }
  // on windows, absolute paths don't start with a slash
  const maybeSlash = isWin ? '/' : '';
  const parentPath = normalizePath(dirname(parent));
  const parentFile = basename(parent);
  // TODO pass the vite rootDir via the dev server options so we get nicer paths in chrome devtools
  // const qrlPath = parentPath.startsWith(opts.rootDir)
  //   ? normalizePath(relative(opts.rootDir, parentPath))
  //   : `@fs${maybeSlash}${parentPath}`;
  const qrlPath = `@fs${maybeSlash}${parentPath}`;
  const qrlFile = `${encode(qrlPath)}/${symbolName.toLowerCase()}.js?_qrl_parent=${encode(parentFile)}`;
  return [symbolName, `${import.meta.env.BASE_URL}${qrlFile}`];
};

// Create the Qwik Router express middleware
const { router, notFound, staticFile } = createQwikRouter({ symbolMapper });

export default (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: Connect.NextFunction
) => {
  staticFile(req, res, () => {
    router(req, res, () => {
      notFound(req, res, next);
    });
  });
};
